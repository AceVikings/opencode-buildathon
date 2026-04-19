/**
 * Gemini image generation service
 *
 * Uses @google/genai ai.models.generateImages with imagen-3.0-fast-generate-001
 * (the "nano banana 2" model requested — fast, 4 images per call).
 *
 * Returns an array of base64-encoded PNG strings.
 */

const { GoogleGenAI } = require('@google/genai')

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set')

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })

// Model: imagen-3.0-fast-generate-001  (fast, production-ready, 4 images/call)
const IMAGE_MODEL = 'imagen-3.0-fast-generate-001'

/**
 * Generate 4 candidate influencer images from a text description.
 *
 * @param {string} prompt   - Detailed description of the influencer's look
 * @returns {Promise<string[]>}  Array of base64-encoded PNG strings (up to 4)
 */
async function generateInfluencerImages(prompt) {
  // Wrap the user description in a photography-style prompt for realistic results
  const fullPrompt = [
    'Professional portrait photograph of a real-looking social media influencer.',
    prompt,
    'Ultra-realistic, editorial quality, natural lighting, sharp focus.',
    'Not a cartoon or illustration.',
  ].join(' ')

  const response = await ai.models.generateImages({
    model: IMAGE_MODEL,
    prompt: fullPrompt,
    config: {
      numberOfImages: 4,
      aspectRatio: '1:1',
      outputMimeType: 'image/png',
    },
  })

  // Each item in generatedImages has an .image.imageData (base64 string)
  const images = (response.generatedImages ?? [])
    .map((img) => img?.image?.imageData)
    .filter(Boolean)

  if (images.length === 0) {
    throw new Error('Gemini returned no images. Check your API key and prompt.')
  }

  return images
}

module.exports = { generateInfluencerImages }
