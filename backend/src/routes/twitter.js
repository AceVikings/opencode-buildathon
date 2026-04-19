/**
 * X (Twitter) OAuth 2.0 PKCE routes
 *
 * Flow:
 *   1. GET  /api/twitter/connect          — start OAuth (returns redirect URL)
 *   2. GET  /api/twitter/callback         — X redirects here with ?code=&state=
 *   3. GET  /api/twitter/status           — check if the authed user has connected X
 *   4. POST /api/twitter/post             — post a tweet on behalf of the user
 *   5. DELETE /api/twitter/disconnect     — revoke token + remove stored connection
 *
 * All routes except /callback require a valid Firebase ID token in
 * `Authorization: Bearer <firebase-id-token>`.
 *
 * The /callback route carries the Firebase uid in the `state` parameter so it
 * can look up the pending PKCE verifier and associate the X tokens with the
 * correct app user.
 */

const { Router } = require('express')
const crypto = require('crypto')
const axios = require('axios')
const { authenticate } = require('../middleware/auth')
const XConnection = require('../models/XConnection')

const router = Router()

// ── Env vars ─────────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.X_CLIENT_ID
const CLIENT_SECRET = process.env.X_CLIENT_SECRET
const CALLBACK_URL = process.env.X_CALLBACK_URL

if (!CLIENT_ID) console.warn('[twitter] X_CLIENT_ID not set — OAuth will fail')
if (!CLIENT_SECRET) console.warn('[twitter] X_CLIENT_SECRET not set — OAuth will fail')
if (!CALLBACK_URL) console.warn('[twitter] X_CALLBACK_URL not set — OAuth will fail')

// ── X API endpoints ───────────────────────────────────────────────────────────
const X_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke'
const X_ME_URL = 'https://api.x.com/2/users/me'
const X_TWEETS_URL = 'https://api.x.com/2/tweets'

// Scopes required: read + write tweets, read user info, keep token alive
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ')

// ── In-memory PKCE store (uid → { codeVerifier, state }) ─────────────────────
// In production, use Redis or a short-lived DB collection instead.
const pkceStore = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically random base64url string */
function randomBase64url(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url')
}

/** SHA-256 PKCE code challenge from a verifier */
function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Basic auth header for confidential client token requests */
function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

/**
 * Refresh an access token using the stored refresh token.
 * Updates the XConnection document in place and returns the new access token.
 */
async function refreshAccessToken(connection) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: connection.refreshToken,
  })

  const { data } = await axios.post(X_TOKEN_URL, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
  })

  connection.accessToken = data.access_token
  if (data.refresh_token) connection.refreshToken = data.refresh_token
  connection.tokenExpiresAt = data.expires_in
    ? Date.now() + data.expires_in * 1000
    : null
  await connection.save()

  return connection.accessToken
}

/**
 * Return a valid access token for a connection, refreshing if needed.
 */
