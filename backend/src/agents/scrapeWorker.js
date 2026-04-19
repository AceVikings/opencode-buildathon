#!/usr/bin/env node
/**
 * Brand scrape worker — runs as a child process spawned by influencerAgent.js.
 *
 * Protocol (stdio JSON lines):
 *   Parent → Worker:  one JSON line on stdin describing the source to ingest
 *   Worker → Parent:  one JSON line on stdout with the extracted text or an error
 *
 * Input schema:
 *   { type: 'url' | 'pdf' | 'text', content: string, label?: string }
 *
 * Output schema:
 *   { ok: true,  label: string, text: string }
 *   { ok: false, label: string, error: string }
 *
 * The worker exits after processing exactly one message, so the orchestrator
 * can spawn N workers for N sources concurrently without any lifecycle management.
 */

const axios = require('axios')
const cheerio = require('cheerio')
const pdfParse = require('pdf-parse')

// ── Helpers ───────────────────────────────────────────────────────────────────

function scrapeHtml(html) {
  const $ = cheerio.load(html)
  $('script,style,nav,footer,header,iframe,noscript,[role="navigation"],.cookie-banner').remove()
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000)
}

async function processSource({ type, content, label }) {
  const tag = label || type

  if (type === 'url') {
    const resp = await axios.get(content, {
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'LoqueBot/1.0 (brand intelligence)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
    })
    const ct = resp.headers['content-type'] ?? ''
    if (ct.includes('html')) return { ok: true, label: tag, text: scrapeHtml(resp.data) }
    const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    return { ok: true, label: tag, text: raw.slice(0, 20000) }
  }

  if (type === 'pdf') {
    const buffer = Buffer.from(content, 'base64')
    const result = await pdfParse(buffer)
    const text = (result.text ?? '').trim().slice(0, 30000) || 'No text found in PDF.'
    return { ok: true, label: tag, text }
  }

  // text — pass through cleaned
  const cleaned = content.replace(/\s+/g, ' ').trim().slice(0, 10000)
  return { ok: true, label: tag, text: cleaned }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let raw = ''

  // Read one line from stdin
  await new Promise((resolve) => {
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { raw += chunk })
    process.stdin.on('end', resolve)
  })

  let source
  try {
    source = JSON.parse(raw.trim())
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, label: 'unknown', error: 'Invalid JSON input' }) + '\n')
    process.exit(1)
  }

  try {
    const result = await processSource(source)
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exit(0)
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false,
      label: source.label || source.type,
      error: err.message,
    }) + '\n')
    process.exit(1)
  }
}

main()
