/**
 * Long-Term Agent
 *
 * Strategic analysis agent that runs periodically (or on demand) to build
 * and update a brand strategy document for each influencer.
 *
 * Pipeline:
 *  1. Load the influencer's top-performing XPost records (ranked by engagement)
 *  2. Load recent AgentLog decision summaries from the short-term agent
 *  3. Use web_search to research competitor content, trending formats, and
 *     what's working in the influencer's niche right now
 *  4. Synthesise everything into a strategic guidance document stored on
 *     the Influencer record (inf.longTermStrategy)
 *  5. Write an AgentLog with full reasoning trace
 *
 * The short-term agent reads inf.longTermStrategy before composing each post,
 * so this agent effectively steers post quality over time.
 *
 * Tools available:
 *   analyse_post_history  — structured summary of top/recent XPosts
 *   analyse_agent_logs    — recent short-term agent decision summaries
 *   web_search            — research competitors + niche trends
 *   write_strategy        — signal tool to finalise the strategy document
 */

const { z } = require('zod')

async function safeJson(res) {
  const text = await res.text().catch(() => '')
  if (!text.trim()) return {}
  try { return JSON.parse(text) } catch { return { _raw: text } }
}
const { DynamicStructuredTool } = require('@langchain/core/tools')
const { createReactAgent } = require('@langchain/langgraph/prebuilt')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')
const AgentLog = require('../models/AgentLog')
const XPost = require('../models/XPost')
const Influencer = require('../models/Influencer')

const MAX_STEPS = 12

// ── LLM ───────────────────────────────────────────────────────────────────────

function getLLM() {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-3-flash-preview',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.5,
  })
}

// ── Tool: analyse_post_history ────────────────────────────────────────────────

function makePostHistoryTool(influencerId) {
  return new DynamicStructuredTool({
    name: 'analyse_post_history',
    description: 'Load and summarise the influencer\'s top-performing posts by engagement. Returns text, engagement score, and agent decision summary for each.',
    schema: z.object({
      limit: z.number().optional().describe('How many top posts to return (default 10)'),
    }),
    func: async ({ limit = 10 }) => {
      const posts = await XPost.find({ influencerId })
        .sort({ 'metrics.engagements': -1 })
        .limit(limit)
        .lean()

      if (posts.length === 0) return 'No posts found yet.'

      const lines = posts.map((p, i) => {
        const m = p.metrics ?? {}
        const score = (m.impressions ?? 0) + (m.engagements ?? 0) * 5 + (m.likes ?? 0) * 3
        return [
          `#${i + 1} [score ${score}] "${p.text}"`,
          `  Posted: ${new Date(p.postedAt).toISOString().slice(0, 10)}`,
          `  Impressions: ${m.impressions ?? '?'} | Engagements: ${m.engagements ?? '?'} | Likes: ${m.likes ?? '?'} | Retweets: ${m.retweets ?? '?'}`,
          p.agentDecisionSummary ? `  Agent reasoning: ${p.agentDecisionSummary}` : '',
        ].filter(Boolean).join('\n')
      })

      return `Top ${posts.length} posts by engagement:\n\n${lines.join('\n\n')}`
    },
  })
}

// ── Tool: analyse_agent_logs ──────────────────────────────────────────────────

function makeAgentLogsTool(influencerId) {
  return new DynamicStructuredTool({
    name: 'analyse_agent_logs',
    description: 'Load recent short-term agent decision summaries to understand what reasoning patterns led to posts.',
    schema: z.object({
      limit: z.number().optional().describe('How many recent logs to return (default 20)'),
    }),
    func: async ({ limit = 20 }) => {
      const logs = await AgentLog.find({ influencerId, agentType: 'short_term', status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

      if (logs.length === 0) return 'No short-term agent runs found yet.'

      const lines = logs.map((l, i) =>
        `#${i + 1} ${new Date(l.createdAt).toISOString().slice(0, 16)}: ${l.summary ?? '(no summary)'}`
      )

      return `Recent short-term agent decisions (${logs.length}):\n${lines.join('\n')}`
    },
  })
}

// ── Tool: web_search ──────────────────────────────────────────────────────────

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web to research competitor accounts, successful content formats, and what\'s resonating in a specific niche right now.',
  schema: z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().optional().describe('Results to return (1–5, default 4)'),
  }),
  func: async ({ query, numResults = 4 }) => {
    try {
      const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY
      const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID

      if (GOOGLE_CSE_KEY && GOOGLE_CSE_ID) {
        const qs = new URLSearchParams({ key: GOOGLE_CSE_KEY, cx: GOOGLE_CSE_ID, q: query, num: String(Math.min(numResults, 5)) })
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${qs}`)
        const json = await safeJson(res)
        return (json.items ?? []).map(item =>
          `**${item.title}**\n${item.snippet}\n${item.link}`
        ).join('\n\n') || 'No results.'
      }

      const qs = new URLSearchParams({ q: query, format: 'json', no_html: '1', skip_disambig: '1' })
      const res = await fetch(`https://api.duckduckgo.com/?${qs}`)
      const json = await safeJson(res)
      const parts = []
      if (json.AbstractText) parts.push(json.AbstractText)
      ;(json.RelatedTopics ?? []).slice(0, numResults).forEach(t => { if (t.Text) parts.push(t.Text) })
      return parts.join('\n\n') || `No results for: ${query}`
    } catch (err) {
      return `Web search failed: ${err.message}`
    }
  },
})