async function getValidAccessToken(connection) {
  const BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry
  if (
    connection.tokenExpiresAt &&
    Date.now() >= connection.tokenExpiresAt - BUFFER_MS &&
    connection.refreshToken
  ) {
    return refreshAccessToken(connection)
  }
  return connection.accessToken
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/twitter/connect
 * Initiates OAuth 2.0 PKCE flow.
 * Returns { authUrl } — the frontend should redirect the user there.
 */
router.get('/connect', authenticate, (req, res) => {
  const uid = req.user.uid

  const codeVerifier = randomBase64url(32)
  const codeChallenge = pkceChallenge(codeVerifier)
  // Encode uid into state so the callback can associate tokens with the user
  const state = `${randomBase64url(16)}.${uid}`

  pkceStore.set(uid, { codeVerifier, state })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `${X_AUTH_URL}?${params.toString()}`
  res.json({ authUrl })
})

/**
 * GET /api/twitter/callback
 * X redirects here after the user approves (or denies) the app.
 * Exchanges the auth code for tokens, fetches the X user profile,
 * persists the connection, then redirects the browser back to the dashboard.
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query

  // User denied
  if (error) {
    return res.redirect(
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/dashboard?x_error=${encodeURIComponent(error)}`
    )
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' })
  }

  // Extract uid from state (format: "<random>.<uid>")
  const dotIndex = state.lastIndexOf('.')
  if (dotIndex === -1) {
    return res.status(400).json({ error: 'Malformed state parameter' })
  }
  const uid = state.slice(dotIndex + 1)

  const pending = pkceStore.get(uid)
  if (!pending || pending.state !== state) {
    return res.status(400).json({ error: 'State mismatch — possible CSRF attack' })
  }
  pkceStore.delete(uid)

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_URL,
      code_verifier: pending.codeVerifier,
    })

    const { data: tokenData } = await axios.post(
      X_TOKEN_URL,
      tokenParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuthHeader(),
        },
      }
    )

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

    // Upsert connection document
    await XConnection.findOneAndUpdate(
      { uid },
      {
        uid,
        xUserId: xUser.id,
        xUsername: xUser.username ?? '',
        xName: xUser.name ?? '',
        accessToken,
        refreshToken,
        tokenExpiresAt,
      },
      { upsert: true, new: true }
    )

    // Redirect back to dashboard with success flag
    res.redirect(
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/dashboard?x_connected=true`
    )
  } catch (err) {
    console.error('[twitter] callback error:', err?.response?.data ?? err.message)
    res.redirect(
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/dashboard?x_error=token_exchange_failed`
    )
  }
})

/**
 * GET /api/twitter/status
 * Returns the connected X account info for the authenticated user, or null.
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const connection = await XConnection.findOne({ uid: req.user.uid }).lean()
    if (!connection) return res.json({ connected: false })

    res.json({
      connected: true,
      xUserId: connection.xUserId,
      xUsername: connection.xUsername,
      xName: connection.xName,
    })
  } catch (err) {
    console.error('[twitter] status error:', err.message)
    res.status(500).json({ error: 'Failed to fetch X connection status' })
  }
})

/**
 * POST /api/twitter/post
 * Body: { text: string }
 * Posts a tweet on behalf of the authenticated user.
 */
router.post('/post', authenticate, async (req, res) => {
  const { text } = req.body

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' })
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'text exceeds 280 characters' })
  }

  try {
    const connection = await XConnection.findOne({ uid: req.user.uid })
    if (!connection) {
      return res.status(403).json({ error: 'X account not connected' })
    }

    const accessToken = await getValidAccessToken(connection)

    const { data: tweetData } = await axios.post(
      X_TWEETS_URL,
      { text: text.trim() },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    res.status(201).json({ tweet: tweetData.data })
  } catch (err) {
    const xError = err?.response?.data
    console.error('[twitter] post error:', xError ?? err.message)
    res.status(err?.response?.status ?? 500).json({
      error: 'Failed to post tweet',
      detail: xError ?? err.message,
    })
  }
})

/**
 * DELETE /api/twitter/disconnect
 * Revokes the token at X and removes the stored connection.
 */
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    const connection = await XConnection.findOne({ uid: req.user.uid })
    if (!connection) {
      return res.json({ disconnected: true }) // already gone
    }

    // Revoke token at X (best-effort)
    try {
      const revokeParams = new URLSearchParams({
        token: connection.accessToken,
        token_type_hint: 'access_token',
      })
      await axios.post(X_REVOKE_URL, revokeParams.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: basicAuthHeader(),
        },
      })
    } catch (revokeErr) {
      console.warn('[twitter] token revocation failed (continuing):', revokeErr.message)
    }

    await XConnection.deleteOne({ uid: req.user.uid })
    res.json({ disconnected: true })
  } catch (err) {
    console.error('[twitter] disconnect error:', err.message)
    res.status(500).json({ error: 'Failed to disconnect X account' })
  }
})

module.exports = router
