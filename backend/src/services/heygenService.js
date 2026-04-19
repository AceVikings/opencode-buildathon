/**
 * HeyGen Service
 *
 * Wraps the HeyGen v3 API for two use-cases:
 *
 * 1. Avatar generation (Step 3 of influencer creation)
 *    - Creates 4 prompt-based avatars in parallel from the appearance description
 *    - Polls until each avatar's status is 'completed' or 'failed'
 *    - Returns avatar candidates with preview_image_url + avatar_id (look id)
 *
 * 2. UGC / Video generation
 *    - Accepts an avatar_id (look id) + script + optional voice_id
 *    - Creates a POST /v3/videos job and returns the video_id immediately
 *    - Caller polls GET /v3/videos/:id for status / video_url / thumbnail_url
 *
 * Auth: x-api-key header (not Bearer).
 * Base URL: https://api.heygen.com
 */

const axios = require('axios')

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY
if (!HEYGEN_API_KEY) console.warn('[heygenService] HEYGEN_API_KEY not set — HeyGen calls will fail')

const BASE = 'https://api.heygen.com'
const HEADERS = () => ({
  'x-api-key': HEYGEN_API_KEY,
  'Content-Type': 'application/json',
})

const NUM_CANDIDATES = 4
const AVATAR_POLL_INTERVAL_MS = 5_000
const AVATAR_POLL_TIMEOUT_MS  = 120_000  // 2 min — prompt avatars train fast

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll GET /v3/avatars/looks/:id until status is 'completed' or 'failed'.
 * Returns the final AvatarLookItem.
 */
async function pollAvatarLook(lookId) {
  const deadline = Date.now() + AVATAR_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { data: resp } = await axios.get(`${BASE}/v3/avatars/looks/${lookId}`, {
      headers: HEADERS(),
    })
    const look = resp.data
    if (look.status === 'completed') return look
    if (look.status === 'failed') throw new Error(`Avatar look ${lookId} failed: ${look.error?.message ?? 'unknown'}`)
    await sleep(AVATAR_POLL_INTERVAL_MS)
  }
  throw new Error(`Avatar look ${lookId} timed out after ${AVATAR_POLL_TIMEOUT_MS / 1000}s`)
}

// ── Avatar generation ─────────────────────────────────────────────────────────

/**
 * Create NUM_CANDIDATES prompt-based avatars in parallel, wait for each to
 * complete, and return candidate objects the frontend can display.
 *
 * @param {string} appearancePrompt  Natural-language description of the avatar's look
 * @param {string} influencerName    Used as a name prefix for HeyGen dashboard
 * @returns {Promise<Array<{
 *   avatarId: string,          // look id — pass as avatar_id to createVideo
 *   groupId:  string,
 *   previewImageUrl: string | null,
 *   previewVideoUrl: string | null,
 * }>>}
 */
async function generateAvatarCandidates(appearancePrompt, influencerName = 'Influencer') {
  // Build a slightly varied prompt for each candidate so we get visual diversity
  const variants = [
    `${appearancePrompt}. Front-facing portrait, neutral expression.`,
    `${appearancePrompt}. Slight smile, confident pose.`,
    `${appearancePrompt}. Three-quarter angle, editorial lighting.`,
    `${appearancePrompt}. Candid, natural expression, warm lighting.`,
  ]

  // Fire off all creation requests in parallel
  const creations = await Promise.allSettled(
    variants.map((prompt, i) =>
      axios.post(`${BASE}/v3/avatars`, {
        type: 'prompt',
        name: `${influencerName} — Candidate ${i + 1}`,
        prompt,
      }, { headers: HEADERS() })
    )
  )

  // Collect look IDs from successful creations
  const lookIds = []
  for (const result of creations) {
    if (result.status === 'rejected') {
      console.warn('[heygenService] Avatar creation request failed:', result.reason?.response?.data ?? result.reason?.message)
      continue
    }
    const lookId = result.value.data?.data?.avatar_item?.id
    const groupId = result.value.data?.data?.avatar_group?.id
    if (lookId) lookIds.push({ lookId, groupId })
  }

  if (lookIds.length === 0) {
    throw new Error('All HeyGen avatar creation requests failed.')
  }

  console.log(`[heygenService] Created ${lookIds.length} avatar look(s), polling for completion…`)

  // Poll all in parallel
  const polls = await Promise.allSettled(
    lookIds.map(({ lookId, groupId }) =>
      pollAvatarLook(lookId).then((look) => ({ look, groupId }))
    )
  )

  const candidates = []
  for (const result of polls) {
    if (result.status === 'rejected') {
      console.warn('[heygenService] Avatar poll failed:', result.reason?.message)
      continue
    }
    const { look, groupId } = result.value
    candidates.push({
      avatarId: look.id,
      groupId: groupId ?? look.group_id ?? null,
      previewImageUrl: look.preview_image_url ?? null,
      previewVideoUrl: look.preview_video_url ?? null,
    })
  }

  if (candidates.length === 0) {
    throw new Error('All HeyGen avatar candidates failed to complete.')
  }

  return candidates
}

