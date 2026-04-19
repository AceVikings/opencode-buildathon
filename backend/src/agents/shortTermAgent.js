/**
 * Short-Term Agent
 *
 * Pipeline:
 *  1. Fetch X trends (personalised if connected, else worldwide)
 *  2. Web-search for content angles
 *  3. Read long-term strategy guidance
 *  4. ReAct loop decides on tweet text + video script
 *  5. Generate HeyGen video from influencer's avatar + script
 *  6. Poll HeyGen until video is ready
 *  7a. postApprovalMode === 'auto'    → post tweet + video to X immediately
 *  7b. postApprovalMode === 'approve' → save as pending_approval, no X post yet
 *  8. Write AgentLog with full trace
 *
 * Manual post (opts.manual = true) skips the ReAct trend-research loop and
 * uses opts.topic + opts.customScript directly to generate the video/tweet.
 */

const { z } = require('zod')
const { DynamicStructuredTool } = require('@langchain/core/tools')
const { createReactAgent } = require('@langchain/langgraph/prebuilt')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')
const AgentLog   = require('../models/AgentLog')
const XPost      = require('../models/XPost')
const XConnection = require('../models/XConnection')
const Influencer = require('../models/Influencer')
const { createVideo, getVideoStatus } = require('../services/heygenService')

const MAX_STEPS = 10
const BEARER = () => process.env.X_BEARER_TOKEN
const X_BASE = 'https://api.x.com/2'

// ── LLM ───────────────────────────────────────────────────────────────────────

function getLLM(temp = 0.7) {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-3-flash-preview',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: temp,
  })
}

// ── X token refresh ───────────────────────────────────────────────────────────

async function getValidToken(conn) {
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    const clientId = process.env.X_CLIENT_ID
    const clientSecret = process.env.X_CLIENT_SECRET
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    if (!clientSecret) params.append('client_id', clientId)
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: params.toString() })
    const data = await res.json()
    conn.accessToken = data.access_token
    if (data.refresh_token) conn.refreshToken = data.refresh_token
    conn.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    await conn.save()
  }
  return conn.accessToken
}

// ── Fetch current trends (for context injection) ───────────────────────────

