/**
 * Influencer routes
 *
 * All routes are protected (require Firebase auth).
 *
 * ── Persona ──────────────────────────────────────────────────────────────────
 * POST   /api/influencers                   Create a new influencer (persona step)
 * GET    /api/influencers                   List all influencers for the authed user
 * GET    /api/influencers/:id               Get single influencer
 * PATCH  /api/influencers/:id/persona       Update persona fields (name, bio, niche, platforms, goal)
 * DELETE /api/influencers/:id               Delete an influencer
 *
 * ── Brand intelligence ───────────────────────────────────────────────────────
 * POST   /api/influencers/:id/brand/text    Ingest a text chunk
 * POST   /api/influencers/:id/brand/url     Ingest a URL
 * POST   /api/influencers/:id/brand/pdf     Upload + ingest a PDF (multipart/form-data)
 * POST   /api/influencers/:id/brand/analyse Run brand intelligence agent → brand brief
 * DELETE /api/influencers/:id/brand/:srcId  Remove a brand source
 *
 * ── Avatar generation (HeyGen) ───────────────────────────────────────────────
 * POST   /api/influencers/:id/avatars/generate  Generate 4 HeyGen prompt-avatars
 * POST   /api/influencers/:id/avatars/select    Select one candidate avatar
 *
 * ── UGC / Video generation (HeyGen) ──────────────────────────────────────────
 * POST   /api/influencers/:id/videos/generate   Start a HeyGen video (returns videoId)
 * GET    /api/influencers/:id/videos/:videoId   Poll video status from HeyGen
 *
 * ── X account (per-influencer) ────────────────────────────────────────────────
 * GET    /api/influencers/:id/x/status      Get X connection status for this influencer
 * POST   /api/influencers/:id/x/post        Post a tweet as this influencer (saves XPost record)
 * DELETE /api/influencers/:id/x/disconnect  Revoke + remove X connection for this influencer
 *
 * ── Post analytics ────────────────────────────────────────────────────────────
 * GET    /api/influencers/:id/x/posts       List all XPost records for this influencer
 * GET    /api/influencers/:id/x/analytics   Aggregate metrics summary across all posts
 *
 * ── Agents ────────────────────────────────────────────────────────────────────
 * POST   /api/influencers/:id/agents/short-term/run   Trigger short-term agent (async)
 * POST   /api/influencers/:id/agents/manual-post      Manual post: topic + optional script → video → tweet
 * POST   /api/influencers/:id/agents/long-term/run    Trigger long-term strategy agent (async)
 * GET    /api/influencers/:id/agents/logs              List all AgentLog entries (newest first)
 * GET    /api/influencers/:id/agents/logs/:logId       Get a single AgentLog with full steps
 * GET    /api/influencers/:id/agents/strategy          Get current long-term strategy doc
 *
 * ── Agent config & scheduling ─────────────────────────────────────────────────
 * PATCH  /api/influencers/:id/agents/config            Update agentEnabled/intervalMins/postApprovalMode
 * GET    /api/influencers/:id/agents/config            Get current agent config
 *
 * ── Approval workflow ─────────────────────────────────────────────────────────
 * GET    /api/influencers/:id/agents/pending           List pending_approval XPost drafts
 * POST   /api/influencers/:id/agents/posts/:postId/approve   Approve draft → post to X
 * POST   /api/influencers/:id/agents/posts/:postId/reject    Reject draft
 */

const { Router } = require('express')
const multer = require('multer')
const { authenticate } = require('../middleware/auth')
const Influencer = require('../models/Influencer')
const XConnection = require('../models/XConnection')
const XPost = require('../models/XPost')
const AgentLog = require('../models/AgentLog')
const { runBrandIntelAgent, runPersonaAgent } = require('../agents/influencerAgent')
const { runShortTermAgent } = require('../agents/shortTermAgent')
const { runLongTermAgent } = require('../agents/longTermAgent')
const { generateAvatarCandidates, createVideo, getVideoStatus } = require('../services/heygenService')
const { uploadFile, getSignedUrl } = require('../config/storage')

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── Auth guard on all routes ─────────────────────────────────────────────────
router.use(authenticate)

