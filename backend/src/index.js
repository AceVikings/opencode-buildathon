require('dotenv/config')
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')

const { connectDB } = require('./config/mongodb')
const router = require('./routes/index')

// Imported for side-effects: validate env vars and initialise clients at boot.
require('./config/firebase')
require('./config/storage')

const PORT = process.env.PORT ?? 3000

const app = express()

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', router)

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`)
  })
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
