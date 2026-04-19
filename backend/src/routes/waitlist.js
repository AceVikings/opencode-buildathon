const { Router } = require('express')
const WaitlistEntry = require('../models/WaitlistEntry')

const router = Router()

/**
 * POST /api/waitlist
 * Public — called right after Firebase sign-up.
 * Body: { email, uid?, name?, source: 'email' | 'google' }
 */
router.post('/', async (req, res) => {
  const { email, uid = null, name = null, source } = req.body

  if (!email || !source) {
    return res.status(400).json({ error: 'email and source are required' })
  }

  if (!['email', 'google'].includes(source)) {
    return res.status(400).json({ error: 'source must be "email" or "google"' })
  }

  try {
    const entry = await WaitlistEntry.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $setOnInsert: { email: email.toLowerCase().trim(), uid, name, source } },
      { upsert: true, new: true, runValidators: true }
    )

    return res.status(201).json({
      message: 'Added to waitlist',
      id: entry._id,
      alreadyRegistered: false,
    })
  } catch (err) {
    // Duplicate key — already on the list (race condition edge case)
    if (err.code === 11000) {
      return res.status(200).json({ message: 'Already on waitlist', alreadyRegistered: true })
    }
    console.error('Waitlist error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
