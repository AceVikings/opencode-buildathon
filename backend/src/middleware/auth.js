const { auth } = require('../config/firebase')

/**
 * Middleware that verifies a Firebase ID token from the
 * `Authorization: Bearer <token>` header.
 *
 * On success, attaches the decoded token to `req.user` and calls `next()`.
 * On failure, responds 401.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.slice(7) // strip "Bearer "

  try {
    req.user = await auth.verifyIdToken(token)
    next()
  } catch (err) {
    console.error('Token verification failed:', err)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

/**
 * Optional variant: attaches `req.user` when a valid token is present,
 * but never blocks the request. Route handlers check `req.user` themselves.
 */
async function optionalAuthenticate(req, _res, next) {
  const authHeader = req.headers.authorization

  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = await auth.verifyIdToken(authHeader.slice(7))
    } catch {
      // silently ignore — route handler decides what to do
    }
  }

  next()
}

module.exports = { authenticate, optionalAuthenticate }
