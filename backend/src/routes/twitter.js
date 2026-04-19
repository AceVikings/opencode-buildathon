/**
 * X (Twitter) OAuth 2.0 PKCE — influencer-scoped routes — native fetch, no axios
 *
 * Routes (all except /callback require Firebase auth):
 *
 *   GET  /api/twitter/connect/:influencerId   Start OAuth for a specific influencer
 *   GET  /api/twitter/callback                X redirects here after approval/denial
 *   GET  /api/twitter/trends                  Trending topics (personalized or WOEID)
 *
 * Client type:
 *   Confidential (Web App): X_CLIENT_SECRET present → Basic Auth on token endpoint
 *   Public (Native/SPA):    no secret → client_id in body only
 */

const { Router } = require('express')
const crypto = require('crypto')
const { authenticate } = require('../middleware/auth')
const XConnection = require('../models/XConnection')
const Influencer = require('../models/Influencer')

const router = Router()

// ── Env vars (read lazily so dotenv has time to load) ─────────────────────────
const cfg = () => ({
  clientId:    process.env.X_CLIENT_ID,
  clientSecret: process.env.X_CLIENT_SECRET,
  callbackUrl: process.env.X_CALLBACK_URL,
  bearerToken: process.env.X_BEARER_TOKEN,
  frontend:    process.env.FRONTEND_URL ?? 'http://localhost:5173',
})

// ── X API endpoints ───────────────────────────────────────────────────────────
const X_AUTH_URL  = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_ME_URL    = 'https://api.x.com/2/users/me'

// Scopes — media.write added for image/video upload
const SCOPES = 'tweet.read tweet.write users.read media.write offline.access'

// ── In-memory PKCE store: `${uid}:${influencerId}` → { codeVerifier, nonce } ──
const pkceStore = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────────

const randomBase64url = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
const pkceS256 = (v) => crypto.createHash('sha256').update(v).digest('base64url')
const encodeState = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const decodeState = (raw) => { try { return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) } catch { return null } }

function tokenAuthHeaders() {
  const { clientId, clientSecret } = cfg()
  if (clientSecret) {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    }
  }
  return { 'Content-Type': 'application/x-www-form-urlencoded' }
}

function addClientIdIfPublic(params) {
  const { clientId, clientSecret } = cfg()
  if (!clientSecret) params.append('client_id', clientId)
}

async function refreshToken(conn) {
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
  addClientIdIfPublic(params)
  const res = await fetch(X_TOKEN_URL, { method: 'POST', headers: tokenAuthHeaders(), body: params.toString() })
  const data = await res.json()
  conn.accessToken = data.access_token
  if (data.refresh_token) conn.refreshToken = data.refresh_token
  conn.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null
  await conn.save()
  return conn.accessToken
}

async function getValidToken(conn) {
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    return refreshToken(conn)
  }
  return conn.accessToken
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/twitter/connect/:influencerId
 * Initiates PKCE OAuth. Returns { authUrl }.
 */
router.get('/connect/:influencerId', authenticate, async (req, res) => {
  const { influencerId } = req.params
  const uid = req.user.uid
  const { clientId, callbackUrl } = cfg()

  if (!clientId) return res.status(500).json({ error: 'X_CLIENT_ID not configured' })
  if (!callbackUrl) return res.status(500).json({ error: 'X_CALLBACK_URL not configured' })

  const inf = await Influencer.findById(influencerId)
  if (!inf) return res.status(404).json({ error: 'Influencer not found' })
  if (inf.uid !== uid) return res.status(403).json({ error: 'Forbidden' })

  const codeVerifier = randomBase64url(32)
  const codeChallenge = pkceS256(codeVerifier)
  const nonce = randomBase64url(16)
  const state = encodeState({ nonce, uid, influencerId })

  pkceStore.set(`${uid}:${influencerId}`, { codeVerifier, nonce })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  console.log(`[twitter] /connect influencer=${influencerId} uid=${uid}`)
  res.json({ authUrl: `${X_AUTH_URL}?${params.toString()}` })
})

/**
 * GET /api/twitter/callback
 * X redirects here. Exchanges code for tokens, saves XConnection.
 */