// ── Voices proxy ─────────────────────────────────────────────────────────────

/**
 * GET /api/influencers/voices
 * Proxies GET /v3/voices from HeyGen, filtering to English voices with previews.
 * Returns { voices: [{ id, name, gender, previewUrl }] }
 */
router.get('/voices', async (_req, res) => {
  const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY
  if (!HEYGEN_API_KEY) return res.status(503).json({ error: 'HEYGEN_API_KEY not configured' })

  try {
    // Fetch up to 100 English voices (has_more is true but 100 is plenty for a picker)
    const r = await fetch('https://api.heygen.com/v3/voices?language=English&limit=100', {
      headers: { 'x-api-key': HEYGEN_API_KEY },
    })
    const json = await r.json()
    const voices = (json.data ?? [])
      // Only include voices that have a preview URL so users can listen before choosing
      .filter(v => v.preview_audio_url && v.name?.trim())
      .map(v => ({
        id:         v.voice_id,
        name:       v.name.trim(),
        gender:     v.gender,
        previewUrl: v.preview_audio_url,
      }))

    return res.json({ voices })
  } catch (err) {
    console.error('[influencers/voices]', err.message)
    return res.status(500).json({ error: 'Failed to fetch voices' })
  }
})

// ── Ownership helper ─────────────────────────────────────────────────────────
async function getOwned(id, uid, res) {
  const inf = await Influencer.findById(id)
  if (!inf) { res.status(404).json({ error: 'Influencer not found' }); return null }
  if (inf.uid !== uid) { res.status(403).json({ error: 'Forbidden' }); return null }
  return inf
}

// ────────────────────────────────────────────────────────────────────────────
// PERSONA
// ────────────────────────────────────────────────────────────────────────────

// Create
router.post('/', async (req, res) => {
  const { name, bio, niche, platforms, goal } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const inf = await Influencer.create({
    uid: req.user.uid,
    name,
    bio: bio ?? '',
    niche: niche ?? '',
    platforms: platforms ?? [],
    goal: goal ?? '',
    status: 'persona_done',
  })
  return res.status(201).json(inf)
})

// List
router.get('/', async (req, res) => {
  const list = await Influencer.find({ uid: req.user.uid }).sort({ createdAt: -1 })
  return res.json(list)
})

// Get single
router.get('/:id', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return
  return res.json(inf)
})

// Update persona
router.patch('/:id/persona', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const allowed = ['name', 'bio', 'niche', 'platforms', 'goal']
  allowed.forEach((f) => { if (req.body[f] !== undefined) inf[f] = req.body[f] })
  if (inf.status === 'draft') inf.status = 'persona_done'
  await inf.save()
  return res.json(inf)
})

// Delete influencer (also removes linked XConnection)
router.delete('/:id', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  // Clean up X connection if one exists
  if (inf.xConnectionId) {
    await XConnection.deleteOne({ _id: inf.xConnectionId }).catch(() => {})
  }

  await Influencer.deleteOne({ _id: inf._id })
  return res.json({ deleted: true })
})

// ────────────────────────────────────────────────────────────────────────────
// BRAND INTELLIGENCE — source ingestion
// ────────────────────────────────────────────────────────────────────────────

// Add text chunk
router.post('/:id/brand/text', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const { text, label } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })

  inf.brandSources.push({ type: 'text', label: label ?? 'Manual text', content: text })
  await inf.save()
  return res.status(201).json({ sources: inf.brandSources })
})

// Add URL
router.post('/:id/brand/url', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  inf.brandSources.push({ type: 'url', label: url, content: url })
  await inf.save()
  return res.status(201).json({ sources: inf.brandSources })
})

