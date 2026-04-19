/**
 * HeyGen Service — native fetch, no axios
 */

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY
if (!HEYGEN_API_KEY) console.warn('[heygenService] HEYGEN_API_KEY not set')

const BASE = 'https://api.heygen.com'
const headers = () => ({ 'x-api-key': HEYGEN_API_KEY, 'Content-Type': 'application/json' })

const NUM_CANDIDATES = 4
const AVATAR_POLL_INTERVAL_MS = 5_000
const AVATAR_POLL_TIMEOUT_MS  = 120_000

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function heygenFetch(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`HeyGen ${res.status} ${path}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

async function pollAvatarLook(lookId) {
  const deadline = Date.now() + AVATAR_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const resp = await heygenFetch(`/v3/avatars/looks/${lookId}`)
    const look = resp.data
    if (look.status === 'completed') return look
    if (look.status === 'failed') throw new Error(`Avatar look ${lookId} failed: ${look.error?.message ?? 'unknown'}`)
    await sleep(AVATAR_POLL_INTERVAL_MS)
  }
  throw new Error(`Avatar look ${lookId} timed out after ${AVATAR_POLL_TIMEOUT_MS / 1000}s`)
}

async function generateAvatarCandidates(appearancePrompt, influencerName = 'Influencer') {
  const variants = [
    `${appearancePrompt}. Front-facing portrait, neutral expression.`,
    `${appearancePrompt}. Slight smile, confident pose.`,
    `${appearancePrompt}. Three-quarter angle, editorial lighting.`,
    `${appearancePrompt}. Candid, natural expression, warm lighting.`,
  ]

  const creations = await Promise.allSettled(
    variants.map((prompt, i) =>
      heygenFetch('/v3/avatars', {
        method: 'POST',
        body: JSON.stringify({ type: 'prompt', name: `${influencerName} — Candidate ${i + 1}`, prompt }),
      })
    )
  )

  const lookIds = []
  for (const result of creations) {
    if (result.status === 'rejected') {
      console.warn('[heygenService] Avatar creation failed:', result.reason?.message)
      continue
    }
    const lookId = result.value.data?.avatar_item?.id
    const groupId = result.value.data?.avatar_group?.id
    if (lookId) lookIds.push({ lookId, groupId })
  }

  if (lookIds.length === 0) throw new Error('All HeyGen avatar creation requests failed.')

  console.log(`[heygenService] Created ${lookIds.length} avatar look(s), polling…`)

  const polls = await Promise.allSettled(
    lookIds.map(({ lookId, groupId }) => pollAvatarLook(lookId).then(look => ({ look, groupId })))
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

  if (candidates.length === 0) throw new Error('All HeyGen avatar candidates failed to complete.')
  return candidates
}

async function createVideo({ avatarId, script, voiceId, title, aspectRatio = '9:16', resolution = '1080p', motionPrompt, expressiveness }) {
  const body = {
    type: 'avatar',
    avatar_id: avatarId,
    script,
    ...(voiceId        ? { voice_id: voiceId }          : {}),
    ...(title          ? { title }                       : {}),
    ...(aspectRatio    ? { aspect_ratio: aspectRatio }   : {}),
    ...(resolution     ? { resolution }                  : {}),
    ...(motionPrompt   ? { motion_prompt: motionPrompt } : {}),
    ...(expressiveness ? { expressiveness }              : {}),
  }

  const resp = await heygenFetch('/v3/videos', { method: 'POST', body: JSON.stringify(body) })
  const { video_id, status } = resp.data
  console.log(`[heygenService] Video creation started: ${video_id} (${status})`)
  return { videoId: video_id, status }
}

async function getVideoStatus(videoId) {
  const resp = await heygenFetch(`/v3/videos/${videoId}`)
  const d = resp.data
  return {
    videoId:        d.id ?? videoId,
    status:         d.status,
    videoUrl:       d.video_url       ?? null,
    thumbnailUrl:   d.thumbnail_url   ?? null,
    duration:       d.duration        ?? null,
    failureMessage: d.failure_message ?? null,
  }
}

module.exports = { generateAvatarCandidates, createVideo, getVideoStatus }
