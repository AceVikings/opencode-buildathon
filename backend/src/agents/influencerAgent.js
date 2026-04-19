/**
 * Influencer Brand Intelligence — orchestrator
 *
 * Pipeline:
 *  1. BrandIntelAgent (this file)
 *     For each brand source, spawns scrapeWorker.js as a child process.
 *     All workers run in parallel — one process per source.
 *     Each worker receives its source via stdin JSON and returns extracted
 *     text via stdout JSON, then exits.
 *     The orchestrator collects all results and feeds the combined text to
 *     the LLM to synthesise a Brand Brief.
 *
 *  2. PersonaAgent
 *     Direct LLM call — takes the brand brief + persona fields and returns
 *     a refined bio and a portrait image-generation prompt.
 *
 * Architecture:
 *   ┌─ orchestrator (this process) ─────────────────────────────────┐
 *   │                                                               │
 *   │  sources[]  ──fork──▶  scrapeWorker (url)   ──▶  text        │
 *   │             ──fork──▶  scrapeWorker (pdf)   ──▶  text        │
 *   │             ──fork──▶  scrapeWorker (text)  ──▶  text        │
 *   │                                   ▼                          │
 *   │                         collect all texts                    │
 *   │                                   ▼                          │
 *   │                         LLM → Brand Brief                    │
 *   └───────────────────────────────────────────────────────────────┘
 */

const path = require('path')
const { spawn } = require('child_process')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')

const WORKER_PATH = path.resolve(__dirname, 'scrapeWorker.js')

// ── Model factory ─────────────────────────────────────────────────────────────

function getLLM(model = 'gemini-3-flash-preview') {
  return new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.4,
  })
}

// ── Subagent spawner ──────────────────────────────────────────────────────────

/**
 * Spawn scrapeWorker.js as a child process for a single source.
 * Sends the source as a JSON line on stdin, reads the result from stdout.
 *
 * @param {{ type: string, content: string, label?: string }} source
 * @param {number} timeoutMs  Max ms to wait for the worker (default 20 s)
 * @returns {Promise<{ ok: boolean, label: string, text?: string, error?: string }>}
 */
function spawnScrapeWorker(source, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const worker = spawn(process.execPath, [WORKER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      worker.kill('SIGTERM')
      settle({ ok: false, label: source.label || source.type, error: 'Worker timed out' })
    }, timeoutMs)

    worker.stdout.on('data', (d) => { stdout += d.toString() })
    worker.stderr.on('data', (d) => { stderr += d.toString() })

    worker.on('close', (code) => {
      if (stderr.trim()) {
        console.warn(`[scrapeWorker:${source.label || source.type}] stderr:`, stderr.trim())
      }
      try {
        const result = JSON.parse(stdout.trim())
        settle(result)
      } catch {
        settle({
          ok: false,
          label: source.label || source.type,
          error: `Worker exited (${code}) with unparseable output: ${stdout.slice(0, 200)}`,
        })
      }
    })

    worker.on('error', (err) => {
      settle({ ok: false, label: source.label || source.type, error: err.message })
    })

    // Send source to worker via stdin
    worker.stdin.write(JSON.stringify(source) + '\n')
    worker.stdin.end()
  })
}

// ── Agent 1: Brand Intelligence ───────────────────────────────────────────────

/**
 * Spawn one subagent per source in parallel, collect results, synthesise brief.
 *
 * @param {Array<{ type: 'text'|'pdf'|'url', content: string, label?: string }>} sources
 * @returns {Promise<string>} Markdown brand brief
 */
async function runBrandIntelAgent(sources) {
  if (!sources || sources.length === 0) return 'No brand sources provided.'

  console.log(`[BrandIntelAgent] Spawning ${sources.length} scrape worker(s)…`)

  // Spawn all workers concurrently
  const results = await Promise.all(sources.map((s) => spawnScrapeWorker(s)))

  // Log outcomes
  results.forEach((r) => {
    if (r.ok) {
      console.log(`[BrandIntelAgent] ✓ ${r.label} — ${(r.text ?? '').length} chars`)
    } else {
      console.warn(`[BrandIntelAgent] ✗ ${r.label} — ${r.error}`)
    }
  })

  const successful = results.filter((r) => r.ok && r.text)
  if (successful.length === 0) {
    return 'All brand sources failed to load. Cannot generate brief.'
  }

  // Combine extracted texts for the LLM
  const combinedText = successful
    .map((r) => `### Source: ${r.label}\n\n${r.text}`)
    .join('\n\n---\n\n')

  const llm = getLLM()

  const prompt = `You are a brand analyst. Below is the extracted content from ${successful.length} brand source(s).

${combinedText}

Based solely on the above content, write a comprehensive Brand Brief in clear markdown covering:
- Brand name & positioning
- Target audience
- Brand voice & tone
- Key products or services
- Visual aesthetic & style guidelines
- Core values & messaging pillars

Be specific and draw directly from the provided content.`

  const response = await llm.invoke([new HumanMessage(prompt)])
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
}

// ── Agent 2: Persona ──────────────────────────────────────────────────────────

/**
 * Refine the influencer bio and generate a portrait image prompt.
 *
 * @param {{ name, niche, bio, platforms, goal, brandBrief, imagePrompt }} input
 * @returns {Promise<{ refinedBio: string, imagePrompt: string }>}
 */
async function runPersonaAgent({ name, niche, bio, platforms = [], goal, brandBrief, imagePrompt }) {
  const llm = getLLM()

  const prompt = `You are a creative director building an AI influencer persona.

Produce two outputs:

1. REFINED_BIO — 2-3 sentence first-person social media bio that reflects the brand voice and niche.
2. IMAGE_PROMPT — Detailed photography-style portrait prompt covering: gender presentation, approximate age, distinctive physical features, clothing matching the brand aesthetic, setting, lighting, mood.

Influencer:
- Name: ${name}
- Niche: ${niche || 'lifestyle'}
- Platforms: ${platforms.join(', ') || 'X'}
- Goal: ${goal || 'Not specified'}
- Draft bio: ${bio || 'Not provided'}
- User appearance notes: ${imagePrompt || 'Not provided'}

Brand Brief:
${brandBrief || 'Not available.'}

Reply in this exact JSON (no markdown fences):
{"refinedBio":"...","imagePrompt":"..."}`

  const response = await llm.invoke([new HumanMessage(prompt)])
  const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const bioMatch = cleaned.match(/"refinedBio"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    const promptMatch = cleaned.match(/"imagePrompt"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    return {
      refinedBio: bioMatch?.[1] ?? bio ?? '',
      imagePrompt: promptMatch?.[1] ?? imagePrompt ?? '',
    }
  }
}

module.exports = { runBrandIntelAgent, runPersonaAgent }
