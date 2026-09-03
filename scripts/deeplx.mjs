import { readFile } from 'node:fs/promises'

// The endpoint is deliberately read at runtime. It must never be placed in
// source code, generated JSON, or a GitHub Actions log.
const ENV_KEYS = ['DEEPLX_ENDPOINT', 'DEEPLX_API_URL']
let warned = false
let localEnvLoaded = false
let unavailable = false
export let lastTranslationSucceeded = false
const retryLimit = () => Math.max(0, Number(process.env.DEEPLX_RETRIES || 2))
const retryDelay = () => Math.max(250, Number(process.env.DEEPLX_RETRY_DELAY_MS || 1500))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const cache = new Map()

function readEnvFile(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

async function loadLocalEnv() {
  if (localEnvLoaded) return
  localEnvLoaded = true
  // Node scripts do not load Vite's .env files automatically. Supporting the
  // ignored local files keeps the same setup convenient for npm run locales.
  for (const file of ['.env.local', '.env']) {
    try { readEnvFile(await readFile(file, 'utf8')) } catch { /* optional */ }
  }
}

function endpoint() {
  return endpointCandidates()[0]
}

function endpointCandidates() {
  const configured = [
    ...ENV_KEYS.map(key => process.env[key] || ''),
    ...(process.env.DEEPLX_ENDPOINTS || '').split(','),
  ]
  return [...new Set(configured.map(value => String(value).trim()).filter(value => /^https?:\/\//i.test(value)))]
}

function fallbackWarning(error) {
  if (warned) return
  warned = true
  const reason = error instanceof Error ? error.message : String(error)
  console.warn(`DeepLX translation unavailable; using the offline glossary (${reason.slice(0, 120)}).`)
}

export async function translateText(value, fallback = value) {
  lastTranslationSucceeded = false
  const original = String(value ?? '')
  if (!original.trim()) return original
  const fallbackFn = typeof fallback === 'function' ? fallback : () => String(fallback ?? original)
  await loadLocalEnv()
  const urls = endpointCandidates()
  if (!urls.length) return fallbackFn(original)
  // Avoid hammering a rate-limited/offline endpoint for every record in a
  // large snapshot. One failed request is enough to switch this run to the
  // deterministic glossary fallback; a later invocation can try again.
  if (unavailable) return fallbackFn(original)
  const key = original
  if (cache.has(key)) { lastTranslationSucceeded = true; return cache.get(key) }

  try {
    let lastError = 'no endpoint response'
    for (const url of urls) {
      let response
      for (let attempt = 0; attempt <= retryLimit(); attempt += 1) {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: original, source_lang: 'EN', target_lang: 'ZH' }),
          signal: AbortSignal.timeout(20_000),
        })
        if (response.status !== 429 || attempt >= retryLimit()) break
        const retryAfter = Number(response.headers.get('retry-after'))
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : retryDelay() * (attempt + 1))
      }
      if (!response.ok) { lastError = `HTTP ${response.status} from ${url}`; continue }
      const payload = await response.json()
      const translated = typeof payload.data === 'string' ? payload.data
        : Array.isArray(payload.data) ? payload.data[0]
        : typeof payload.translation === 'string' ? payload.translation
        : typeof payload.text === 'string' ? payload.text
        : ''
      // Public mirrors occasionally return an HTML/error link in `data`.
      // Reject URL-shaped or HTML responses instead of persisting corruption.
      if (!translated?.trim() || /^https?:\/\//i.test(translated.trim()) || /<\/?html[ >]/i.test(translated)) { lastError = 'invalid translation payload'; continue }
      cache.set(key, translated)
      lastTranslationSucceeded = true
      return translated
    }
    throw new Error(lastError)
  } catch (error) {
    unavailable = true
    fallbackWarning(error)
    return fallbackFn(original)
  }
}

