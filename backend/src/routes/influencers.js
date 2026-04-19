/**
 * Influencer routes
 *
 * All routes are protected (require Firebase auth).
 *
 * ── Persona ──────────────────────────────────────────────────────────────────
 * POST   /api/influencers                   Create a new influencer (persona step)
 * GET    /api/influencers                   List all influencers for the authed user
 * GET    /api/influencers/:id               Get single influencer
 * PATCH  /api/influencers/:id/persona       Update persona fields
 *
 * ── Brand intelligence ───────────────────────────────────────────────────────
 * POST   /api/influencers/:id/brand/text    Ingest a text chunk
 * POST   /api/influencers/:id/brand/url     Ingest a URL
 * POST   /api/influencers/:id/brand/pdf     Upload + ingest a PDF (multipart/form-data)
 * POST   /api/influencers/:id/brand/analyse Run brand intelligence agent → brand brief
 * DELETE /api/influencers/:id/brand/:srcId  Remove a brand source
 *
 * ── Image generation ─────────────────────────────────────────────────────────
 * POST   /api/influencers/:id/images/generate  Generate 4 candidate images via Gemini
 * POST   /api/influencers/:id/images/select    Select one candidate (or upload custom)
 * POST   /api/influencers/:id/images/upload    Upload a custom image directly
 * GET    /api/influencers/:id/images/url       Get a fresh signed URL for the selected image
 */

const { Router } = require('express')
const multer = require('multer')
const { authenticate } = require('../middleware/auth')
const Influencer = require('../models/Influencer')
const { runBrandIntelAgent, runPersonaAgent } = require('../agents/influencerAgent')
const { generateInfluencerImages } = require('../services/imageGen')
const { uploadFile, getSignedUrl, bucket } = require('../config/storage')

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
  const { name, handle, bio, niche, platforms } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const inf = await Influencer.create({
    uid: req.user.uid,
    name,
    handle: handle ?? '',
    bio: bio ?? '',
    niche: niche ?? '',
    platforms: platforms ?? [],
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

  const allowed = ['name', 'handle', 'bio', 'niche', 'platforms']
  allowed.forEach((f) => { if (req.body[f] !== undefined) inf[f] = req.body[f] })
  if (inf.status === 'draft') inf.status = 'persona_done'
  await inf.save()
  return res.json(inf)
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

module.exports = router
