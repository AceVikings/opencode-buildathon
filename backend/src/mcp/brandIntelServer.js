#!/usr/bin/env node
/**
 * Brand Intelligence MCP Server
 *
 * Exposes three tools over stdio that the influencer agent uses to ingest brand context:
 *   - fetch_url        : crawls a website and returns cleaned text
 *   - parse_pdf_buffer : parses a base64-encoded PDF buffer and returns text
 *   - ingest_text      : returns raw text verbatim (validates + trims)
 *
 * Run standalone:  node src/mcp/brandIntelServer.js
 * The parent process connects via stdio (LangChain MultiServerMCPClient).
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const axios = require('axios')
const cheerio = require('cheerio')
const { PDFParse } = require('pdf-parse')

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanHtml(html) {
  const $ = cheerio.load(html)
  // Remove noise elements
  $('script, style, nav, footer, header, [role="navigation"], .cookie-banner, iframe, noscript').remove()
  const text = $('body').text()
  // Collapse whitespace
  return text.replace(/\s+/g, ' ').trim().slice(0, 20000)
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'brand-intel',
  version: '1.0.0',
})

// Tool 1 — fetch_url
server.tool(
  'fetch_url',
  'Fetch a public URL and return the main text content (up to 20,000 chars). Use this to ingest a brand website.',
  { url: z.string().url().describe('The full URL to fetch (must be http/https)') },
  async ({ url }) => {
    try {
      const resp = await axios.get(url, {
        timeout: 12000,
        maxContentLength: 5 * 1024 * 1024, // 5 MB cap
        headers: {
          'User-Agent': 'LoqueBot/1.0 (brand intelligence crawler)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
      const contentType = resp.headers['content-type'] ?? ''
      if (!contentType.includes('html')) {
        return {
          content: [
            {
              type: 'text',
              text: `Non-HTML response (${contentType}). Cannot extract text.`,
            },
          ],
          isError: true,
        }
      }
      const text = cleanHtml(resp.data)
      return {
        content: [{ type: 'text', text: text || 'No readable content found at this URL.' }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to fetch URL: ${err.message}` }],
        isError: true,
      }
    }
  }
)

// Tool 2 — parse_pdf_buffer
server.tool(
  'parse_pdf_buffer',
  'Parse a base64-encoded PDF buffer and return the extracted text (up to 30,000 chars).',
  {
    base64Pdf: z.string().describe('Base64-encoded content of the PDF file'),
    filename: z.string().optional().describe('Original filename for context'),
  },
  async ({ base64Pdf, filename }) => {
    try {
      const buffer = Buffer.from(base64Pdf, 'base64')
      const parser = new PDFParse({ buffer })
      const result = await parser.getText()
      const text = (result.text ?? '').slice(0, 30000)
      return {
        content: [
          {
            type: 'text',
            text: text || `No text extracted from PDF${filename ? ` (${filename})` : ''}.`,
          },
        ],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `PDF parsing failed: ${err.message}` }],
        isError: true,
      }
    }
  }
)

// Tool 3 — ingest_text
server.tool(
  'ingest_text',
  'Accept raw text input from the user and return it cleaned and trimmed (up to 10,000 chars).',
  {
    text: z.string().min(1).describe('The raw text to ingest'),
    label: z.string().optional().describe('A short label for this text chunk'),
  },
  ({ text, label }) => {
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 10000)
    return {
      content: [
        {
          type: 'text',
          text: `[${label ?? 'Manual text'}]\n${cleaned}`,
        },
      ],
    }
  }
)

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // MCP servers communicate over stdio — log to stderr to avoid polluting the stream
  process.stderr.write('Brand Intel MCP server running\n')
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`)
  process.exit(1)
})
