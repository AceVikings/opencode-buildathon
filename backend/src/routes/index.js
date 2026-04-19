const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const waitlistRouter = require('./waitlist')
const influencersRouter = require('./influencers')
const twitterRouter = require('./twitter')

const router = Router()

/** Public health-check */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Waitlist */
router.use('/waitlist', waitlistRouter)

/** Influencers (all routes protected internally) */
router.use('/influencers', influencersRouter)

/** X (Twitter) OAuth 2.0 + tweet management */
router.use('/twitter', twitterRouter)

/** Protected — returns the authenticated user's uid and email */
router.get('/me', authenticate, (req, res) => {
  res.json({ uid: req.user?.uid, email: req.user?.email })
})

module.exports = router