// Upload + store PDF
router.post('/:id/brand/pdf', upload.single('pdf'), async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!req.file) return res.status(400).json({ error: 'PDF file is required (field: pdf)' })

  // Store original in GCS
  const gcsPath = `influencers/${inf._id}/brand-docs/${Date.now()}-${req.file.originalname}`
  await uploadFile(req.file.buffer, gcsPath, 'application/pdf')

  // Store base64 as content so the agent can parse it later without re-downloading
  const base64 = req.file.buffer.toString('base64')
  inf.brandSources.push({
    type: 'pdf',
    label: req.file.originalname,
    content: base64,
    gcsPath,
  })
  await inf.save()
  return res.status(201).json({ sources: inf.brandSources })
})

// Delete a brand source
router.delete('/:id/brand/:srcId', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const before = inf.brandSources.length
  inf.brandSources = inf.brandSources.filter((s) => s._id.toString() !== req.params.srcId)
  if (inf.brandSources.length === before) return res.status(404).json({ error: 'Source not found' })

  await inf.save()
  return res.json({ sources: inf.brandSources })
})

// ────────────────────────────────────────────────────────────────────────────
// BRAND INTELLIGENCE — agent analysis
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/brand/analyse', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (inf.brandSources.length === 0) {
    return res.status(400).json({ error: 'Add at least one brand source before analysing' })
  }

  // Feed sources to the brand intelligence agent
  const sources = inf.brandSources.map((s) => ({
    type: s.type,
    label: s.label,
    content: s.content,
  }))

  const brandBrief = await runBrandIntelAgent(sources)

  // Also run persona agent to get refined bio + image prompt
  const { refinedBio, imagePrompt } = await runPersonaAgent({
    name: inf.name,
    niche: inf.niche,
    bio: inf.bio,
    platforms: inf.platforms,
    brandBrief,
    imagePrompt: inf.imagePrompt,
  })

  inf.brandBrief = brandBrief
  if (refinedBio) inf.bio = refinedBio
  if (imagePrompt && !inf.imagePrompt) inf.imagePrompt = imagePrompt
  inf.status = 'brand_done'
  await inf.save()

  return res.json({
    brandBrief,
    refinedBio,
    imagePrompt,
    influencer: inf,
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AVATAR GENERATION (HeyGen)
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/influencers/:id/avatars/generate
 * Body: { prompt?: string }  — defaults to inf.imagePrompt if omitted
 *
 * Spawns 4 HeyGen prompt-based avatars in parallel, polls until completed,
 * and returns the candidate list with previewImageUrl + avatarId.
 */
router.post('/:id/avatars/generate', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const prompt = req.body.prompt ?? inf.imagePrompt
  if (!prompt) {
    return res.status(400).json({ error: 'Provide an appearance prompt or run brand analysis first' })
  }

  if (req.body.prompt && req.body.prompt !== inf.imagePrompt) {
    inf.imagePrompt = req.body.prompt
  }

  const candidates = await generateAvatarCandidates(prompt, inf.name)

  inf.avatarCandidates = candidates
  inf.status = 'image_generated'
  await inf.save()

  return res.json({ candidates, influencer: inf })
})

/**
 * POST /api/influencers/:id/avatars/select
 * Body: { avatarId: string, voiceId?: string }
 *
 * Saves the selected avatar (and optionally voice) to the influencer document.
 */
router.post('/:id/avatars/select', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const { avatarId, voiceId } = req.body
  if (!avatarId) return res.status(400).json({ error: 'avatarId is required' })

  const candidate = (inf.avatarCandidates ?? []).find((c) => c.avatarId === avatarId)
  if (!candidate) {
    return res.status(400).json({ error: 'avatarId is not one of the generated candidates' })
  }

  inf.heygenAvatarId = avatarId
  if (voiceId) inf.heygenVoiceId = voiceId
  inf.selectedImageUrl = candidate.previewImageUrl ?? null
  inf.selectedPreviewVideoUrl = candidate.previewVideoUrl ?? null
  inf.status = 'complete'
  await inf.save()

  return res.json({ influencer: inf })
})