// ── Tool: write_strategy ──────────────────────────────────────────────────────

let _strategyDoc = null

function makeWriteStrategyTool() {
  _strategyDoc = null
  return new DynamicStructuredTool({
    name: 'write_strategy',
    description: 'Finalise and save the long-term brand strategy document. Call this ONCE when your analysis is complete.',
    schema: z.object({
      strategy: z.string().describe('The full strategy document in markdown. Should cover: what content formats work, optimal posting patterns, competitor insights, what to lean into, what to avoid, and 3-5 specific guidance points for the short-term agent.'),
      summary: z.string().describe('2-3 sentence executive summary of the key strategic direction'),
    }),
    func: async ({ strategy, summary }) => {
      _strategyDoc = { strategy, summary }
      return `Strategy document saved (${strategy.length} chars). Summary: ${summary}`
    },
  })
}

// ── Step recorder ─────────────────────────────────────────────────────────────

function extractSteps(messages) {
  const steps = []
  for (const msg of messages) {
    const role = msg.constructor?.name ?? msg._getType?.() ?? 'unknown'
    if (role === 'HumanMessage') continue
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    if (role === 'AIMessage' || role === 'ai') {
      if (msg.tool_calls?.length > 0) {
        for (const tc of msg.tool_calls) {
          steps.push({ type: 'tool_call', tool: tc.name, content: JSON.stringify(tc.args) })
        }
      } else if (content.trim()) {
        steps.push({ type: 'thought', tool: null, content })
      }
    } else if (role === 'ToolMessage' || role === 'tool') {
      steps.push({ type: 'tool_result', tool: msg.name ?? null, content })
    }
  }
  return steps
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the long-term strategy agent for a specific influencer.
 *
 * @param {string} influencerId
 * @param {string} uid  Firebase uid of the owning user
 * @returns {Promise<import('../models/AgentLog').default>}
 */
async function runLongTermAgent(influencerId, uid) {
  const started = Date.now()

  const log = await AgentLog.create({
    influencerId,
    uid,
    agentType: 'long_term',
    status: 'running',
    steps: [],
  })

  try {
    const inf = await Influencer.findById(influencerId)
    if (!inf) throw new Error('Influencer not found')

    const writeStrategyTool = makeWriteStrategyTool()
    const tools = [
      makePostHistoryTool(influencerId),
      makeAgentLogsTool(influencerId),
      webSearchTool,
      writeStrategyTool,
    ]

    const agent = createReactAgent({
      llm: getLLM(),
      tools,
      maxIterations: MAX_STEPS,
    })

    const systemPrompt = `You are a long-term brand strategist for an AI influencer.

Influencer: "${inf.name}"
Niche: ${inf.niche || 'lifestyle'}
Goal: ${inf.goal || 'grow audience and engagement'}
Platforms: X (Twitter)

Previous strategy (if any):
${inf.longTermStrategy || 'None yet — this is the first strategy run.'}

Your task is to build a data-driven strategic guidance document by:
1. Calling analyse_post_history to understand what content has performed best and why
2. Calling analyse_agent_logs to see what the short-term agent has been doing
3. Using web_search (2-3 targeted searches) to:
   - Find top-performing accounts in the "${inf.niche || 'lifestyle'}" niche
   - Identify successful content formats and patterns on X right now
   - Check what competitors are doing and where there are gaps to exploit
4. Synthesising all findings into a strategy document by calling write_strategy

The strategy document should give the short-term agent clear, actionable guidance:
- What content angles resonate with the audience
- What tone and style works best
- Which trends to engage with vs ignore
- Specific formats that drive engagement (threads, questions, hot takes, etc.)
- Competitor weaknesses to exploit
- 3-5 concrete tactical recommendations for the next 30 days`

    const result = await agent.invoke({
      messages: [new HumanMessage(systemPrompt)],
    })

    const steps = extractSteps(result.messages)

    if (!_strategyDoc) {
      throw new Error('Agent completed without calling write_strategy — no strategy was produced')
    }

    // Save strategy back to influencer
    inf.longTermStrategy = _strategyDoc.strategy
    inf.longTermStrategyUpdatedAt = new Date()
    await inf.save()

    steps.push({
      type: 'decision',
      tool: null,
      content: `Strategy updated. Summary: ${_strategyDoc.summary}`,
    })

    log.steps = steps
    log.summary = _strategyDoc.summary
    log.status = 'completed'
    log.durationMs = Date.now() - started
    await log.save()

    console.log(`[LongTermAgent] ✓ influencer=${influencerId} strategy updated (${_strategyDoc.strategy.length} chars)`)
    return log
  } catch (err) {
    log.status = 'failed'
    log.error = err.message
    log.durationMs = Date.now() - started
    await log.save()
    console.error(`[LongTermAgent] ✗ influencer=${influencerId}:`, err.message)
    return log
  }
}

module.exports = { runLongTermAgent }
