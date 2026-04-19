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
 */

const { Router } = require('express')
const multer = require('multer')
const axios = require('axios')
const { authenticate } = require('../middleware/auth')
const Influencer = require('../models/Influencer')
const XConnection = require('../models/XConnection')
const XPost = require('../models/XPost')
const { runBrandIntelAgent, runPersonaAgent } = require('../agents/influencerAgent')
const { generateAvatarCandidates, createVideo, getVideoStatus } = require('../services/heygenService')
const { uploadFile, getSignedUrl } = require('../config/storage')

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── Auth guard on all routes ─────────────────────────────────────────────────
router.use(authenticate)

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
// IMAGE GENERATION
// ────────────────────────────────────────────────────────────────────────────

// Generate 4 candidates
router.post('/:id/images/generate', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const prompt = req.body.prompt ?? inf.imagePrompt
  if (!prompt) {
    return res.status(400).json({ error: 'Provide a prompt or run brand analysis first' })
  }

  // Update stored prompt if a new one was passed
  if (req.body.prompt && req.body.prompt !== inf.imagePrompt) {
    inf.imagePrompt = req.body.prompt
  }

  // Generate 4 images (base64 PNGs)
  const base64Images = await generateInfluencerImages(prompt)

  // Store each candidate in GCS and collect paths
  const candidatePaths = await Promise.all(
    base64Images.map(async (b64, i) => {
      const buffer = Buffer.from(b64, 'base64')
      const gcsPath = `influencers/${inf._id}/candidates/${Date.now()}-${i}.png`
      await uploadFile(buffer, gcsPath, 'image/png')
      return gcsPath
    })
  )

  inf.imageCandidates = candidatePaths
  inf.status = 'image_generated'
  await inf.save()

  // Return signed URLs so the client can preview them
  const signedUrls = await Promise.all(
    candidatePaths.map((p) => getSignedUrl(p, 30 * 60 * 1000)) // 30 min
  )

  return res.json({ candidates: signedUrls, gcspaths: candidatePaths })
})

// Select one of the generated candidates
router.post('/:id/images/select', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  const { gcsPath } = req.body
  if (!gcsPath) return res.status(400).json({ error: 'gcsPath is required' })
  if (!inf.imageCandidates.includes(gcsPath)) {
    return res.status(400).json({ error: 'gcsPath is not one of the generated candidates' })
  }

  inf.selectedImageGcsPath = gcsPath
  const signedUrl = await getSignedUrl(gcsPath, 60 * 60 * 1000) // 1 hr
  inf.selectedImageUrl = signedUrl
  inf.status = 'complete'
  await inf.save()

  return res.json({ selectedImageUrl: signedUrl, influencer: inf })
})

// Upload a custom image directly (skips generation)
router.post('/:id/images/upload', upload.single('image'), async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!req.file) return res.status(400).json({ error: 'image file is required (field: image)' })

  const allowed = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowed.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Only PNG, JPEG and WEBP are accepted' })
  }

  const gcsPath = `influencers/${inf._id}/selected/${Date.now()}-${req.file.originalname}`
  await uploadFile(req.file.buffer, gcsPath, req.file.mimetype)
  const signedUrl = await getSignedUrl(gcsPath, 60 * 60 * 1000)

  inf.selectedImageGcsPath = gcsPath
  inf.selectedImageUrl = signedUrl
  inf.status = 'complete'
  await inf.save()

  return res.json({ selectedImageUrl: signedUrl, influencer: inf })
})

// Refresh the signed URL for the selected image
router.get('/:id/images/url', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.selectedImageGcsPath) {
    return res.status(404).json({ error: 'No selected image yet' })
  }

  const url = await getSignedUrl(inf.selectedImageGcsPath, 60 * 60 * 1000)
  inf.selectedImageUrl = url
  await inf.save()
  return res.json({ url })
})

// ────────────────────────────────────────────────────────────────────────────
// X ACCOUNT — per-influencer
// ────────────────────────────────────────────────────────────────────────────

const X_TWEETS_URL = 'https://api.x.com/2/tweets'
const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke'

function xBasicAuth() {
  const id = process.env.X_CLIENT_ID
  const secret = process.env.X_CLIENT_SECRET
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

async function getValidToken(conn) {
  const BUFFER = 5 * 60 * 1000
  if (conn.tokenExpiresAt && Date.now() >= conn.tokenExpiresAt - BUFFER && conn.refreshToken) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
    })
    const { data } = await axios.post(
      'https://api.x.com/2/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: xBasicAuth(),
        },
      }
    )
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

// POST /api/influencers/:id/x/post  — body: { text }
router.post('/:id/x/post', async (req, res) => {
  const inf = await getOwned(req.params.id, req.user.uid, res)
  if (!inf) return

  if (!inf.xConnectionId) {
    return res.status(400).json({ error: 'No X account connected to this influencer' })
  }

  const { text } = req.body
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'text exceeds 280 characters' })
  }

  const conn = await XConnection.findById(inf.xConnectionId)
  if (!conn) {
    inf.xConnectionId = null
    await inf.save()
    return res.status(400).json({ error: 'X connection no longer exists — reconnect' })
  }

  const accessToken = await getValidToken(conn)

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

  const tweet = tweetData.data

  // Persist the post so analytics can be tracked
  await XPost.create({
    influencerId: inf._id.toString(),
    uid: req.user.uid,
    tweetId: tweet.id,
    text: tweet.text ?? text.trim(),
    postedAt: new Date(),
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
        const params = new URLSearchParams({
          token: conn.accessToken,
          token_type_hint: 'access_token',
        })
        await axios.post(X_REVOKE_URL, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: xBasicAuth(),
          },
        })
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

module.exports = router
