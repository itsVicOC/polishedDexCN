import { readFile, writeFile } from 'node:fs/promises'
import { translateText, translateBatch, lastTranslationSucceeded } from './deeplx.mjs'

// Translate source descriptions once and keep the result in a deterministic,
// offline table consumed by build-app-data.mjs. Canonical Pokémon/move/item/
// ability/location names are protected so DeepLX cannot replace official
// terminology with an invented transliteration.
const load = name => readFile(`public/data/${name}.json`, 'utf8').then(JSON.parse)
const [pokemon, moves, items, abilities, locations, locationDetails, itemDetails] = await Promise.all([
  'pokemon-source', 'moves-source', 'items-source', 'abilities-source',
  'locations-source', 'location-details-source', 'item-details-source',
].map(load))

const names = new Set(['Pokémon', 'Pokédex', 'Polished Crystal'])
for (const record of pokemon) names.add(record.name)
for (const record of moves) {
  names.add(record.name)
  for (const version of Object.values(record.versions || {})) if (version?.name) names.add(version.name)
}
for (const record of items) {
  names.add(record.name)
  for (const version of Object.values(record.versions || {})) if (version?.name) names.add(version.name)
}
for (const record of abilities) names.add(record.name)
for (const record of locations) names.add(record.name)
const protectedTerms = [...names].filter(Boolean).sort((a, b) => b.length - a.length)

const glossaryTerms = [
  ['Pokémon', '宝可梦'], ['Pokédex', '图鉴'], ['Polished Crystal', '抛光水晶'],
  ['physical', '物理'], ['special', '特殊'], ['status', '变化'],
  ['Sp.Atk', '特攻'], ['Sp.Def', '特防'], ['Attack', '攻击'], ['Defense', '防御'],
  ['HP', 'HP'], ['PP', 'PP'], ['TM', '技能机器'], ['HM', '秘传技'],
]
const glossary = value => glossaryTerms.reduce((text, [en, zh]) => text.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\b`, 'gi'), zh), String(value || ''))

function protect(value) {
  let text = String(value || '')
  const replacements = []
  for (let index = 0; index < protectedTerms.length; index += 1) {
    const term = protectedTerms[index]
    const token = `ZXQTERM${index}ZXQ`
    const pattern = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}(?![A-Za-z0-9])`, 'gi')
    if (pattern.test(text)) {
      text = text.replace(pattern, token)
      replacements.push([token, term])
    }
  }
  return { text, replacements }
}
function restore(value, replacements) {
  let text = String(value || '')
  for (const [token, term] of replacements) text = text.replace(new RegExp(token, 'gi'), term)
  return text
}

const cache = {}
try { Object.assign(cache, JSON.parse(await readFile('public/data/content-zh.json', 'utf8'))) } catch { /* first run */ }
const refresh = process.env.DEEPLX_REFRESH === '1'
cache._meta ||= {}
let dirty = 0
let processed = 0
const translate = async (kind, id, field, value) => {
  if (!value || !String(value).trim()) return ''
  cache[kind] ||= {}
  cache[kind][id] ||= {}
  cache._meta[kind] ||= {}
  cache._meta[kind][id] ||= {}
  // Only a confirmed DeepLX response is terminal. Glossary fallbacks remain
  // eligible for retry on the next invocation when the endpoint recovers.
  if (!refresh && cache[kind][id][field] && cache._meta[kind][id][field] === 'deeplx') return cache[kind][id][field]
  const original = String(value)
  const { text, replacements } = protect(original)
  const translated = await translateText(text, () => glossary(original))
  const result = restore(translated, replacements)
  cache[kind][id][field] = result || glossary(original)
  const fallbackText = glossary(original)
  cache._meta[kind][id][field] = lastTranslationSucceeded ? 'deeplx' : 'fallback'
  dirty += 1
  processed += 1
  if (dirty >= 25) {
    await writeFile('public/data/content-zh.json', JSON.stringify(cache, null, 2))
    console.log(`Translation checkpoint: ${processed} source fields processed`)
    dirty = 0
  }
  return cache[kind][id][field]
}

const pending = []
const queue = (kind, id, field, value) => {
  if (!value || !String(value).trim()) return
  cache[kind] ||= {}; cache[kind][id] ||= {}; cache._meta[kind] ||= {}; cache._meta[kind][id] ||= {}
  if (!refresh && cache[kind][id][field] && cache._meta[kind][id][field] === 'deeplx') return
  const original = String(value)
  const { text, replacements } = protect(original)
  pending.push({ kind, id, field, original, text, replacements })
}
const flush = async () => {
  const size = Math.max(1, Number(process.env.DEEPLX_BATCH_SIZE || 12))
  while (pending.length) {
    const batch = pending.splice(0, size)
    const results = await translateBatch(batch.map(item => item.text), batch.map(item => glossary(item.original)))
    batch.forEach((item, index) => {
      const result = restore(results[index] || glossary(item.original), item.replacements)
      cache[item.kind][item.id][item.field] = result || glossary(item.original)
      cache._meta[item.kind][item.id][item.field] = lastTranslationSucceeded && result !== glossary(item.original) ? 'deeplx' : 'fallback'
    })
    dirty += batch.length; processed += batch.length
    if (dirty >= 25) { await writeFile('public/data/content-zh.json', JSON.stringify(cache, null, 2)); console.log(`Translation checkpoint: ${processed} source fields processed`); dirty = 0 }
  }
}

for (const record of pokemon) queue('pokemon', record.id, 'description', record.dexEntry?.description)
for (const record of moves) {
  const version = record.versions?.polished || record.versions?.faithful || {}
  queue('moves', record.id, 'effect', version.description)
}
for (const record of abilities) {
  const version = record.versions?.polished || record.versions?.faithful || {}
  queue('abilities', record.id, 'effect', version.description)
}
for (const record of items) {
  const detail = itemDetails[record.id] || record
  const version = detail.versions?.polished || detail.versions?.faithful || {}
  queue('items', record.id, 'effect', version.description)
  queue('items', record.id, 'use', version.use)
}
for (const record of locations) {
  const detail = locationDetails[record.id] || {}
  // Location pages do not expose prose descriptions; this mirrors the source
  // page's fallback sentence while still localizing the visible content.
  const description = detail.description || `${record.name} in Pokémon Polished Crystal.`
  queue('locations', record.id, 'description', description)
}

await flush()

// Keep a key for every source record, including entries without prose fields,
// so completeness checks can distinguish an intentionally empty description
// from a missing translation record.
for (const [kind, records] of [['pokemon', pokemon], ['moves', moves], ['items', items], ['abilities', abilities], ['locations', locations]]) {
  cache[kind] ||= {}
  for (const record of records) cache[kind][record.id] ||= {}
}

await writeFile('public/data/content-zh.json', JSON.stringify(cache, null, 2))
console.log(`Localized content: ${pokemon.length} Pokémon, ${moves.length} moves, ${items.length} items, ${abilities.length} abilities, ${locations.length} locations.`)
