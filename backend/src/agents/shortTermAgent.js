/**
 * Short-Term Agent
 *
 * Autonomous posting agent that runs on demand for a specific influencer.
 *
 * Pipeline:
 *  1. Fetch current X trends (personalized if X connected, else worldwide WOEID=1)
 *  2. Web-search for post ideas relevant to the trends + influencer niche/goal
 *  3. Read the influencer's long-term strategy guidance (from LongTermAgent)
 *  4. Reason about what to post (ReAct loop — tools: get_trends, web_search, draft_post)
 *  5. Post the final tweet to X via the influencer's connected account
 *  6. Save an AgentLog with full reasoning trace + decision summary
 *  7. Stamp the agentDecisionSummary on the resulting XPost
 *
 * Tools available to the agent:
 *   get_trends       — fetch X trends for this influencer (personalized or WOEID)
 *   web_search       — search the web for post inspiration / competitor content
 *   draft_post       — signal the agent's final tweet text (terminates the loop)
 *
 * The agent is given a hard cap of 10 reasoning steps to prevent runaway loops.
 */

const axios = require('axios')
const { z } = require('zod')
const { DynamicStructuredTool } = require('@langchain/core/tools')
const { createReactAgent } = require('@langchain/langgraph/prebuilt')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')
const AgentLog = require('../models/AgentLog')
const XPost = require('../models/XPost')
const XConnection = require('../models/XConnection')
const Influencer = require('../models/Influencer')

const MAX_STEPS = 10
const BEARER = () => process.env.X_BEARER_TOKEN
const X_BASE = 'https://api.x.com/2'

// ── LLM ───────────────────────────────────────────────────────────────────────

function getLLM() {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-3-flash-preview',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7,
  })
}

// ── Token refresh util ────────────────────────────────────────────────────────

async function getValidToken(conn) {
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    const clientId = process.env.X_CLIENT_ID
    const clientSecret = process.env.X_CLIENT_SECRET
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    if (!clientSecret) params.append('client_id', clientId)
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const { data } = await axios.post('https://api.x.com/2/oauth2/token', params.toString(), { headers })
    conn.accessToken = data.access_token
    if (data.refresh_token) conn.refreshToken = data.refresh_token
    conn.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    await conn.save()
  }
  return conn.accessToken
}

// ── Tool: get_trends ──────────────────────────────────────────────────────────

function makeTrendsTool(influencer, conn) {
  return new DynamicStructuredTool({
    name: 'get_trends',
    description: 'Fetch current trending topics on X. Returns trend names and post counts with timestamps.',
    schema: z.object({
      woeid: z.number().optional().describe('WOEID for location trends — default 1 (worldwide). Only used when no personal X token is available.'),
    }),
    func: async ({ woeid = 1 }) => {
      try {
        // Use personalized trends if the influencer has an X connection
        if (conn) {
          const token = await getValidToken(conn)
          const { data } = await axios.get(
            `${X_BASE}/users/personalized_trends?personalized_trend.fields=trend_name,post_count,category,trending_since`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const trends = (data.data ?? []).map(t =>
            `${t.trend_name} (${t.post_count ?? '?'} posts, since ${t.trending_since ?? 'now'}, category: ${t.category ?? 'general'})`
          ).join('\n')
          return `Personalized X trends for @${conn.xUsername}:\n${trends || 'No trends found.'}`
        }

        // Fall back to worldwide Bearer Token trends
        const { data } = await axios.get(
          `${X_BASE}/trends/by/woeid/${woeid}?max_trends=20&trend.fields=trend_name,tweet_count`,
          { headers: { Authorization: `Bearer ${BEARER()}` } }
        )
        const trends = (data.data ?? []).map(t =>
          `${t.trend_name} (${t.tweet_count ?? '?'} tweets)`
        ).join('\n')
        return `Worldwide X trends (WOEID ${woeid}):\n${trends || 'No trends found.'}`
      } catch (err) {
        return `Trends fetch failed: ${err?.response?.data?.detail ?? err.message}`
      }
    },
  })
}

// ── Tool: web_search ──────────────────────────────────────────────────────────

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web for content ideas, competitor posts, or topic research. Returns titles and snippets.',
  schema: z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().optional().describe('Number of results to return (1–5, default 3)'),
  }),
  func: async ({ query, numResults = 3 }) => {
    try {
      // Use Google Custom Search API if configured, otherwise DuckDuckGo instant answer
      const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY
      const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID

      if (GOOGLE_CSE_KEY && GOOGLE_CSE_ID) {
        const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: { key: GOOGLE_CSE_KEY, cx: GOOGLE_CSE_ID, q: query, num: Math.min(numResults, 5) },
        })
        const results = (data.items ?? []).map(item =>
          `**${item.title}**\n${item.snippet}\nURL: ${item.link}`
        ).join('\n\n')
        return results || 'No results found.'
      }

      // Fallback: DuckDuckGo Instant Answer API (no key required, limited)
      const { data } = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
        timeout: 10000,
      })
      const parts = []
      if (data.AbstractText) parts.push(data.AbstractText)
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, numResults).forEach(t => {
          if (t.Text) parts.push(t.Text)
        })
      }
      return parts.join('\n\n') || `No instant answer found for: ${query}`
    } catch (err) {
      return `Web search failed: ${err.message}`
    }
  },
})

