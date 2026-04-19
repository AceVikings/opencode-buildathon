#!/usr/bin/env node
/**
 * Brand scrape worker — runs as a child process spawned by influencerAgent.js.
 *
 * Protocol (stdio JSON lines):
 *   Parent → Worker:  one JSON line on stdin
 *   Worker → Parent:  one JSON line on stdout
 *
 * Input:  { type: 'url' | 'pdf' | 'text', content: string, label?: string }
 * Output: { ok: true, label: string, text: string }
 *       | { ok: false, label: string, error: string }
 *
 * URL scraping uses Playwright (Chromium headless) so JavaScript-rendered SPAs
 * are fully executed before content extraction. No axios — uses native fetch
 * for any HTTP requests outside the browser.
 */

const pdfParse = require('pdf-parse')
const { chromium } = require('playwright-core')

// ── HTML → readable text ──────────────────────────────────────────────────────

/**
 * Extract meaningful text from a fully-rendered Playwright page.
 * Returns up to 20,000 chars.
 */
async function extractPageText(page, url) {
  // 1. Grab metadata via evaluate (runs inside the page's JS context)
  const meta = await page.evaluate(() => {
    const get = (sel, attr = 'content') => document.querySelector(sel)?.[attr] ?? ''
    return {
      title:       document.title,
      description: get('meta[name="description"]') || get('meta[property="og:description"]'),
      ogTitle:     get('meta[property="og:title"]'),
      siteName:    get('meta[property="og:site_name"]'),
      keywords:    get('meta[name="keywords"]'),
    }
  })

  const metaLines = [
    meta.title       && `Title: ${meta.title}`,
    meta.description && `Description: ${meta.description}`,
    meta.ogTitle && meta.ogTitle !== meta.title && `OG Title: ${meta.ogTitle}`,
    meta.siteName    && `Site: ${meta.siteName}`,
    meta.keywords    && `Keywords: ${meta.keywords}`,
  ].filter(Boolean).join('\n')

  // 2. Extract visible body text — remove noise elements first
  const bodyText = await page.evaluate(() => {
    // Remove non-content elements
    const remove = ['script', 'style', 'nav', 'footer', 'header', 'iframe',
                    'noscript', '[role="navigation"]', '.cookie-banner',
                    '.cookie-consent', '[aria-hidden="true"]']
    remove.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove())
    })

    // Prefer semantic containers
    const containers = ['main', 'article', '[role="main"]', '.content',
                        '.container', '#__next', '#root', '#app', 'body']
    for (const sel of containers) {
      const el = document.querySelector(sel)
      if (el) {
        const t = el.innerText?.replace(/\s+/g, ' ').trim()
        if (t && t.length > 100) return t
      }
    }
    return document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? ''
  })

  // 3. JSON-LD structured data
  const jsonLd = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    return scripts.map(s => s.textContent ?? '').join(' ').slice(0, 2000)
  })

  const parts = [metaLines, bodyText.slice(0, 15000), jsonLd].filter(Boolean).join('\n\n').trim()

  if (!parts) {
    return `[Could not extract readable text from ${url}. The page may require login or be empty.]`
  }

  return parts.slice(0, 20000)
}

// ── Source handlers ───────────────────────────────────────────────────────────

async function processUrl(content, label) {
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      // Block images/fonts to speed up loading
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    })

    await context.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['image', 'font', 'media'].includes(type)) return route.abort()
      return route.continue()
    })

    const page = await context.newPage()

    await page.goto(content, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // Extra wait for JS-heavy SPAs that render after networkidle
    await page.waitForTimeout(1500)

    const text = await extractPageText(page, content)
    return { ok: true, label, text }
  } finally {
    await browser?.close()
  }
}

async function processPdf(content, label) {
  const buffer = Buffer.from(content, 'base64')
  const result = await pdfParse(buffer)
  const text = (result.text ?? '').trim().slice(0, 30000) || 'No text found in PDF.'
  return { ok: true, label, text }
}

function processText(content, label) {
  const text = content.replace(/\s+/g, ' ').trim().slice(0, 10000)
  return { ok: true, label, text }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let raw = ''

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

  const tag = source.label || source.type

  try {
    let result
    if (source.type === 'url')  result = await processUrl(source.content, tag)
    else if (source.type === 'pdf')  result = await processPdf(source.content, tag)
    else result = processText(source.content, tag)

    process.stdout.write(JSON.stringify(result) + '\n')
    process.exit(0)
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, label: tag, error: err.message }) + '\n')
    process.exit(1)
  }
}

main()
