/**
 * X (Twitter) OAuth 2.0 PKCE — influencer-scoped routes
 *
 * X accounts are connected per-influencer, not per-app-user.
 * Each influencer can have exactly one linked X account.
 *
 * Routes (all except /callback require Firebase auth):
 *
 *   GET  /api/twitter/connect/:influencerId
 *        Start the OAuth flow for a specific influencer.
 *        Returns { authUrl } — frontend redirects the user there.
 *
 *   GET  /api/twitter/callback
 *        X redirects here after user approves/denies.
 *        State is a base64url-encoded JSON blob { nonce, uid, influencerId }.
 *        Stores tokens in XConnection, updates influencer.xConnectionId,
 *        then redirects browser back to the dashboard.
 *
 * All tweet-posting and disconnect operations live in influencers.js
 * under /api/influencers/:id/x/*.
 *
 *   GET  /api/twitter/trends
 *        Returns trending topics. Uses:
 *          - GET /2/users/personalized_trends  (user OAuth 2.0 token, for influencer)
 *            when ?influencerId=<id> is supplied and that influencer has an X connection
 *          - GET /2/trends/by/woeid/:woeid     (Bearer Token, app-level)
 *            as fallback or when ?woeid=<id> is supplied (default woeid=1 = worldwide)
 *        Fields returned: trend_name, post_count / tweet_count, trending_since (where available)
 *
 * Client type note:
 *   - Confidential client (Web App / Automated App): has X_CLIENT_SECRET → use Basic Auth header
 *   - Public client (Native App / SPA): no secret → send client_id in body only
 */

const { Router } = require('express')
const crypto = require('crypto')
const axios = require('axios')
const { authenticate } = require('../middleware/auth')
const XConnection = require('../models/XConnection')
const Influencer = require('../models/Influencer')

const router = Router()

// ── Env vars ──────────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.X_CLIENT_ID
const CLIENT_SECRET = process.env.X_CLIENT_SECRET  // undefined for public clients
const CALLBACK_URL = process.env.X_CALLBACK_URL

if (!CLIENT_ID) console.warn('[twitter] X_CLIENT_ID not set — OAuth will fail')
if (!CALLBACK_URL) console.warn('[twitter] X_CALLBACK_URL not set — OAuth will fail')
if (!CLIENT_SECRET) console.warn('[twitter] X_CLIENT_SECRET not set — assuming public client (no Basic Auth)')

// ── X API endpoints ────────────────────────────────────────────────────────────
const X_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_ME_URL = 'https://api.x.com/2/users/me'

// Required scopes for posting
const SCOPES = 'tweet.read tweet.write users.read offline.access'

// ── In-memory PKCE store: storeKey → { codeVerifier, nonce } ─────────────────
// Key = `${uid}:${influencerId}`.  Replace with Redis in production.
const pkceStore = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomBase64url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function pkceS256Challenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Encode state as base64url JSON so it survives URL round-trips without
 * any ambiguity regardless of characters in uid/influencerId.
 */
function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeState(raw) {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Build the Authorization header for the token endpoint.
 * Confidential clients (have a secret) → Basic Auth.
 * Public clients (no secret) → no Auth header; client_id goes in body.
 */
function tokenAuthHeaders() {
  if (CLIENT_SECRET) {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
    }
  }
  return { 'Content-Type': 'application/x-www-form-urlencoded' }
}

/**
 * Add client_id to the token body params if this is a public client.
 * Confidential clients must NOT put client_id in the body when using Basic Auth
 * per RFC 6749 §2.3.1.
 */