async function fetchTrends(conn) {
  try {
    if (conn) {
      const token = await getValidToken(conn)
      const res = await fetch(
        `${X_BASE}/users/personalized_trends?personalized_trend.fields=trend_name,post_count,category,trending_since`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json()
      return (json.data ?? []).slice(0, 15).map(t =>
        `${t.trend_name} (${t.post_count ?? '?'} posts, category: ${t.category ?? 'general'})`
      ).join('\n')
    }
    const bearer = BEARER()
    if (!bearer) return ''
    const res = await fetch(
      `${X_BASE}/trends/by/woeid/1?max_trends=15&trend.fields=trend_name,tweet_count`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    )
    const json = await res.json()
    return (json.data ?? []).map(t => `${t.trend_name} (${t.tweet_count ?? '?'} tweets)`).join('\n')
  } catch { return '' }
}

// ── Script generation (Gemini) ────────────────────────────────────────────────

/**
 * Generate a casual, natural video script (15–30 s) and a matching tweet caption.
 *
 * @param {object} params
 * @returns {Promise<{ script: string, tweetText: string, reasoning: string }>}
 */
async function generateScriptAndTweet({ inf, topic, trends, guidance, brandBrief }) {
  const llm = getLLM(0.8)

  // Build a rich personality block so the LLM fully inhabits the character
  const personalityBlock = [
    `Name: ${inf.name}`,
    inf.niche        && `Niche: ${inf.niche}`,
    inf.goal         && `Current goal: ${inf.goal}`,
    inf.bio          && `Bio / Personality:\n${inf.bio}`,
    brandBrief       && `Brand brief (from scraped sources):\n${brandBrief}`,
    guidance         && `Long-term strategy guidance:\n${guidance}`,
  ].filter(Boolean).join('\n\n')

  const prompt = `You are writing a social media video script that will be performed by an AI influencer avatar.
You must write ENTIRELY in the influencer's voice — their personality, tone, and style must come through naturally.

━━━ INFLUENCER PERSONA ━━━
${personalityBlock}

━━━ CONTEXT ━━━
${trends ? `Trending on X right now:\n${trends}\n` : ''}
${topic ? `Topic to cover: ${topic}` : ''}

━━━ YOUR TASK ━━━
Generate three things:

1. VIDEO_SCRIPT
   - The exact words the influencer will speak. No stage directions, no timecodes, no brackets.
   - First person, direct-to-camera, conversational. Use contractions, natural pauses (commas), rhetorical questions.
   - Voice must match the bio and brand brief above — if they're edgy and witty, be edgy and witty; if warm and aspirational, be that.
   - 32–65 words (~15–30 seconds at 130 wpm). Count carefully — err on the short side.
   - End with a clear call-to-action or memorable hook.

2. TWEET_TEXT
   - Caption to post with the video. Max 240 characters.
   - Same voice as the script.
   - No hashtag spam — at most 1–2 relevant hashtags.

3. REASONING
   - 1–2 sentences on why this angle will resonate given the persona and current trends.

Reply ONLY in this JSON (no markdown fences, no extra keys):
{"script":"...","tweetText":"...","reasoning":"..."}`

  const res = await llm.invoke([new HumanMessage(prompt)])
  const raw = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // Graceful regex fallback
    const s = cleaned.match(/"script"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    const t = cleaned.match(/"tweetText"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    const r = cleaned.match(/"reasoning"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    return {
      script: s?.[1]?.replace(/\\n/g, '\n') ?? `Talking about trends in ${inf.niche}.`,
      tweetText: t?.[1] ?? `New post from ${inf.name}`,
      reasoning: r?.[1] ?? 'Trend-aligned content',
    }
  }
}

// ── ReAct tools (autonomous mode) ─────────────────────────────────────────────

function makeTrendsTool(conn) {
  return new DynamicStructuredTool({
    name: 'get_trends',
    description: 'Fetch current trending topics on X.',
    schema: z.object({ woeid: z.number().optional() }),
    func: async ({ woeid = 1 }) => {
      try {
        if (conn) {
          const token = await getValidToken(conn)
          const res = await fetch(
            `${X_BASE}/users/personalized_trends?personalized_trend.fields=trend_name,post_count,category,trending_since`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const json = await res.json()
          return (json.data ?? []).map(t =>
            `${t.trend_name} (${t.post_count ?? '?'} posts, category: ${t.category ?? 'general'})`
          ).join('\n') || 'No trends found.'
        }
        const res = await fetch(
          `${X_BASE}/trends/by/woeid/${woeid}?max_trends=20&trend.fields=trend_name,tweet_count`,
          { headers: { Authorization: `Bearer ${BEARER()}` } }
        )
        const json = await res.json()
        return (json.data ?? []).map(t => `${t.trend_name} (${t.tweet_count ?? '?'} tweets)`).join('\n') || 'No trends found.'
      } catch (err) { return `Trends fetch failed: ${err.message}` }
    },
  })
}

const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web for content ideas or inspiration.',
  schema: z.object({ query: z.string(), numResults: z.number().optional() }),
  func: async ({ query, numResults = 3 }) => {
    try {
      const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY
      const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID
      if (GOOGLE_CSE_KEY && GOOGLE_CSE_ID) {
        const qs = new URLSearchParams({ key: GOOGLE_CSE_KEY, cx: GOOGLE_CSE_ID, q: query, num: String(Math.min(numResults, 5)) })
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${qs}`)
        const json = await res.json()
        return (json.items ?? []).map(i => `${i.title}\n${i.snippet}`).join('\n\n') || 'No results.'
      }
      const qs = new URLSearchParams({ q: query, format: 'json', no_html: '1', skip_disambig: '1' })
      const res = await fetch(`https://api.duckduckgo.com/?${qs}`)
      const json = await res.json()
      const parts = [json.AbstractText, ...(json.RelatedTopics ?? []).slice(0, numResults).map(t => t.Text)].filter(Boolean)
      return parts.join('\n\n') || `No results for: ${query}`
    } catch (err) { return `Search failed: ${err.message}` }
  },
})

let _decision = null
function makeDraftTool(allowPostTypeChoice = false) {
  _decision = null
  return new DynamicStructuredTool({
    name: 'decide_topic',
    description: 'Lock in the topic, angle, and post format for this post. Call exactly once.',
    schema: z.object({
      topic: z.string().describe('What the post is about — be specific'),
      reasoning: z.string().describe('Why this topic/angle will perform well'),
      postType: z.enum(['text', 'video']).describe(
        allowPostTypeChoice
          ? 'Choose "video" for high-engagement visual content (demos, announcements, reactions) or "text" for quick takes, opinions, and thread-style content'
          : 'Post format — always "video" unless overridden'
      ),
    }),
    func: async ({ topic, reasoning, postType }) => {
      _decision = { topic, reasoning, postType }
      return `Topic locked: "${topic}" as ${postType} post`
    },
  })
}

// ── HeyGen video poll ─────────────────────────────────────────────────────────

async function waitForVideo(influencerId, videoId, maxWaitMs = 5 * 60_000) {
  const deadline = Date.now() + maxWaitMs
  let checkMs = 8_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, checkMs))
    const status = await getVideoStatus(videoId)
    if (status.status === 'completed') return status
    if (status.status === 'failed') throw new Error(`HeyGen video ${videoId} failed: ${status.failureMessage}`)
    checkMs = Math.min(checkMs * 1.5, 20_000)
  }
  throw new Error(`HeyGen video ${videoId} timed out after ${maxWaitMs / 1000}s`)
}