// ────────────────────────────────────────────────────────────────────────────
// VIDEO / UGC GENERATION (HeyGen)
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/influencers/:id/videos/generate
 * Body: {
 *   script: string,
 *   voiceId?: string,
 *   title?: string,
 *   aspectRatio?: '16:9' | '9:16',
 *   resolution?: '1080p' | '720p' | '4k',
 *   motionPrompt?: string,
 *   expressiveness?: 'high' | 'medium' | 'low',
 * }
 *
 * Starts a HeyGen video generation job. Returns { videoId, status } immediately.
 * The client polls GET /api/influencers/:id/videos/:videoId for completion.
 */
router.post('/:id/videos/generate', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.heygenAvatarId) {
    return res.status(400).json({ error: 'No avatar selected for this influencer — complete Step 3 first' })
  }

  const { script, voiceId, title, aspectRatio, resolution, motionPrompt, expressiveness } = req.body
  if (!script || !script.trim()) {
    return res.status(400).json({ error: 'script is required' })
  }

  const { videoId, status } = await createVideo({
    avatarId: inf.heygenAvatarId,
    script: script.trim(),
    voiceId,
    title: title ?? `${inf.name} — ${new Date().toLocaleDateString()}`,
    aspectRatio,
    resolution,
    motionPrompt,
    expressiveness,
  })

  return res.status(201).json({ videoId, status })
})

/**
 * GET /api/influencers/:id/videos/:videoId
 * Polls HeyGen for the current status of a video generation job.
 * Returns { videoId, status, videoUrl, thumbnailUrl, duration, failureMessage }
 */
router.get('/:id/videos/:videoId', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const result = await getVideoStatus(req.params.videoId)
  return res.json(result)
})

// ────────────────────────────────────────────────────────────────────────────
// X ACCOUNT — per-influencer
// ────────────────────────────────────────────────────────────────────────────

const X_TWEETS_URL = 'https://api.x.com/2/tweets'
const X_MEDIA_UPLOAD_URL = 'https://api.x.com/2/media/upload'
const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke'

function xTokenHeaders() {
  const id = process.env.X_CLIENT_ID
  const secret = process.env.X_CLIENT_SECRET
  const h = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (secret) h.Authorization = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
  return h
}

async function getValidToken(conn) {
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    if (!process.env.X_CLIENT_SECRET) params.append('client_id', process.env.X_CLIENT_ID)
    const res = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: xTokenHeaders(), body: params.toString() })
    const data = await res.json()
    conn.accessToken = data.access_token
    if (data.refresh_token) conn.refreshToken = data.refresh_token
    conn.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    await conn.save()
  }
  return conn.accessToken
}

// GET /api/influencers/:id/x/status
router.get('/:id/x/status', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) return res.json({ connected: false })

  const conn = await XConnection.findById(inf.xConnectionId).lean()
  if (!conn) {
    // stale reference — clean it up
    inf.xConnectionId = null
    await inf.save()
    return res.json({ connected: false })
  }

  return res.json({
    connected: true,
    xUserId: conn.xUserId,
    xUsername: conn.xUsername,
    xName: conn.xName,
  })
})

/**
 * POST /api/influencers/:id/x/media/upload
 * multipart/form-data: field "media" (image/jpeg, image/png, image/webp, image/gif, video/mp4)
 *
 * Uploads media to X via POST /2/media/upload and returns { mediaId }.
 * The mediaId can then be passed to /x/post as mediaIds[].
 *
 * Images: upload directly as multipart/form-data, media_category=tweet_image.
 * Videos: the /2/media/upload endpoint currently supports images only for one-shot
 *         upload. Videos require the legacy chunked upload (/1.1/media/upload INIT/APPEND/FINALIZE).
 *         We detect video and route to the legacy chunked flow automatically.
 */