// ── Video / UGC generation ────────────────────────────────────────────────────

/**
 * Kick off a HeyGen video from an existing avatar look.
 * Returns immediately with { videoId, status }.
 * Caller should poll getVideoStatus(videoId) for completion.
 *
 * @param {object} opts
 * @param {string} opts.avatarId     HeyGen look id (avatar_id)
 * @param {string} opts.script       Text the avatar will speak
 * @param {string} [opts.voiceId]    HeyGen voice id (uses avatar default if omitted)
 * @param {string} [opts.title]      Display name in HeyGen dashboard
 * @param {string} [opts.aspectRatio] '16:9' | '9:16' (default '9:16' for social)
 * @param {string} [opts.resolution] '1080p' | '720p' | '4k' (default '1080p')
 * @param {string} [opts.motionPrompt]
 * @param {string} [opts.expressiveness] 'high' | 'medium' | 'low'
 * @returns {Promise<{ videoId: string, status: string }>}
 */
async function createVideo({
  avatarId,
  script,
  voiceId,
  title,
  aspectRatio = '9:16',
  resolution = '1080p',
  motionPrompt,
  expressiveness,
}) {
  const body = {
    type: 'avatar',
    avatar_id: avatarId,
    script,
    ...(voiceId        ? { voice_id: voiceId }              : {}),
    ...(title          ? { title }                           : {}),
    ...(aspectRatio    ? { aspect_ratio: aspectRatio }       : {}),
    ...(resolution     ? { resolution }                      : {}),
    ...(motionPrompt   ? { motion_prompt: motionPrompt }     : {}),
    ...(expressiveness ? { expressiveness }                  : {}),
  }

  const { data: resp } = await axios.post(`${BASE}/v3/videos`, body, { headers: HEADERS() })
  const { video_id, status } = resp.data

  console.log(`[heygenService] Video creation started: ${video_id} (status: ${status})`)
  return { videoId: video_id, status }
}

/**
 * Poll GET /v3/videos/:id once and return current status info.
 *
 * @param {string} videoId
 * @returns {Promise<{
 *   videoId: string,
 *   status: 'pending'|'processing'|'completed'|'failed',
 *   videoUrl: string | null,
 *   thumbnailUrl: string | null,
 *   duration: number | null,
 *   failureMessage: string | null,
 * }>}
 */
async function getVideoStatus(videoId) {
  const { data: resp } = await axios.get(`${BASE}/v3/videos/${videoId}`, {
    headers: HEADERS(),
  })
  const d = resp.data
  return {
    videoId:        d.id ?? videoId,
    status:         d.status,
    videoUrl:       d.video_url        ?? null,
    thumbnailUrl:   d.thumbnail_url    ?? null,
    duration:       d.duration         ?? null,
    failureMessage: d.failure_message  ?? null,
  }
}

module.exports = { generateAvatarCandidates, createVideo, getVideoStatus }
