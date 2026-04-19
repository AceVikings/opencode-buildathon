/**
 * Influencer image generation service
 *
 * Uses gemini-3.1-flash-image-preview (Nano Banana 2) via @google/genai
 * generateContent with responseModalities: [Modality.IMAGE].
 *
 * To generate 4 candidates we make 4 parallel generateContent calls,
 * each returning one image (the model produces one image per call).
 *
 * Returns an array of base64-encoded PNG strings.
 */

const { GoogleGenAI, Modality } = require('@google/genai')

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set')

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview'
const NUM_CANDIDATES = 4

/**
 * Generate NUM_CANDIDATES portrait images from a text description.
 *
 * @param {string} prompt  Detailed description of the influencer's look
 * @returns {Promise<string[]>}  Array of base64-encoded PNG strings
 */
async function generateInfluencerImages(prompt) {
  const fullPrompt = [
    'Professional portrait photograph of a real-looking social media influencer.',
    prompt,
    'Ultra-realistic, editorial quality, natural lighting, sharp focus.',
    'Not a cartoon or illustration.',
  ].join(' ')

  // gemini-3.1-flash-image-preview produces one image per generateContent call.
  // Run NUM_CANDIDATES calls in parallel.
  const calls = Array.from({ length: NUM_CANDIDATES }, () =>
    ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: fullPrompt,
      config: {
        responseModalities: [Modality.IMAGE],
      },
    })
  )

  const results = await Promise.allSettled(calls)

  const images = []
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[imageGen] one candidate failed:', result.reason?.message ?? result.reason)
      continue
    }

    const response = result.value
    // Walk parts looking for inlineData image parts
    const candidates = response.candidates ?? []
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? []
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData?.data) {
          images.push(part.inlineData.data) // base64 string
        }
      }
    }
  }

  if (images.length === 0) {
    throw new Error(
      'gemini-3.1-flash-image-preview returned no images. ' +
      'Verify your API key has image generation access and the prompt is not blocked.'
    )
  }

  return images
}

module.exports = { generateInfluencerImages }