router.post('/:id/x/media/upload', upload.single('media'), async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) {
    return res.status(400).json({ error: 'No X account connected to this influencer' })
  }
  if (!req.file) {
    return res.status(400).json({ error: 'media file is required (field: media)' })
  }

  const conn = await XConnection.findById(inf.xConnectionId)
  if (!conn) {
    inf.xConnectionId = null
    await inf.save()
    return res.status(400).json({ error: 'X connection no longer exists — reconnect' })
  }

  const accessToken = await getValidToken(conn)
  const isVideo = req.file.mimetype.startsWith('video/')

  const xAuthHeader = { Authorization: `Bearer ${accessToken}` }

  if (isVideo) {
    // ── Video: chunked upload via legacy v1.1 endpoint ────────────────────
    const CHUNK_SIZE = 5 * 1024 * 1024
    const fileBuffer = req.file.buffer
    const totalBytes = fileBuffer.length

    // INIT
    const initParams = new URLSearchParams({
      command: 'INIT', total_bytes: String(totalBytes),
      media_type: req.file.mimetype, media_category: 'tweet_video',
    })
    const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { ...xAuthHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: initParams.toString(),
    })
    const initData = await initRes.json()
    const mediaId = initData.media_id_string

    // APPEND
    let segmentIndex = 0
    for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
      const chunk = fileBuffer.slice(offset, offset + CHUNK_SIZE)
      const form = new FormData()
      form.append('command', 'APPEND')
      form.append('media_id', mediaId)
      form.append('segment_index', String(segmentIndex++))
      form.append('media', new Blob([chunk], { type: req.file.mimetype }), req.file.originalname)
      await fetch('https://upload.twitter.com/1.1/media/upload.json', { method: 'POST', headers: xAuthHeader, body: form })
    }

    // FINALIZE
    const finalizeParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId })
    const finalizeRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { ...xAuthHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalizeParams.toString(),
    })
    const finalizeData = await finalizeRes.json()

    // Poll for processing if needed
    if (finalizeData.processing_info?.state === 'pending') {
      let checkAfter = finalizeData.processing_info.check_after_secs ?? 5
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, checkAfter * 1000))
        const statusRes = await fetch(
          `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
          { headers: xAuthHeader }
        )
        const statusData = await statusRes.json()
        const state = statusData.processing_info?.state
        if (state === 'succeeded') break
        if (state === 'failed') return res.status(422).json({ error: 'X video processing failed', detail: statusData.processing_info })
        checkAfter = statusData.processing_info?.check_after_secs ?? 5
      }
    }

    return res.json({ mediaId, mediaType: 'video' })
  }

  // ── Image: one-shot multipart upload via v2 endpoint ─────────────────────
  const form = new FormData()
  form.append('media', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname)
  form.append('media_category', 'tweet_image')

  const uploadRes = await fetch(X_MEDIA_UPLOAD_URL, { method: 'POST', headers: xAuthHeader, body: form })
  const uploadData = await uploadRes.json()

  const mediaId = uploadData.data?.id
  if (!mediaId) {
    return res.status(500).json({ error: 'X media upload did not return a media ID', detail: uploadData })
  }

  // Poll if processing (animated GIFs etc.)
  if (uploadData.data?.processing_info?.state === 'pending') {
    let checkAfter = uploadData.data.processing_info.check_after_secs ?? 3
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, checkAfter * 1000))
      const statusRes = await fetch(`https://api.x.com/2/media/upload?media_id=${mediaId}`, { headers: xAuthHeader })
      const statusData = await statusRes.json()
      const state = statusData.data?.processing_info?.state
      if (state === 'succeeded' || !state) break
      if (state === 'failed') return res.status(422).json({ error: 'X media processing failed' })
      checkAfter = statusData.data?.processing_info?.check_after_secs ?? 3
    }
  }

  return res.json({ mediaId, mediaType: 'image' })
})