// ── Post tweet to X ────────────────────────────────────────────────────────────

async function postToX(conn, tweetText) {
  const accessToken = await getValidToken(conn)
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: tweetText }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`X post failed: ${JSON.stringify(data)}`)
  return data.data
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
        for (const tc of msg.tool_calls) steps.push({ type: 'tool_call', tool: tc.name, content: JSON.stringify(tc.args) })
      } else if (content.trim()) steps.push({ type: 'thought', tool: null, content })
    } else if (role === 'ToolMessage' || role === 'tool') {
      steps.push({ type: 'tool_result', tool: msg.name ?? null, content })
    }
  }
  return steps
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the short-term agent.
 *
 * @param {string} influencerId
 * @param {string} uid
 * @param {object} [opts]
 * @param {boolean} [opts.manual]         - skip ReAct, use opts.topic directly
 * @param {string}  [opts.topic]          - topic override for manual posts
 * @param {string}  [opts.customScript]   - fully custom script (skips Gemini generation)
 * @param {'text'|'video'|'auto'} [opts.postType]
 *   'text'  = tweet only, no video
 *   'video' = always generate a video (default for auto-schedule)
 *   'auto'  = agent decides based on topic/context
 * @returns {Promise<import('../models/AgentLog')>}
 */
async function runShortTermAgent(influencerId, uid, opts = {}) {
  const started = Date.now()

  const log = await AgentLog.create({
    influencerId, uid, agentType: 'short_term', status: 'running', steps: [],
  })

  try {
    const inf = await Influencer.findById(influencerId)
    if (!inf) throw new Error('Influencer not found')
    if (!inf.heygenAvatarId) throw new Error('No HeyGen avatar selected — complete Step 3 first')

    const conn = inf.xConnectionId ? await XConnection.findById(inf.xConnectionId) : null
    if (!conn) throw new Error('No X account connected to this influencer')

    const steps = []
    let topic = opts.topic ?? null
    let reasoning = ''
    // Resolve post type — 'auto' defers to the agent's decide_topic call
    const requestedPostType = opts.postType ?? 'video'  // default to video for scheduled runs
    const allowAgentChoose = requestedPostType === 'auto'

    // ── Phase 1: decide topic (and post type if auto) ──────────────────────
    if (opts.manual && topic && requestedPostType !== 'auto') {
      // Manual post with explicit type — skip ReAct, just note the decision
      reasoning = `Manual ${requestedPostType} post requested on topic: ${topic}`
      steps.push({ type: 'decision', tool: null, content: reasoning })
      _decision = { topic, reasoning, postType: requestedPostType }
    } else {
      // ReAct loop — agent picks topic; also picks post type when allowAgentChoose
      const draftTool = makeDraftTool(allowAgentChoose)
      const agent = createReactAgent({
        llm: getLLM(),
        tools: [makeTrendsTool(conn), webSearchTool, draftTool],
        maxIterations: MAX_STEPS,
      })

      const postTypeInstruction = allowAgentChoose
        ? `4. In decide_topic, also choose postType:
   - "video" for high-engagement visual moments (product demos, reactions, announcements)
   - "text" for quick takes, opinions, hot takes, breaking news commentary`
        : `Post format is fixed to "${requestedPostType}".`

      const systemPrompt = `You are an autonomous content strategist for an AI influencer.

━━━ INFLUENCER PERSONA ━━━
Name: ${inf.name}
Niche: ${inf.niche || 'lifestyle'}
Goal: ${inf.goal || 'grow audience'}
${inf.bio ? `Personality / Voice: ${inf.bio}` : ''}
${inf.brandBrief ? `Brand brief:\n${inf.brandBrief}` : ''}

Long-term strategy:
${inf.longTermStrategy || 'Not set yet.'}

━━━ YOUR TASK ━━━
1. Call get_trends to see what's trending on X right now
2. Optionally call web_search once to research the best angle
3. Call decide_topic ONCE with the topic that:
   - Is most relevant to the influencer's niche AND current trends
   - Fits their personality and brand voice
   - Is specific and concrete
${postTypeInstruction}`

      const result = await agent.invoke({ messages: [new HumanMessage(systemPrompt)] })
      steps.push(...extractSteps(result.messages))

      if (!_decision) throw new Error('Agent did not call decide_topic')
      topic = _decision.topic
      reasoning = _decision.reasoning
    }

    // Resolved post type: explicit > agent choice > default (video)
    const resolvedPostType = (requestedPostType !== 'auto')
      ? requestedPostType
      : (_decision?.postType ?? 'video')

    steps.push({ type: 'thought', tool: null, content: `Topic: "${topic}" | Post type: ${resolvedPostType} | ${reasoning}` })

    // ── Phase 2: generate tweet text (and script if video) ────────────────
    const trends = await fetchTrends(conn)
    let script = null
    let tweetText

    if (resolvedPostType === 'text') {
      // Text-only: generate just the tweet, no script needed
      const gen = await generateScriptAndTweet({
        inf, topic, trends, guidance: inf.longTermStrategy, brandBrief: inf.brandBrief,
      })
      tweetText = gen.tweetText
      if (!reasoning) reasoning = gen.reasoning
      steps.push({ type: 'thought', tool: null, content: `Tweet text: "${tweetText}"` })
    } else {
      // Video: generate script + tweet caption
      if (opts.customScript) {
        script = opts.customScript
        tweetText = opts.topic ?? `New post from ${inf.name}`
      } else {
        const gen = await generateScriptAndTweet({
          inf, topic, trends, guidance: inf.longTermStrategy, brandBrief: inf.brandBrief,
        })
        script = gen.script
        tweetText = gen.tweetText
        if (!reasoning) reasoning = gen.reasoning
      }
      steps.push({ type: 'thought', tool: null, content: `Script (${script.split(' ').length} words): "${script.slice(0, 120)}…"` })
      steps.push({ type: 'thought', tool: null, content: `Tweet: "${tweetText}"` })
    }

    // ── Phase 3: generate video (if video post) ────────────────────────────
    let videoId = null
    let videoUrl = null
    let thumbUrl = null

    if (resolvedPostType === 'video') {
      if (!inf.heygenAvatarId) throw new Error('No avatar selected — complete Step 3 first to enable video posts')

      steps.push({ type: 'tool_call', tool: 'video_generate', content: `Generating video for avatar ${inf.heygenAvatarId}` })
      const created = await createVideo({
        avatarId:      inf.heygenAvatarId,
        voiceId:       inf.heygenVoiceId ?? undefined,
        script,
        title:         `${inf.name} — ${topic?.slice(0, 40) ?? 'auto post'}`,
        aspectRatio:   '9:16',
        resolution:    '1080p',
        expressiveness: 'high',
        motionPrompt:  'natural presenting gestures, energetic but casual',
      })
      videoId = created.videoId
      steps.push({ type: 'tool_result', tool: 'video_generate', content: `Video job started: ${videoId}` })

      const videoStatus = await waitForVideo(influencerId, videoId)
      videoUrl = videoStatus.videoUrl
      thumbUrl = videoStatus.thumbnailUrl
      steps.push({ type: 'tool_result', tool: 'video_generate', content: `Video ready: ${videoUrl}` })
    }

    // ── Phase 4: post or hold for approval ────────────────────────────────
    const approvalMode = opts.manual ? 'auto' : (inf.postApprovalMode ?? 'approve')
    let tweetId = null
    let approvalStatus = 'pending_approval'

    if (approvalMode === 'auto') {
      const tweet = await postToX(conn, tweetText)
      tweetId = tweet.id
      approvalStatus = 'posted'
      steps.push({ type: 'decision', tool: null, content: `Auto-posted ${resolvedPostType} tweet ${tweetId}: "${tweetText}"` })
    } else {
      steps.push({ type: 'decision', tool: null, content: `Held for approval: "${tweetText}"${videoUrl ? ` — video: ${videoUrl}` : ''}` })
    }

    // ── Persist XPost ──────────────────────────────────────────────────────
    const xpost = await XPost.create({
      influencerId: inf._id.toString(),
      uid,
      tweetId:              tweetId ?? `draft_${Date.now()}`,
      text:                 tweetText,
      postedAt:             tweetId ? new Date() : null,
      agentDecisionSummary: reasoning,
      heygenVideoId:        videoId,
      heygenVideoUrl:       videoUrl,
      heygenThumbUrl:       thumbUrl,
      videoScript:          script,
      approvalStatus,
    })

    log.steps = steps
    log.summary = approvalMode === 'auto'
      ? `Posted ${resolvedPostType}: "${tweetText}"`
      : `Pending approval (${resolvedPostType}): "${tweetText}"${videoUrl ? ' — video ready' : ''}`
    log.xPostId = xpost._id.toString()
    log.status = 'completed'
    log.durationMs = Date.now() - started
    await log.save()

    console.log(`[ShortTermAgent] ✓ influencer=${influencerId} type=${resolvedPostType} mode=${approvalMode} topic="${topic?.slice(0, 40)}"`)
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
