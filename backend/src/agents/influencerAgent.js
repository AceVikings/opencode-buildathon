/**
 * Influencer Brand Intelligence Agent
 *
 * Two-agent pipeline:
 *  1. BrandIntelAgent — LangChain ReAct agent with three inline tools:
 *       • fetch_url        : fetch + scrape a public webpage with axios + cheerio
 *       • parse_pdf        : extract text from a base64-encoded PDF with pdf-parse
 *       • ingest_text      : pass raw text through verbatim
 *     Synthesises all sources into a structured brand brief.
 *
 *  2. PersonaAgent — direct LLM call (no tools) that refines bio + writes
 *     an image-generation prompt from the brand brief + persona fields.
 *
 * Why no MCP / subprocess:
 *   The original code spawned brandIntelServer.js via stdio which requires
 *   @modelcontextprotocol/sdk (not in package.json) and a fragile child-process
 *   lifecycle. Defining the tools inline with DynamicStructuredTool is simpler,
 *   faster, and avoids all those issues.
 */

const axios = require('axios')
const cheerio = require('cheerio')
const pdfParse = require('pdf-parse')
const { z } = require('zod')
const { DynamicStructuredTool } = require('@langchain/core/tools')
const { createReactAgent } = require('@langchain/langgraph/prebuilt')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')

// ── Model factory ─────────────────────────────────────────────────────────────

function getLLM(model = 'gemini-3-flash-preview') {
  return new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.4,
  })
}

// ── Inline tools ──────────────────────────────────────────────────────────────

/** Strip HTML noise and return up to 20,000 chars of readable text */
function scrapeHtml(html) {
  const $ = cheerio.load(html)
  $('script,style,nav,footer,header,iframe,noscript,[role="navigation"]').remove()
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000)
}

const fetchUrlTool = new DynamicStructuredTool({
  name: 'fetch_url',
  description: 'Fetch a public URL and return the main text content (up to 20,000 chars). Use this to ingest a brand website or any online document.',
  schema: z.object({
    url: z.string().url().describe('Full HTTP/HTTPS URL to fetch'),
  }),
  func: async ({ url }) => {
    try {
      const resp = await axios.get(url, {
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
        headers: {
          'User-Agent': 'LoqueBot/1.0 (brand intelligence)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        // Follow redirects
        maxRedirects: 5,
      })
      const ct = resp.headers['content-type'] ?? ''
      if (ct.includes('html')) return scrapeHtml(resp.data)
      if (typeof resp.data === 'string') return resp.data.slice(0, 20000)
      return JSON.stringify(resp.data).slice(0, 20000)
    } catch (err) {
      return `Error fetching ${url}: ${err.message}`
    }
  },
})

const parsePdfTool = new DynamicStructuredTool({
  name: 'parse_pdf',
  description: 'Extract text from a base64-encoded PDF and return up to 30,000 chars.',
  schema: z.object({
    base64Pdf: z.string().describe('Base64-encoded PDF file content'),
    filename: z.string().optional().describe('Original filename for context'),
  }),
  func: async ({ base64Pdf, filename }) => {
    try {
      const buffer = Buffer.from(base64Pdf, 'base64')
      const result = await pdfParse(buffer)
      const text = (result.text ?? '').trim().slice(0, 30000)
      return text || `No text found in PDF${filename ? ` (${filename})` : ''}.`
    } catch (err) {
      return `PDF parse error${filename ? ` for ${filename}` : ''}: ${err.message}`
    }
  },
})

const ingestTextTool = new DynamicStructuredTool({
  name: 'ingest_text',
  description: 'Accept raw text (brand copy, guidelines, etc.) and return it cleaned.',
  schema: z.object({
    text: z.string().min(1).describe('Raw text to ingest'),
    label: z.string().optional().describe('Short label for this text chunk'),
  }),
  func: async ({ text, label }) => {
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 10000)
    return `[${label ?? 'Manual text'}]\n${cleaned}`
  },
})

const brandTools = [fetchUrlTool, parsePdfTool, ingestTextTool]

// ── Agent 1: Brand Intelligence ───────────────────────────────────────────────

/**
 * Ingest all brand sources and synthesise them into a brand brief.
 *
 * @param {Array<{ type: 'text'|'pdf'|'url', content: string, label?: string }>} sources
 * @returns {Promise<string>} Markdown brand brief
 */
async function runBrandIntelAgent(sources) {
  if (!sources || sources.length === 0) return 'No brand sources provided.'

  const agent = createReactAgent({ llm: getLLM(), tools: brandTools })

  const sourceInstructions = sources.map((s, i) => {
    if (s.type === 'url') {
      return `Source ${i + 1} (URL): use fetch_url to retrieve: ${s.content}`
    }
    if (s.type === 'pdf') {
      return `Source ${i + 1} (PDF "${s.label ?? 'document'}"): use parse_pdf with base64Pdf="${s.content.slice(0, 60)}…" and filename="${s.label ?? 'document.pdf'}"`
    }
    return `Source ${i + 1} (text "${s.label ?? 'manual'}"): use ingest_text with this content:\n${s.content}`
  }).join('\n\n')

  const prompt = `You are a brand analyst. Ingest the following brand sources using the available tools, then write a comprehensive Brand Brief covering:
- Brand name & positioning
- Target audience
- Brand voice & tone
- Key products or services
- Visual aesthetic & style guidelines
- Core values & messaging pillars

Sources:
${sourceInstructions}

After processing all sources, output the final Brand Brief in clear markdown.`

  const result = await agent.invoke({ messages: [new HumanMessage(prompt)] })
  const last = result.messages[result.messages.length - 1]
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
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