// POST /api/influencers/:id/x/post  — body: { text, mediaIds?: string[] }
router.post('/:id/x/post', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) {
    return res.status(400).json({ error: 'No X account connected to this influencer' })
  }

  const { text, mediaIds } = req.body
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'text exceeds 280 characters' })
  }
  if (mediaIds && (!Array.isArray(mediaIds) || mediaIds.length > 4)) {
    return res.status(400).json({ error: 'mediaIds must be an array of up to 4 IDs' })
  }

  const conn = await XConnection.findById(inf.xConnectionId)
  if (!conn) {
    inf.xConnectionId = null
    await inf.save()
    return res.status(400).json({ error: 'X connection no longer exists — reconnect' })
  }

  const accessToken = await getValidToken(conn)

  const tweetBody = {
    text: text.trim(),
    ...(mediaIds?.length ? { media: { media_ids: mediaIds } } : {}),
  }

  const tweetRes = await fetch(X_TWEETS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tweetBody),
  })
  const tweetData = await tweetRes.json()
  const tweet = tweetData.data

  // Persist the post so analytics can be tracked
  await XPost.create({
    influencerId: inf._id.toString(),
    uid: req.user.uid,
    tweetId: tweet.id,
    text: tweet.text ?? text.trim(),
    postedAt: new Date(),
    mediaIds: mediaIds ?? [],
  })

  return res.status(201).json({ tweet })
})

// DELETE /api/influencers/:id/x/disconnect — revoke token + remove connection
router.delete('/:id/x/disconnect', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (inf.xConnectionId) {
    const conn = await XConnection.findById(inf.xConnectionId)
    if (conn) {
      // Best-effort revocation
      try {
        const params = new URLSearchParams({ token: conn.accessToken, token_type_hint: 'access_token' })
        await fetch(X_REVOKE_URL, { method: 'POST', headers: xTokenHeaders(), body: params.toString() })
      } catch (e) {
        console.warn('[x/disconnect] token revocation failed (continuing):', e.message)
      }
      await XConnection.deleteOne({ _id: conn._id })
    }
    inf.xConnectionId = null
    await inf.save()
  }

  return res.json({ disconnected: true })
})

// ── Post list & analytics ─────────────────────────────────────────────────────

/**
 * GET /api/influencers/:id/x/posts
 * Returns all XPost records for this influencer, newest first.
 */
router.get('/:id/x/posts', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const posts = await XPost.find({ influencerId: inf._id.toString() })
    .sort({ postedAt: -1 })
    .lean()

  return res.json({ posts })
})

/**
 * GET /api/influencers/:id/x/analytics
 * Returns per-post metrics and aggregate totals across all posts.
 */