function addClientIdIfPublic(params) {
  if (!CLIENT_SECRET) {
    params.append('client_id', CLIENT_ID)
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/twitter/connect/:influencerId
 *
 * Initiates OAuth 2.0 PKCE for the given influencer.
 * The influencer must belong to the authenticated user.
 * Returns { authUrl } for the frontend to redirect the user to.
 */
router.get('/connect/:influencerId', authenticate, async (req, res) => {
  const { influencerId } = req.params
  const uid = req.user.uid

  // Verify ownership
  const inf = await Influencer.findById(influencerId)
  if (!inf) return res.status(404).json({ error: 'Influencer not found' })
  if (inf.uid !== uid) return res.status(403).json({ error: 'Forbidden' })

  const codeVerifier = randomBase64url(32)
  const codeChallenge = pkceS256Challenge(codeVerifier)
  const nonce = randomBase64url(16)

  // State is opaque to X — encode as base64url JSON
  const state = encodeState({ nonce, uid, influencerId })

  pkceStore.set(`${uid}:${influencerId}`, { codeVerifier, nonce })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  console.log(`[twitter] /connect — influencer=${influencerId} uid=${uid}`)
  res.json({ authUrl: `${X_AUTH_URL}?${params.toString()}` })
})

/**
 * GET /api/twitter/callback
 *
 * X redirects here after the user approves or denies the app.
 * No Firebase auth — uid is decoded from the opaque state blob.
 */
router.get('/callback', async (req, res) => {
  const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const { code, state, error } = req.query

  console.log('[twitter] /callback received', { code: !!code, state: !!state, error })

  if (error) {
    console.warn('[twitter] user denied access:', error)
    return res.redirect(`${FRONTEND}/dashboard?x_error=${encodeURIComponent(String(error))}`)
  }

  if (!code || !state) {
    console.error('[twitter] callback missing code or state')
    return res.redirect(`${FRONTEND}/dashboard?x_error=missing_params`)
  }

  // Decode the opaque state blob
  const stateData = decodeState(String(state))
  if (!stateData || !stateData.uid || !stateData.influencerId || !stateData.nonce) {
    console.error('[twitter] could not decode state:', String(state).slice(0, 80))
    return res.redirect(`${FRONTEND}/dashboard?x_error=invalid_state`)
  }

  const { uid, influencerId, nonce } = stateData
  const storeKey = `${uid}:${influencerId}`
  const pending = pkceStore.get(storeKey)

  if (!pending) {
    console.error('[twitter] no pending PKCE entry for', storeKey)
    return res.redirect(`${FRONTEND}/dashboard?x_error=state_not_found`)
  }

  if (pending.nonce !== nonce) {
    console.error('[twitter] nonce mismatch — possible CSRF')
    pkceStore.delete(storeKey)
    return res.redirect(`${FRONTEND}/dashboard?x_error=state_mismatch`)
  }

  pkceStore.delete(storeKey)

  try {
    // ── Step 3: Exchange auth code for tokens ──────────────────────────────
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: CALLBACK_URL,
      code_verifier: pending.codeVerifier,
    })

    // Public clients must include client_id in body; confidential use Basic Auth
    addClientIdIfPublic(tokenParams)

    console.log('[twitter] exchanging code for tokens…')

    const tokenResponse = await axios.post(X_TOKEN_URL, tokenParams.toString(), {
      headers: tokenAuthHeaders(),
    })

    const tokenData = tokenResponse.data
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token ?? null
    const tokenExpiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null

    console.log('[twitter] token exchange OK, fetching X user profile…')

    // ── Step 4: Fetch the X user's profile ────────────────────────────────
    const meResponse = await axios.get(
      `${X_ME_URL}?user.fields=name,username`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const xUser = meResponse.data.data

    console.log(`[twitter] connected X user @${xUser.username} (${xUser.id}) → influencer ${influencerId}`)

    // ── Upsert XConnection scoped to this influencer ───────────────────────
    const conn = await XConnection.findOneAndUpdate(
      { influencerId },
      {
        uid,
        influencerId,
        xUserId: xUser.id,
        xUsername: xUser.username ?? '',
        xName: xUser.name ?? '',
        accessToken,
        refreshToken,
        tokenExpiresAt,
      },
      { upsert: true, new: true }
    )

    // Stamp the influencer document
    await Influencer.findByIdAndUpdate(influencerId, {
      xConnectionId: conn._id.toString(),
    })

    return res.redirect(`${FRONTEND}/dashboard?x_connected=true&inf=${influencerId}`)
  } catch (err) {
    const xErr = err?.response?.data
    console.error('[twitter] callback error:', JSON.stringify(xErr ?? err.message))
    return res.redirect(`${FRONTEND}/dashboard?x_error=token_exchange_failed`)
  }
})

// ── Trends ────────────────────────────────────────────────────────────────────

/**
 * GET /api/twitter/trends
 *
 * Query params:
 *   influencerId  — if provided, fetch personalized trends using that influencer's
 *                   OAuth 2.0 user access token (GET /2/users/personalized_trends).
 *                   Fields: trend_name, post_count, category, trending_since
 *   woeid         — WOEID for location-based trends (default: 1 = worldwide).
 *                   Uses app Bearer Token. Fields: trend_name, tweet_count
 *
 * If influencerId is provided and has a valid token, personalized trends take
 * precedence. Falls back to WOEID trends if the influencer has no X connection.
 */
router.get('/trends', authenticate, async (req, res) => {
  const { influencerId, woeid = '1' } = req.query

  // ── Option A: personalised trends via the influencer's user token ─────────
  if (influencerId) {
    try {
      const inf = await Influencer.findById(String(influencerId))
      if (!inf || inf.uid !== req.user.uid) {
        return res.status(403).json({ error: 'Influencer not found or forbidden' })
      }

      if (inf.xConnectionId) {
        const conn = await XConnection.findById(inf.xConnectionId)
        if (conn) {
          // Refresh token if needed (reuse helper from influencers.js pattern)
          const BUFFER = 5 * 60 * 1000
          if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
            const rp = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
            if (!CLIENT_SECRET) rp.append('client_id', CLIENT_ID)
            const { data: rd } = await axios.post(X_TOKEN_URL, rp.toString(), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...(CLIENT_SECRET ? { Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64') } : {}),
              },
            })
            conn.accessToken = rd.access_token
            if (rd.refresh_token) conn.refreshToken = rd.refresh_token
            conn.tokenExpiresAt = rd.expires_in ? Date.now() + rd.expires_in * 1000 : null
            await conn.save()
          }

          const fields = 'trend_name,post_count,category,trending_since'
          const { data } = await axios.get(
            `https://api.x.com/2/users/personalized_trends?personalized_trend.fields=${fields}`,
            { headers: { Authorization: `Bearer ${conn.accessToken}` } }
          )

          return res.json({
            type: 'personalized',
            trends: (data.data ?? []).map((t) => ({
              name: t.trend_name,
              postCount: t.post_count ?? null,
              category: t.category ?? null,
              trendingSince: t.trending_since ?? null,
            })),
          })
        }
      }
    } catch (err) {
      console.warn('[twitter/trends] personalized fetch failed, falling back:', err?.response?.data ?? err.message)
      // Fall through to WOEID
    }
  }

  // ── Option B: location trends via Bearer Token ────────────────────────────
  const bearerToken = process.env.X_BEARER_TOKEN
  if (!bearerToken) {
    return res.status(503).json({ error: 'X_BEARER_TOKEN not configured' })
  }

  try {
    const parsedWoeid = parseInt(String(woeid), 10) || 1
    const { data } = await axios.get(
      `https://api.x.com/2/trends/by/woeid/${parsedWoeid}?max_trends=20&trend.fields=trend_name,tweet_count`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )

    return res.json({
      type: 'woeid',
      woeid: parsedWoeid,
      trends: (data.data ?? []).map((t) => ({
        name: t.trend_name,
        postCount: t.tweet_count ?? null,
        trendingSince: null,
        category: null,
      })),
    })
  } catch (err) {
    const xErr = err?.response?.data
    console.error('[twitter/trends] WOEID fetch failed:', JSON.stringify(xErr ?? err.message))
    return res.status(err?.response?.status ?? 500).json({
      error: 'Failed to fetch trends',
      detail: xErr ?? err.message,
    })
  }
})

module.exports = router