router.get('/callback', async (req, res) => {
  const { frontend, callbackUrl } = cfg()
  const { code, state, error } = req.query

  console.log('[twitter] /callback', { code: !!code, state: !!state, error })

  if (error) {
    return res.redirect(`${frontend}/dashboard?x_error=${encodeURIComponent(String(error))}`)
  }
  if (!code || !state) {
    return res.redirect(`${frontend}/dashboard?x_error=missing_params`)
  }

  const stateData = decodeState(String(state))
  if (!stateData?.uid || !stateData?.influencerId || !stateData?.nonce) {
    console.error('[twitter] invalid state:', String(state).slice(0, 80))
    return res.redirect(`${frontend}/dashboard?x_error=invalid_state`)
  }

  const { uid, influencerId, nonce } = stateData
  const storeKey = `${uid}:${influencerId}`
  const pending = pkceStore.get(storeKey)

  if (!pending) {
    console.error('[twitter] no PKCE entry for', storeKey)
    return res.redirect(`${frontend}/dashboard?x_error=state_not_found`)
  }
  if (pending.nonce !== nonce) {
    pkceStore.delete(storeKey)
    console.error('[twitter] nonce mismatch')
    return res.redirect(`${frontend}/dashboard?x_error=state_mismatch`)
  }
  pkceStore.delete(storeKey)

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: callbackUrl,
      code_verifier: pending.codeVerifier,
    })
    addClientIdIfPublic(tokenParams)

    console.log('[twitter] exchanging code for tokens…')
    const tokenRes = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: tokenAuthHeaders(),
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({}))
      console.error('[twitter] token exchange failed:', errBody)
      return res.redirect(`${frontend}/dashboard?x_error=token_exchange_failed`)
    }

    const tokenData = await tokenRes.json()
    const accessToken  = tokenData.access_token
    const refreshToken = tokenData.refresh_token ?? null
    const tokenExpiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null

    // Fetch X user profile
    const meRes = await fetch(`${X_ME_URL}?user.fields=name,username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const meData = await meRes.json()
    const xUser = meData.data

    console.log(`[twitter] connected @${xUser.username} → influencer ${influencerId}`)

    const conn = await XConnection.findOneAndUpdate(
      { influencerId },
      { uid, influencerId, xUserId: xUser.id, xUsername: xUser.username ?? '', xName: xUser.name ?? '', accessToken, refreshToken, tokenExpiresAt },
      { upsert: true, new: true }
    )

    await Influencer.findByIdAndUpdate(influencerId, { xConnectionId: conn._id.toString() })

    return res.redirect(`${frontend}/dashboard?x_connected=true&inf=${influencerId}`)
  } catch (err) {
    console.error('[twitter] callback error:', err.message)
    return res.redirect(`${frontend}/dashboard?x_error=token_exchange_failed`)
  }
})

/**
 * GET /api/twitter/trends
 * Personalized (influencer token) or WOEID (Bearer Token) trends.
 */
router.get('/trends', authenticate, async (req, res) => {
  const { influencerId, woeid = '1' } = req.query
  const { bearerToken } = cfg()

  if (influencerId) {
    try {
      const inf = await Influencer.findById(String(influencerId))
      if (!inf || inf.uid !== req.user.uid) return res.status(403).json({ error: 'Forbidden' })

      if (inf.xConnectionId) {
        const conn = await XConnection.findById(inf.xConnectionId)
        if (conn) {
          const token = await getValidToken(conn)
          const trendsRes = await fetch(
            'https://api.x.com/2/users/personalized_trends?personalized_trend.fields=trend_name,post_count,category,trending_since',
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const data = await trendsRes.json()
          return res.json({
            type: 'personalized',
            trends: (data.data ?? []).map(t => ({
              name: t.trend_name, postCount: t.post_count ?? null,
              category: t.category ?? null, trendingSince: t.trending_since ?? null,
            })),
          })
        }
      }
    } catch (err) {
      console.warn('[twitter/trends] personalized failed, falling back:', err.message)
    }
  }

  if (!bearerToken) return res.status(503).json({ error: 'X_BEARER_TOKEN not configured' })

  try {
    const parsedWoeid = parseInt(String(woeid), 10) || 1
    const trendsRes = await fetch(
      `https://api.x.com/2/trends/by/woeid/${parsedWoeid}?max_trends=20&trend.fields=trend_name,tweet_count`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )
    const data = await trendsRes.json()
    return res.json({
      type: 'woeid',
      woeid: parsedWoeid,
      trends: (data.data ?? []).map(t => ({
        name: t.trend_name, postCount: t.tweet_count ?? null, trendingSince: null, category: null,
      })),
    })
  } catch (err) {
    console.error('[twitter/trends] WOEID failed:', err.message)
    return res.status(500).json({ error: 'Failed to fetch trends', detail: err.message })
  }
})

module.exports = router
