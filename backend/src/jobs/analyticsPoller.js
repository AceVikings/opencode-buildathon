/**
 * Analytics Poller
 *
 * Runs every hour via setInterval. For every influencer that has an active
 * X connection, fetches post analytics from GET /2/tweets/analytics for all
 * posts we've recorded in the last 90 days (X analytics window limit).
 *
 * Batches up to 100 tweet IDs per request (X API limit).
 * Uses each influencer's own OAuth 2.0 user access token so analytics are
 * pulled for posts the influencer account actually owns.
 *
 * Gracefully skips influencers/connections that are missing or have
 * expired tokens.
 *
 * Analytics fields fetched (granularity=total, last 7 days rolling window):
 *   impressions, engagements, likes, retweets, replies, quote_tweets,
 *   bookmarks, url_clicks, user_profile_clicks, detail_expands, follows
 */

const axios = require('axios')
const XPost = require('../models/XPost')
const XConnection = require('../models/XConnection')

const POLL_INTERVAL_MS = 60 * 60 * 1000  // 1 hour
const MAX_TWEET_AGE_DAYS = 90             // X analytics only goes back ~90 days
const BATCH_SIZE = 100                    // X API max per request

// Analytics fields we care about
const ANALYTICS_FIELDS = [
  'impressions', 'engagements', 'likes', 'retweets', 'replies',
  'quote_tweets', 'bookmarks', 'url_clicks', 'user_profile_clicks',
  'detail_expands', 'follows',
].join(',')

// ── Token refresh ─────────────────────────────────────────────────────────────

async function getValidToken(conn) {
  const BUFFER_MS = 5 * 60 * 1000
  if (
    conn.tokenExpiresAt &&
    Date.now() >= conn.tokenExpiresAt - BUFFER_MS &&
    conn.refreshToken
  ) {
    const clientId = process.env.X_CLIENT_ID
    const clientSecret = process.env.X_CLIENT_SECRET

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
    })
    if (!clientSecret) params.append('client_id', clientId)

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (clientSecret) {
      headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    }

    const { data } = await axios.post('https://api.x.com/2/oauth2/token', params.toString(), { headers })

    conn.accessToken = data.access_token
    if (data.refresh_token) conn.refreshToken = data.refresh_token
    conn.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    await conn.save()
  }
  return conn.accessToken
}

// ── Fetch analytics for a batch of tweet IDs ─────────────────────────────────

async function fetchAnalyticsBatch(tweetIds, accessToken) {
  // Rolling 7-day window — analytics API requires start_time + end_time
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)

  const params = new URLSearchParams({
    ids: tweetIds.join(','),
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    granularity: 'total',
    'analytics.fields': ANALYTICS_FIELDS,
  })

  const { data } = await axios.get(
    `https://api.x.com/2/tweets/analytics?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  return data.data ?? []
}

// ── Poll one connection's posts ───────────────────────────────────────────────

async function pollConnection(conn) {
  const cutoff = new Date(Date.now() - MAX_TWEET_AGE_DAYS * 24 * 60 * 60 * 1000)

  const posts = await XPost.find({
    influencerId: conn.influencerId,
    postedAt: { $gte: cutoff },
  })

  if (posts.length === 0) return { polled: 0 }

  let accessToken
  try {
    accessToken = await getValidToken(conn)
  } catch (err) {
    console.warn(`[analyticsPoller] token refresh failed for influencer ${conn.influencerId}:`, err.message)
    return { polled: 0 }
  }

  // Process in batches of 100
  let polled = 0
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE)
    const tweetIds = batch.map((p) => p.tweetId)

    let analyticsData
    try {
      analyticsData = await fetchAnalyticsBatch(tweetIds, accessToken)
    } catch (err) {
      console.warn(
        `[analyticsPoller] batch fetch failed for influencer ${conn.influencerId}:`,
        err?.response?.data ?? err.message
      )
      continue
    }

    // Build lookup map: tweetId → metrics
    const metricsMap = {}
    for (const item of analyticsData) {
      if (!item?.id) continue
      // granularity=total → single entry in timestamped_metrics
      const m = item.timestamped_metrics?.[0]?.metrics ?? {}
      metricsMap[item.id] = m
    }

    // Write metrics back to XPost documents in parallel
    const updates = batch.map(async (post) => {
      const m = metricsMap[post.tweetId]
      if (!m) return

      post.metrics = {
        impressions:           m.impressions           ?? null,
        engagements:           m.engagements           ?? null,
        likes:                 m.likes                 ?? null,
        retweets:              m.retweets              ?? null,
        replies:               m.replies               ?? null,
        quote_tweets:          m.quote_tweets          ?? null,
        bookmarks:             m.bookmarks             ?? null,
        url_clicks:            m.url_clicks            ?? null,
        user_profile_clicks:   m.user_profile_clicks   ?? null,
        detail_expands:        m.detail_expands        ?? null,
        follows:               m.follows               ?? null,
      }
      post.metricsUpdatedAt = new Date()
      await post.save()
      polled++
    })

    await Promise.allSettled(updates)
  }

  return { polled }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function runPoll() {
  console.log('[analyticsPoller] Starting poll…')
  const started = Date.now()

  // Load all XConnections that have an influencer attached
  const connections = await XConnection.find({
    influencerId: { $exists: true, $ne: null },
  })

  if (connections.length === 0) {
    console.log('[analyticsPoller] No connections to poll.')
    return
  }

  let totalPolled = 0
  for (const conn of connections) {
    try {
      const { polled } = await pollConnection(conn)
      totalPolled += polled
    } catch (err) {
      console.error(`[analyticsPoller] Unhandled error for connection ${conn._id}:`, err.message)
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[analyticsPoller] Done — ${totalPolled} post(s) updated across ${connections.length} connection(s) in ${elapsed}s`)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function startAnalyticsPoller() {
  // Run immediately on boot (after a short delay to let DB connect)
  setTimeout(() => {
    runPoll().catch((err) => console.error('[analyticsPoller] Initial poll error:', err.message))
  }, 10_000)

  // Then every hour
  setInterval(() => {
    runPoll().catch((err) => console.error('[analyticsPoller] Poll error:', err.message))
  }, POLL_INTERVAL_MS)

  console.log(`[analyticsPoller] Scheduled — running every ${POLL_INTERVAL_MS / 60000} min`)
}

module.exports = { startAnalyticsPoller }
