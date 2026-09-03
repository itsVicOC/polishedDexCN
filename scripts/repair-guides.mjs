import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { resolve } from 'node:path'

const guideDir = resolve('public/data/guides')
const transparent = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

function localAsset(value) {
  let url = String(value || '').replaceAll('&amp;', '&')
  if (url.startsWith('/_next/image?')) {
    try { url = decodeURIComponent(new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('url') || url) } catch { /* keep original */ }
  }
  url = url.split('?')[0]
  if (url.startsWith('/_next/')) return transparent
  let match = url.match(/^\/images\/guides\/(.+)$/)
  if (match) return `/assets/guides/${match[1]}`
  match = url.match(/^\/sprites\/[^/]+\/([^/]+)\.png$/)
  if (match) return `/assets/items/${match[1]}.png`
  match = url.match(/^\/sprites\/pokemon\/([^/]+)\/(normal_front|normal_back|shiny_front|shiny_back)\.png$/)
  if (match) {
    const suffix = { normal_front: '', normal_back: '-back', shiny_front: '-shiny', shiny_back: '-shiny-back' }[match[2]]
    return `/assets/sprites/${match[1]}${suffix}.png`
  }
  return url
}

function rewriteImages(html) {
  return String(html || '')
    .replace(/\bsrc="([^"]+)"/gi, (_, value) => `src="${localAsset(value)}"`)
    .replace(/\bsrcset="([^"]+)"/gi, (_, value) => {
      if (value.includes('data:image/')) return `srcset="${value}"`
      return `srcset="${value.split(',').map(entry => { const [url, ...descriptor] = entry.trim().split(/\s+/); return [localAsset(url), ...descriptor].join(' ') }).join(', ')}"`
    })
}

async function hideMissingImages(html) {
  const values = [...String(html || '').matchAll(/\bsrc="([^"]+)"/gi)]
  const missing = new Set()
  for (const [, value] of values) {
    if (!value.startsWith('/assets/')) continue
    try { await access(resolve('public', value.slice(1))) } catch { missing.add(value) }
  }
  return String(html || '').replace(/\bsrc="([^"]+)"/gi, (_, value) => `src="${missing.has(value) ? transparent : value}"`)
}

// The old translator was allowed to translate attributes. Restore every tag
// from the canonical English HTML while keeping translated text nodes.
function restoreTags(source, translated) {
  const sourceParts = String(source || '').split(/(<[^>]+>)/g)
  const translatedParts = String(translated || '').split(/(<[^>]+>)/g)
  const tags = sourceParts.filter(part => part.startsWith('<'))
  let index = 0
  return translatedParts.map(part => {
    if (!part.startsWith('<')) return part
    const canonical = tags[index++]
    return canonical || part
  }).join('')
}

const files = (await readdir(guideDir)).filter(file => file.endsWith('.json'))
for (const file of files) {
  const path = resolve(guideDir, file)
  const guide = JSON.parse(await readFile(path, 'utf8'))
  guide.html = await hideMissingImages(rewriteImages(guide.html))
  guide.htmlZh = await hideMissingImages(rewriteImages(restoreTags(guide.html, guide.htmlZh || guide.html)))
  if (guide.hero) {
    guide.hero = localAsset(guide.hero)
    if (guide.hero.startsWith('/assets/')) {
      try { await access(resolve('public', guide.hero.slice(1))) } catch { guide.hero = transparent }
    }
  }
  await writeFile(path, JSON.stringify(guide))
}
console.log(`Repaired ${files.length} guide snapshots.`)

// Keep the repair script honest: no upstream Next.js image proxy URLs remain.
for (const file of files) {
  const guide = JSON.parse(await readFile(resolve(guideDir, file), 'utf8'))
  if (/_next\/image|\bsrc(?:set)?="\/sprites\//.test(`${guide.html}\n${guide.htmlZh}`)) throw new Error(`Unnormalized guide assets: ${file}`)
}
