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
 *        State encodes uid + influencerId.
 *        Stores tokens in XConnection, updates influencer.xConnectionId,
 *        then redirects browser back to the dashboard.
 *
 * All tweet-posting and disconnect operations live in influencers.js
 * under /api/influencers/:id/x/* so they stay co-located with the influencer resource.
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
const CLIENT_SECRET = process.env.X_CLIENT_SECRET
const CALLBACK_URL = process.env.X_CALLBACK_URL

if (!CLIENT_ID) console.warn('[twitter] X_CLIENT_ID not set')
if (!CLIENT_SECRET) console.warn('[twitter] X_CLIENT_SECRET not set')
if (!CALLBACK_URL) console.warn('[twitter] X_CALLBACK_URL not set')

// ── X API endpoints ────────────────────────────────────────────────────────────
const X_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_ME_URL = 'https://api.x.com/2/users/me'

// tweet.read + tweet.write + users.read (to fetch profile) + offline.access (refresh tokens)
const SCOPES = 'tweet.read tweet.write users.read offline.access'

// ── In-memory PKCE store: uid → { codeVerifier, state, influencerId } ─────────
// Production: replace with Redis or a short-TTL DB collection.
const pkceStore = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomBase64url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
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
  const codeChallenge = pkceChallenge(codeVerifier)
  // State encodes a random nonce + uid + influencerId, dot-separated
  const state = `${randomBase64url(12)}.${uid}.${influencerId}`

  pkceStore.set(`${uid}:${influencerId}`, { codeVerifier, state })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  res.json({ authUrl: `${X_AUTH_URL}?${params.toString()}` })
})

/**
 * GET /api/twitter/callback
 *
 * X redirects here after the user approves or denies the app.
 * No Firebase auth here — the user's uid is decoded from `state`.
 */
router.get('/callback', async (req, res) => {
  const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const { code, state, error } = req.query

  if (error) {
    return res.redirect(`${FRONTEND}/dashboard?x_error=${encodeURIComponent(String(error))}`)
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' })
  }

  // state = "<nonce>.<uid>.<influencerId>"
  const parts = String(state).split('.')
  if (parts.length < 3) {
    return res.status(400).json({ error: 'Malformed state' })
  }
  // nonce is first segment, uid is second, influencerId is everything after (base64url ids don't contain dots)
  const uid = parts[1]
  const influencerId = parts[2]

  const storeKey = `${uid}:${influencerId}`
  const pending = pkceStore.get(storeKey)

  if (!pending || pending.state !== String(state)) {
    return res.status(400).json({ error: 'State mismatch — possible CSRF' })
  }
  pkceStore.delete(storeKey)

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: CALLBACK_URL,
      code_verifier: pending.codeVerifier,
    })

    const { data: tokenData } = await axios.post(X_TOKEN_URL, tokenParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
      },
    })

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token ?? null
    const tokenExpiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null

    // Fetch X user profile
    const { data: meData } = await axios.get(
      `${X_ME_URL}?user.fields=name,username`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const xUser = meData.data

    // Upsert the XConnection for this influencer
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

    // Stamp the influencer with this connection ID
    await Influencer.findByIdAndUpdate(influencerId, {
      xConnectionId: conn._id.toString(),
    })

    res.redirect(`${FRONTEND}/dashboard?x_connected=true&inf=${influencerId}`)
  } catch (err) {
    console.error('[twitter] callback error:', err?.response?.data ?? err.message)
    res.redirect(`${FRONTEND}/dashboard?x_error=token_exchange_failed`)
  }
})

module.exports = router