router.get('/:id/x/analytics', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const posts = await XPost.find({ influencerId: inf._id.toString() })
    .sort({ postedAt: -1 })
    .lean()

  // Aggregate totals — sum all non-null metric values
  const METRIC_KEYS = [
    'impressions', 'engagements', 'likes', 'retweets', 'replies',
    'quote_tweets', 'bookmarks', 'url_clicks', 'user_profile_clicks',
    'detail_expands', 'follows',
  ]

  const totals = {}
  for (const key of METRIC_KEYS) {
    const values = posts.map((p) => p.metrics?.[key]).filter((v) => v !== null && v !== undefined)
    totals[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) : null
  }

  return res.json({
    postCount: posts.length,
    metricsUpdatedAt: posts[0]?.metricsUpdatedAt ?? null,
    totals,
    posts: posts.map((p) => ({
      tweetId: p.tweetId,
      text: p.text,
      postedAt: p.postedAt,
      metricsUpdatedAt: p.metricsUpdatedAt,
      metrics: p.metrics,
    })),
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AGENTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/influencers/:id/agents/short-term/run
 *
 * Triggers the short-term agent asynchronously.
 * Returns { logId, status: 'running' } immediately.
 * Client polls GET /agents/logs/:logId for completion.
 */
router.post('/:id/agents/short-term/run', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) {
    return res.status(400).json({ error: 'No X account connected — connect one in Step 3 first' })
  }

  // Create a placeholder log immediately so client has a logId to poll
  const log = await AgentLog.create({
    influencerId: inf._id.toString(),
    uid: req.user.uid,
    agentType: 'short_term',
    status: 'running',
    steps: [],
  })

  // Run agent in background — do not await
  runShortTermAgent(inf._id.toString(), req.user.uid)
    .catch((err) => console.error('[route/short-term]', err.message))

  return res.status(202).json({ logId: log._id.toString(), status: 'running' })
})

/**
 * POST /api/influencers/:id/agents/long-term/run
 *
 * Triggers the long-term strategy agent asynchronously.
 * Returns { logId, status: 'running' } immediately.
 */
router.post('/:id/agents/long-term/run', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const log = await AgentLog.create({
    influencerId: inf._id.toString(),
    uid: req.user.uid,
    agentType: 'long_term',
    status: 'running',
    steps: [],
  })

  runLongTermAgent(inf._id.toString(), req.user.uid)
    .catch((err) => console.error('[route/long-term]', err.message))

  return res.status(202).json({ logId: log._id.toString(), status: 'running' })
})

/**
 * GET /api/influencers/:id/agents/logs
 * Returns all agent logs for this influencer, newest first.
 * Steps are omitted for list view — fetch individual log for full trace.
 */
router.get('/:id/agents/logs', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const logs = await AgentLog.find({ influencerId: inf._id.toString() })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-steps')  // exclude heavy steps array from list
    .lean()

  return res.json({ logs })
})

/**
 * GET /api/influencers/:id/agents/logs/:logId
 * Returns a single agent log including the full reasoning steps.
 */
router.get('/:id/agents/logs/:logId', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const log = await AgentLog.findOne({
    _id: req.params.logId,
    influencerId: inf._id.toString(),
  }).lean()

  if (!log) return res.status(404).json({ error: 'Log not found' })
  return res.json({ log })
})

/**
 * GET /api/influencers/:id/agents/strategy
 */
router.get('/:id/agents/strategy', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return
  return res.json({ strategy: inf.longTermStrategy ?? '', updatedAt: inf.longTermStrategyUpdatedAt ?? null })
})

// ── Manual post ───────────────────────────────────────────────────────────────

/**
 * POST /api/influencers/:id/agents/manual-post
 * Body: { topic: string, customScript?: string }
 *
 * Immediately generates a video + posts to X (bypasses approval workflow).
 * Returns { logId, status } — client polls logs/:logId for completion.
 */
router.post('/:id/agents/manual-post', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) return res.status(400).json({ error: 'No X account connected' })
  if (!inf.heygenAvatarId) return res.status(400).json({ error: 'No avatar selected — complete Step 3 first' })

  const { topic, customScript } = req.body
  if (!topic && !customScript) return res.status(400).json({ error: 'topic or customScript is required' })

  const log = await AgentLog.create({
    influencerId: inf._id.toString(),
    uid: req.user.uid,
    agentType: 'short_term',
    status: 'running',
    steps: [],
  })

  runShortTermAgent(inf._id.toString(), req.user.uid, { manual: true, topic, customScript })
    .catch(err => console.error('[route/manual-post]', err.message))

  return res.status(202).json({ logId: log._id.toString(), status: 'running' })
})

// ── Agent config ──────────────────────────────────────────────────────────────

/**
 * GET /api/influencers/:id/agents/config
 */
router.get('/:id/agents/config', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return
  return res.json({
    agentEnabled: inf.agentEnabled,
    agentIntervalMins: inf.agentIntervalMins,
    postApprovalMode: inf.postApprovalMode,
    agentLastRanAt: inf.agentLastRanAt,
    agentNextRunAt: inf.agentNextRunAt,
  })
})