// ── Tool: draft_post ──────────────────────────────────────────────────────────
// This is a signal tool — when the agent calls it, we know the final tweet text.
// The agent must call this exactly once to finalise its decision.

let _draftedTweet = null  // module-level slot, reset per run

function makeDraftPostTool() {
  _draftedTweet = null
  return new DynamicStructuredTool({
    name: 'draft_post',
    description: 'Finalise and submit your tweet. Call this ONCE with the final tweet text (max 280 chars). The tweet will be posted immediately.',
    schema: z.object({
      text: z.string().max(280).describe('The final tweet text to post (max 280 characters)'),
      reasoning: z.string().describe('1-2 sentence explanation of why this post will perform well given current trends and the brand strategy'),
    }),
    func: async ({ text, reasoning }) => {
      _draftedTweet = { text: text.trim(), reasoning }
      return `Tweet drafted: "${text.trim()}" — Reasoning: ${reasoning}`
    },
  })
}

// ── Step recorder helper ──────────────────────────────────────────────────────

function extractSteps(messages) {
  const steps = []
  for (const msg of messages) {
    const role = msg.constructor?.name ?? msg._getType?.() ?? 'unknown'
    if (role === 'HumanMessage') continue

    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)

    if (role === 'AIMessage' || role === 'ai') {
      // Check for tool calls
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
 * Run the short-term agent for a specific influencer.
 * Creates an AgentLog, runs the ReAct loop, posts the tweet, returns the log.
 *
 * @param {string} influencerId
 * @param {string} uid  Firebase uid of the owning user
 * @returns {Promise<import('../models/AgentLog').default>}
 */
async function runShortTermAgent(influencerId, uid) {
  const started = Date.now()

  const log = await AgentLog.create({
    influencerId,
    uid,
    agentType: 'short_term',
    status: 'running',
    steps: [],
  })

  try {
    const inf = await Influencer.findById(influencerId)
    if (!inf) throw new Error('Influencer not found')

    const conn = inf.xConnectionId
      ? await XConnection.findById(inf.xConnectionId)
      : null

    if (!conn) throw new Error('No X account connected to this influencer')

    // Build tools for this run
    const draftTool = makeDraftPostTool()
    const tools = [makeTrendsTool(inf, conn), webSearchTool, draftTool]

    const agent = createReactAgent({
      llm: getLLM(),
      tools,
      maxIterations: MAX_STEPS,
    })

    const systemPrompt = `You are an autonomous social media agent managing the X (Twitter) account for an AI influencer named "${inf.name}".

Influencer profile:
- Niche: ${inf.niche || 'lifestyle'}
- Current goal: ${inf.goal || 'grow audience and engagement'}
- Bio: ${inf.bio || 'Not set'}

Long-term brand strategy guidance:
${inf.longTermStrategy || 'No long-term strategy set yet — use your best judgement based on the niche and goal.'}

Your task:
1. Use get_trends to fetch current trending topics on X
2. Use web_search to research 1-2 angles that connect a trend to this influencer's niche and goal
3. Decide on the best tweet to post — it must be on-brand, timely, and likely to drive engagement
4. Call draft_post ONCE with your final tweet text and a brief reasoning

Rules:
- Tweet must be ≤280 characters
- Be authentic to the influencer's voice — not corporate-speak
- Prioritise trends relevant to the niche
- Do not use placeholder text or hashtag spam`

    const result = await agent.invoke({
      messages: [new HumanMessage(systemPrompt)],
    })

    const steps = extractSteps(result.messages)

    if (!_draftedTweet) {
      throw new Error('Agent completed without calling draft_post — no tweet was composed')
    }

    // Post the tweet
    const accessToken = await getValidToken(conn)
    const { data: tweetResp } = await axios.post(
      'https://api.x.com/2/tweets',
      { text: _draftedTweet.text },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    const tweet = tweetResp.data

    // Persist XPost with decision summary
    const xpost = await XPost.create({
      influencerId: inf._id.toString(),
      uid,
      tweetId: tweet.id,
      text: tweet.text ?? _draftedTweet.text,
      postedAt: new Date(),
      agentDecisionSummary: _draftedTweet.reasoning,
    })

    // Finalise log
    steps.push({
      type: 'decision',
      tool: null,
      content: `Posted tweet: "${_draftedTweet.text}" | Reasoning: ${_draftedTweet.reasoning}`,
    })

    log.steps = steps
    log.summary = `Posted: "${_draftedTweet.text}" — ${_draftedTweet.reasoning}`
    log.xPostId = xpost._id.toString()
    log.status = 'completed'
    log.durationMs = Date.now() - started
    await log.save()

    console.log(`[ShortTermAgent] ✓ influencer=${influencerId} tweet="${_draftedTweet.text.slice(0, 50)}…"`)
    return log
  } catch (err) {
    log.status = 'failed'
    log.error = err.message
    log.durationMs = Date.now() - started
    await log.save()
    console.error(`[ShortTermAgent] ✗ influencer=${influencerId}:`, err.message)
    return log
  }
}

module.exports = { runShortTermAgent }
