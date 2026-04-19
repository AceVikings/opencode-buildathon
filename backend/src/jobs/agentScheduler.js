/**
 * Agent Scheduler
 *
 * Polls every 60 seconds. For each influencer where agentEnabled=true, checks
 * whether agentNextRunAt has passed and, if so, fires runShortTermAgent.
 *
 * After each run (or error), updates agentLastRanAt and schedules agentNextRunAt
 * = now + agentIntervalMins.
 *
 * This intentionally uses a coarse poll loop rather than per-influencer timeouts
 * so that:
 *  - New influencers or config changes are picked up within 60 s
 *  - Server restarts resume correctly (next run is stored in the DB)
 *  - No unbounded timer accumulation
 */

const Influencer = require('../models/Influencer')
const { runShortTermAgent } = require('../agents/shortTermAgent')

const POLL_MS = 60_000   // check every 60 s

// Prevent concurrent runs for the same influencer
const running = new Set()

async function tick() {
  const now = new Date()

  // Find all enabled influencers whose next run time has passed
  const due = await Influencer.find({
    agentEnabled: true,
    status: 'complete',
    xConnectionId: { $ne: null },
    $or: [
      { agentNextRunAt: { $lte: now } },
      { agentNextRunAt: null },
    ],
  }).select('_id uid agentIntervalMins agentNextRunAt').lean()

  for (const inf of due) {
    const id = inf._id.toString()
    if (running.has(id)) continue   // already in-flight

    running.add(id)
    console.log(`[agentScheduler] ▶ influencer=${id}`)

    // Fire and forget — do not await inside the loop
    ;(async () => {
      try {
        await runShortTermAgent(id, inf.uid)
        const intervalMs = Math.max(5, inf.agentIntervalMins ?? 30) * 60_000
        await Influencer.findByIdAndUpdate(id, {
          agentLastRanAt: new Date(),
          agentNextRunAt: new Date(Date.now() + intervalMs),
        })
      } catch (err) {
        console.error(`[agentScheduler] ✗ influencer=${id}:`, err.message)
        // Still advance the clock to avoid tight retry loops on persistent errors
        const intervalMs = Math.max(5, inf.agentIntervalMins ?? 30) * 60_000
        await Influencer.findByIdAndUpdate(id, {
          agentNextRunAt: new Date(Date.now() + intervalMs),
        }).catch(() => {})
      } finally {
        running.delete(id)
      }
    })()
  }
}

function startAgentScheduler() {
  // Initial tick after 15 s (let the server fully boot)
  setTimeout(() => tick().catch(err => console.error('[agentScheduler] tick error:', err.message)), 15_000)
  setInterval(() => tick().catch(err => console.error('[agentScheduler] tick error:', err.message)), POLL_MS)
  console.log('[agentScheduler] Started — polling every 60 s')
}

module.exports = { startAgentScheduler }
