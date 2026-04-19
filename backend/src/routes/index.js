const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const waitlistRouter = require('./waitlist')

const router = Router()

/** Public health-check */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Waitlist */
router.use('/waitlist', waitlistRouter)

/** Protected — returns the authenticated user's uid and email */
router.get('/me', authenticate, (req, res) => {
  res.json({ uid: req.user?.uid, email: req.user?.email })
})

module.exports = router
