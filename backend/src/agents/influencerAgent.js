/**
 * Influencer Brand Intelligence Agent
 *
 * Multi-agent architecture:
 *  1. BrandIntelAgent  — LangChain ReAct agent backed by 3 MCP tools
 *                        (fetch_url, parse_pdf_buffer, ingest_text).
 *                        Synthesises all brand sources into a brand brief.
 *  2. PersonaAgent     — Gemini model (no tools) that uses the brand brief
 *                        and persona fields to write a refined bio + image prompt.
 *
 * Usage:
 *   const { runBrandIntelAgent, runPersonaAgent } = require('./influencerAgent')
 *
 *   const brief  = await runBrandIntelAgent(sources)
 *   const result = await runPersonaAgent({ name, niche, bio, brandBrief: brief })
 */

const path = require('path')
const { MultiServerMCPClient } = require('@langchain/mcp-adapters')
const { createReactAgent } = require('@langchain/langgraph/prebuilt')
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai')
const { HumanMessage } = require('@langchain/core/messages')

// ── Model setup ──────────────────────────────────────────────────────────────

function getLLM(modelName = 'gemini-2.0-flash') {
  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.4,
  })
}

// ── Agent 1: Brand Intelligence Agent ────────────────────────────────────────
/**
 * Given an array of brand source descriptors, use the MCP tools to ingest
 * each source and synthesise them into a single brand brief.
 *
 * @param {Array<{ type: 'text'|'pdf'|'url', content: string, label?: string }>} sources
 * @returns {Promise<string>} Brand brief (markdown text)
 */
async function runBrandIntelAgent(sources) {
  if (!sources || sources.length === 0) {
    return 'No brand sources provided.'
  }

  // Build MCP client — spawns brandIntelServer.js as a subprocess
  const mcpClient = new MultiServerMCPClient({
    mcpServers: {
      'brand-intel': {
        transport: 'stdio',
        command: 'node',
        args: [path.resolve(__dirname, '../mcp/brandIntelServer.js')],
        restart: { enabled: false },
      },
    },
  })

  let brief = ''

  try {
    const tools = await mcpClient.getTools()
    const agent = createReactAgent({ llm: getLLM('gemini-2.0-flash'), tools })

    // Build the human message — instruct the agent to ingest each source
    const sourceInstructions = sources
      .map((s, i) => {
        if (s.type === 'url') {
          return `Source ${i + 1} (website): Use the fetch_url tool to retrieve content from: ${s.content}`
        }
        if (s.type === 'pdf') {
          // content is base64-encoded PDF
          return `Source ${i + 1} (PDF "${s.label ?? 'document'}"): Use the parse_pdf_buffer tool with the following base64 PDF data: ${s.content}`
        }
        // text
        return `Source ${i + 1} (text "${s.label ?? 'manual'}"): Use the ingest_text tool with this content:\n${s.content}`
      })
      .join('\n\n')

    const prompt = `You are a brand analyst. Your job is to read brand documents and produce a comprehensive Brand Brief.

Use the available tools to ingest the following brand sources, then synthesise all the information into a structured Brand Brief covering:
- Brand name & positioning
- Target audience
- Brand voice & tone  
- Key products or services
- Visual aesthetic & style guidelines
- Core values & messaging pillars

Sources to ingest:
${sourceInstructions}

After ingesting all sources, write the final Brand Brief in clear markdown.`

    const result = await agent.invoke({ messages: [new HumanMessage(prompt)] })
    const lastMessage = result.messages[result.messages.length - 1]
    brief = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content)
  } finally {
    await mcpClient.close()
  }

  return brief
}

// ── Agent 2: Persona Agent ────────────────────────────────────────────────────
/**
 * Given the persona fields and brand brief, produce:
 *  - A refined bio for the influencer
 *  - A detailed image generation prompt
 *
 * @param {{ name: string, niche: string, bio: string, platforms: string[], brandBrief: string, imagePrompt: string }} input
 * @returns {Promise<{ refinedBio: string, imagePrompt: string }>}
 */
async function runPersonaAgent({ name, niche, bio, platforms = [], brandBrief, imagePrompt }) {
  const llm = getLLM('gemini-2.0-flash')

  const prompt = `You are a creative director building an AI influencer persona.

Given the following information, produce two outputs:

1. REFINED_BIO — A compelling, authentic-sounding social media bio (2-3 sentences, first person) that reflects the brand's voice and the influencer's niche.

2. IMAGE_PROMPT — A detailed, photography-style prompt for generating a realistic portrait photo of this influencer. Include: gender presentation (if inferable from the name/description), approximate age range, distinctive physical features, clothing style that matches the brand aesthetic, setting/background, lighting style, mood. Be specific and evocative.

Influencer details:
- Name: ${name}
- Niche: ${niche || 'lifestyle'}
- Platforms: ${platforms.join(', ') || 'Instagram'}
- Draft bio: ${bio || 'Not provided'}
- User image description: ${imagePrompt || 'Not provided'}

Brand Brief:
${brandBrief || 'No brand brief available.'}

Respond in this exact JSON format (no markdown fences):
{
  "refinedBio": "...",
  "imagePrompt": "..."
}`

  const response = await llm.invoke([new HumanMessage(prompt)])
  const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

  // Strip potential markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // If JSON parse fails, extract with regex as fallback
    const bioMatch = cleaned.match(/"refinedBio"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    const promptMatch = cleaned.match(/"imagePrompt"\s*:\s*"([\s\S]*?)(?<!\\)"/)
    return {
      refinedBio: bioMatch?.[1] ?? bio ?? '',
      imagePrompt: promptMatch?.[1] ?? imagePrompt ?? '',
    }
  }
}

module.exports = { runBrandIntelAgent, runPersonaAgent }