/**
 * PATCH /api/influencers/:id/agents/config
 * Body: { agentEnabled?, agentIntervalMins?, postApprovalMode? }
 *
 * Enabling the agent also sets agentNextRunAt = now + intervalMins so the
 * scheduler fires at the right time.
 */
router.patch('/:id/agents/config', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const { agentEnabled, agentIntervalMins, postApprovalMode } = req.body

  if (agentEnabled !== undefined) inf.agentEnabled = Boolean(agentEnabled)
  if (agentIntervalMins !== undefined) inf.agentIntervalMins = Math.max(5, Number(agentIntervalMins))
  if (postApprovalMode !== undefined && ['auto', 'approve'].includes(postApprovalMode)) {
    inf.postApprovalMode = postApprovalMode
  }

  // If enabling, schedule the first run immediately
  if (agentEnabled === true) {
    inf.agentNextRunAt = new Date(Date.now() + (inf.agentIntervalMins ?? 30) * 60_000)
  }

  await inf.save()
  return res.json({
    agentEnabled: inf.agentEnabled,
    agentIntervalMins: inf.agentIntervalMins,
    postApprovalMode: inf.postApprovalMode,
    agentNextRunAt: inf.agentNextRunAt,
  })
})

// ── Approval workflow ─────────────────────────────────────────────────────────

/**
 * GET /api/influencers/:id/agents/pending
 * Lists all pending_approval XPost drafts, newest first.
 */
router.get('/:id/agents/pending', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const pending = await XPost.find({
    influencerId: inf._id.toString(),
    approvalStatus: 'pending_approval',
  }).sort({ createdAt: -1 }).lean()

  return res.json({ pending })
})

/**
 * POST /api/influencers/:id/agents/posts/:postId/approve
 * Approves a pending draft → posts tweet to X → marks as posted.
 */
router.post('/:id/agents/posts/:postId/approve', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const draft = await XPost.findOne({ _id: req.params.postId, influencerId: inf._id.toString() })
  if (!draft) return res.status(404).json({ error: 'Draft not found' })
  if (draft.approvalStatus !== 'pending_approval') return res.status(400).json({ error: 'Post is not pending approval' })

  const conn = await XConnection.findById(inf.xConnectionId)
  if (!conn) return res.status(400).json({ error: 'X connection no longer exists — reconnect' })

  // Get fresh token
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken })
    if (!process.env.X_CLIENT_SECRET) params.append('client_id', process.env.X_CLIENT_ID)
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (process.env.X_CLIENT_SECRET) headers.Authorization = 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')
    const r = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: params.toString() })
    const d = await r.json()
    conn.accessToken = d.access_token
    if (d.refresh_token) conn.refreshToken = d.refresh_token
    conn.tokenExpiresAt = d.expires_in ? Date.now() + d.expires_in * 1000 : null
    await conn.save()
  }

  const postRes = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: draft.text }),
  })
  const postData = await postRes.json()
  if (!postRes.ok) return res.status(postRes.status).json({ error: 'X post failed', detail: postData })

  draft.tweetId = postData.data.id
  draft.postedAt = new Date()
  draft.approvalStatus = 'posted'
  await draft.save()

  return res.json({ post: draft })
})

/**
 * POST /api/influencers/:id/agents/posts/:postId/reject
 * Rejects a pending draft — marks it as rejected.
 */
router.post('/:id/agents/posts/:postId/reject', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const draft = await XPost.findOne({ _id: req.params.postId, influencerId: inf._id.toString() })
  if (!draft) return res.status(404).json({ error: 'Draft not found' })
  if (draft.approvalStatus !== 'pending_approval') return res.status(400).json({ error: 'Post is not pending approval' })

  draft.approvalStatus = 'rejected'
  await draft.save()
  return res.json({ rejected: true })
})

module.exports = router