// Send several independent strings in one DeepLX request. The separator is
// deliberately uncommon and checked after translation; if a provider drops
// or changes it, callers receive deterministic per-item fallbacks instead.
export async function translateBatch(values, fallbacks = []) {
  const input = values.map(value => String(value ?? ''))
  if (!input.length) return []
  const separator = '\n\nZXQ_BATCH_SEPARATOR_7F3A9C\n\n'
  const fallback = input.map((value, index) => String(fallbacks[index] ?? value)).join(separator)
  const translated = await translateText(input.join(separator), fallback)
  if (!lastTranslationSucceeded) return input.map((value, index) => String(fallbacks[index] ?? value))
  const parts = String(translated).split(separator)
  return parts.length === input.length ? parts : input.map((value, index) => String(fallbacks[index] ?? value))
}

// Translate only text nodes so links, images, and formatting in guide HTML
// remain intact. The fallback function is applied to each node independently.
export async function translateHtml(html, fallback = value => value) {
  const parts = String(html ?? '').split(/(<[^>]+>)/g)
  for (let index = 0; index < parts.length; index += 1) {
    if (!parts[index] || parts[index].startsWith('<') || !parts[index].trim()) continue
    const leading = parts[index].match(/^\s*/)?.[0] || ''
    const trailing = parts[index].match(/\s*$/)?.[0] || ''
    const coreEnd = trailing ? parts[index].length - trailing.length : parts[index].length
    const core = parts[index].slice(leading.length, coreEnd)
    if (!core.trim()) continue
    parts[index] = leading + await translateText(core, fallback) + trailing
  }
  return parts.join('')
}

// Translate while keeping canonical names (species, moves, places, etc.)
// byte-for-byte intact. Terms are replaced with opaque tokens before sending
// text to DeepLX and restored afterwards.
export async function translateProtected(value, terms = [], fallback = value => value) {
  const original = String(value ?? '')
  const ordered = [...new Set(terms.filter(Boolean).map(String))].sort((a, b) => b.length - a.length)
  const replacements = []
  let protectedText = original
  ordered.forEach((term, index) => {
    const token = `ZXQTERM${index}ZXQ`
    const pattern = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}(?![A-Za-z0-9])`, 'gi')
    if (pattern.test(protectedText)) { protectedText = protectedText.replace(pattern, token); replacements.push([token, term]) }
  })
  const translated = await translateText(protectedText, () => typeof fallback === 'function' ? fallback(original) : String(fallback ?? original))
  return replacements.reduce((text, [token, term]) => text.replace(new RegExp(token, 'gi'), term), translated)
}

export async function translateHtmlProtected(html, terms = [], fallback = value => value) {
  const parts = String(html ?? '').split(/(<[^>]+>)/g)
  const nodes = []
  for (let index = 0; index < parts.length; index += 1) {
    if (!parts[index] || parts[index].startsWith('<') || !parts[index].trim()) continue
    const leading = parts[index].match(/^\s*/)?.[0] || ''
    const trailing = parts[index].match(/\s*$/)?.[0] || ''
    const coreEnd = trailing ? parts[index].length - trailing.length : parts[index].length
    const core = parts[index].slice(leading.length, coreEnd)
    if (!core.trim()) continue
    const ordered = [...new Set(terms.filter(Boolean).map(String))].sort((a, b) => b.length - a.length)
    const replacements = []
    let protectedText = core
    ordered.forEach((term, tokenIndex) => {
      const token = `ZXQTERM${tokenIndex}ZXQ`
      const pattern = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}(?![A-Za-z0-9])`, 'gi')
      if (pattern.test(protectedText)) { protectedText = protectedText.replace(pattern, token); replacements.push([token, term]) }
    })
    nodes.push({ index, leading, trailing, core, protectedText, replacements })
  }
  if (!nodes.length) return parts.join('')
  const batchSize = Math.max(1, Number(process.env.DEEPLX_BATCH_SIZE || 12))
  for (let start = 0; start < nodes.length; start += batchSize) {
    const batch = nodes.slice(start, start + batchSize)
    const translated = await translateBatch(batch.map(node => node.protectedText), batch.map(node => typeof fallback === 'function' ? fallback(node.core) : String(fallback ?? node.core)))
    batch.forEach((node, offset) => {
      let value = translated[offset] || node.core
      for (const [token, term] of node.replacements) value = value.replace(new RegExp(token, 'gi'), term)
      parts[node.index] = node.leading + value + node.trailing
    })
  }
  return parts.join('')
}
