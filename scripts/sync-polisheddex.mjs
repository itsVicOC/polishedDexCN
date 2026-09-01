/**
 * Static snapshot synchroniser. It intentionally keeps the source list and
 * expected counts in one place so upstream layout changes fail loudly.
 * Run with: npm run sync
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = 'https://www.polisheddex.app'
const collections = {
  pokemon: { path: '/pokemon', expected: 289 }, moves: { path: '/moves', expected: 255 },
  items: { path: '/items', expected: 396 }, abilities: { path: '/abilities', expected: 154 },
  // The public locations route displays 141 region pages, while its embedded
  // dataset contains 649 sub-area records (maps, caves and interiors).
  locations: { path: '/locations', expected: 141, expectedData: 649 }, trainers: { path: '/trainers', expected: 761 }
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}
function decodeNext(html) {
  const m = html.match(/self\.__next_f\.push\(\[1,\"([\s\S]*?)\"\]\)/)
  if (!m) throw new Error('Next.js data stream not found')
  return JSON.parse('"' + m[1] + '"')
}
function extractArray(decoded, key, expected) {
  const candidates = []
  let cursor = 0
  while (true) {
    const start = decoded.indexOf(`"${key}":[`, cursor)
    if (start < 0) break
    cursor = start + key.length + 3
    const arrStart = decoded.indexOf('[', start)
    let i = arrStart, depth = 0, inString = false, esc = false
    for (; i < decoded.length; i++) {
      const c = decoded[i]
      if (inString) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inString = false; continue }
      if (c === '"') { inString = true; continue }
      if (c === '[') depth++
      if (c === ']') { depth--; if (depth === 0) { try { candidates.push(JSON.parse(decoded.slice(arrStart, i + 1))) } catch {} break } }
    }
  }
  if (!candidates.length) return null
  return candidates.find(a=>a.length===expected) || candidates.sort((a,b)=>b.length-a.length)[0]
}
/** Extract an object value from the Next.js stream. A page can contain
 * several occurrences of the same key (for example JSON-LD breadcrumbs have
 * an `item` field), so callers may provide a predicate to select the object
 * with the expected shape. */
function extractObject(decoded, key, predicate = () => true) {
  let cursor = 0
  while (true) {
    const start = decoded.indexOf(`"${key}":`, cursor)
    if (start < 0) return null
    cursor = start + key.length + 3
    const objStart = decoded.indexOf('{', start)
    if (objStart < 0) continue
    let depth = 0, inString = false, esc = false
    for (let i = objStart; i < decoded.length; i++) {
      const c = decoded[i]
      if (inString) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inString = false; continue }
      if (c === '"') { inString = true; continue }
      if (c === '{') depth++
      if (c === '}' && --depth === 0) {
        try {
          const value = JSON.parse(decoded.slice(objStart, i + 1))
          if (predicate(value)) return value
        } catch { /* continue searching subsequent occurrences */ }
        break
      }
    }
  }
}
function countFromHtml(html, label) {
  // Next.js streams the numbers with HTML comment separators: Showing <!-- -->289.
  const cleaned = html.replace(/<!--.*?-->/g, '')
  const m = cleaned.match(/Showing\s+(\d+)\s+of\s+(\d+)/i)
  if (!m) throw new Error(`Could not find collection count for ${label}; page structure changed`)
  return Number(m[2])
}
function decodeEntities(text='') {
  return text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}
function compactPokemonForm(form = {}) {
  const compactMove = move => ({ id: move.id, name: move.name, level: move.level })
  return { types: form.types || [], abilities: (form.abilities || []).map(({ id, name, description }) => ({ id, name, description })), baseStats: form.baseStats || {}, height: form.height, weight: form.weight, growthRate: form.growthRate, genderRatio: form.genderRatio, hatchRate: form.hatchRate, hatchCycles: form.hatchCycles, catchRate: form.catchRate, baseExp: form.baseExp, evYield: form.evYield || {}, eggGroups: form.eggGroups || [], heldItems: Array.isArray(form.heldItems) ? form.heldItems.map(({ id, name, rarity }) => ({ id, name, rarity })) : [], movesets: Object.fromEntries(Object.entries(form.movesets || {}).map(([kind, moves]) => [kind, Array.isArray(moves) ? moves.map(compactMove) : []])) }
}

const guideTerms = [['Polished Crystal','抛光水晶'],['Pokémon','宝可梦'],['Pokédex','图鉴'],['Introduction','简介'],['Overview','概览'],['Walkthrough','流程攻略'],['Guide','指南'],['Guides','攻略'],['Route','道路'],['City','市'],['Town','镇'],['Cave','洞窟'],['Forest','森林'],['Tower','塔'],['Lake','湖'],['Gym','道馆'],['Badge','徽章'],['Trainer','训练家'],['Battle','战斗'],['Battles','战斗'],['Wild Pokémon','野生宝可梦'],['Encounter','遭遇'],['Encounters','遭遇'],['Items','物品'],['Item','物品'],['Moves','技能'],['Move','技能'],['Ability','特性'],['Abilities','特性'],['Evolution','进化'],['Evolutions','进化'],['Breeding','繁殖'],['Egg','蛋'],['Eggs','蛋'],['Team','队伍'],['Stats','能力值'],['Type','属性'],['Types','属性'],['Damage','伤害'],['Catch','捕获'],['Shiny','闪光'],['Location','地点'],['Locations','地点'],['Reward','奖励'],['Rewards','奖励'],['Tips','提示'],['Tip','提示'],['How to','如何'],['available','可用'],['required','需要'],['Level','等级'],['level','等级'],['Time','时间'],['Morning','早晨'],['Day','白天'],['Night','夜晚']]
const localizeGuide = value => guideTerms.reduce((text, [en, zh]) => text.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi'), zh), String(value || ''))
function extractGuideArticle(html) {
  const start = html.search(/<div[^>]*class="[^"]*prose prose-neutral[^"]*"[^>]*>/i)
  if (start < 0) return null
  const contentStart = html.indexOf('>', start) + 1
  const tags = /<\/?div\b[^>]*>/gi
  tags.lastIndex = contentStart
  let depth = 1, match, contentEnd = -1
  while ((match = tags.exec(html))) {
    if (match[0][1] === '/') depth--
    else if (!match[0].endsWith('/>')) depth++
    if (depth === 0) { contentEnd = match.index; break }
  }
  if (contentEnd < 0) return null
  return html.slice(contentStart, contentEnd)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+=("[^"]*"|'[^']*')/gi, '')
    .replace(/src="\/images\/guides\/([^"/]+)"/g, 'src="/assets/guides/$1"')
}

const manifest = { source, generatedAt: new Date().toISOString(), collections: {} }
for (const [name, cfg] of Object.entries(collections)) {
  const html = await fetchText(source + cfg.path)
  const count = countFromHtml(html, name)
  if (count !== cfg.expected) throw new Error(`${name}: expected ${cfg.expected}, received ${count}`)
  const decoded = decodeNext(html)
  const key = name === 'pokemon' ? 'pokemonList' : name
  const records = extractArray(decoded, key, cfg.expectedData || cfg.expected)
  const validRecords = records && records.length === (cfg.expectedData || cfg.expected) ? records : null
  if (validRecords) await writeFile(resolve('public/data', `${name}-source.json`), JSON.stringify(validRecords, null, 2))
  manifest.collections[name] = { path: cfg.path, count, dataCount: validRecords?.length || null, snapshot: Boolean(validRecords) }
}

// Events are a standalone reference page rather than a paginated collection.
// Snapshot all three public schedules on every sync so the calendar never
// falls back to invented sample entries.
{
  const decoded = decodeNext(await fetchText(source + '/events'))
  const daily = extractArray(decoded, 'dailyEvents', 7)
  const weekly = extractArray(decoded, 'weeklyEvents', 7)
  const rematches = extractArray(decoded, 'rematchEvents', 23)
  if (!daily || !weekly || !rematches) throw new Error('Events page structure changed')
  await writeFile(resolve('public/data/events.json'), JSON.stringify({ daily, weekly, rematches }, null, 2))
  manifest.collections.events = { path: '/events', count: daily.length + weekly.length + rematches.length, snapshot: true }
}

if (process.env.FULL_EVOLUTION_DETAILS === '1') {
  const decoded = decodeNext(await fetchText(source + '/evolutions'))
  const slugs = [...new Set([...decoded.matchAll(/"href":"\/evolutions\/([^"?#]+)"/g)].map(m => m[1]))]
  const details = {}
  for (let i = 0; i < slugs.length; i += 12) {
    const batch = await Promise.all(slugs.slice(i, i + 12).map(async slug => {
      const page = decodeNext(await fetchText(`${source}/evolutions/${slug}`))
      return [slug, { id: slug, relatedPokemon: extractArray(page, 'relatedPokemon'), evolutionChain: extractArray(page, 'evolutionChain') }]
    }))
    for (const [slug, data] of batch) if (data.relatedPokemon && data.evolutionChain) details[slug] = data
    console.log(`Fetched evolution chains ${Math.min(i + 12, slugs.length)}/${slugs.length}`)
  }
  if (Object.keys(details).length !== slugs.length) throw new Error(`Only fetched ${Object.keys(details).length}/${slugs.length} evolution chains`)
  await writeFile(resolve('public/data/evolutions.json'), JSON.stringify(details, null, 2))
  manifest.collections.evolutions = { path: '/evolutions', count: slugs.length, snapshot: true }
}
if (process.env.FULL_GUIDES === '1') {
  const index = await fetchText(source + '/guides')
  const links = [...index.matchAll(/href="\/guides\/([^"#?]+)"[^>]*>([^<]+)<\/a>/g)]
  const decodedLinks = [...decodeNext(index).matchAll(/"href":"\/guides\/([^"#?]+)"/g)]
  const slugs = [...new Set([...links.map(m => m[1]), ...decodedLinks.map(m => m[1])])]
  if (slugs.length < 40) throw new Error(`Guide index returned only ${slugs.length} article links`)
  const guides = []
  for (let i = 0; i < slugs.length; i += 8) {
    const batch = await Promise.all(slugs.slice(i, i + 8).map(async slug => {
      const html = await fetchText(`${source}/guides/${slug}`)
      const title = decodeEntities(html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || slug)
      const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '')
      const category = html.match(/<meta name="category" content="([^"]*)"/i)?.[1] || 'guide'
      const article = extractGuideArticle(html)
      const hero = html.match(/src="(\/images\/guides\/[^"]+)"/)?.[1]
      return article ? { id: slug, title, titleZh: localizeGuide(title), description, descriptionZh: localizeGuide(description), category, hero: hero ? hero.replace('/images/guides/', '/assets/guides/') : null, html: article, htmlZh: localizeGuide(article) } : null
    }))
    guides.push(...batch.filter(Boolean))
    console.log(`Fetched guides ${Math.min(i + 8, slugs.length)}/${slugs.length}`)
  }
  if (guides.length !== slugs.length) throw new Error(`Only fetched ${guides.length}/${slugs.length} guides`)
  await mkdir(resolve('public/data/guides'), { recursive: true })
  for (const guide of guides) await writeFile(resolve('public/data/guides', `${guide.id}.json`), JSON.stringify(guide))
  const indexData = guides.map(({ html, ...metadata }) => metadata)
  await writeFile(resolve('public/data/guides.json'), JSON.stringify(indexData, null, 2))
  manifest.collections.guides = { path: '/guides', count: guides.length, snapshot: true }
}
if (process.env.FULL_DETAILS === '1') {
  const indexDecoded = decodeNext(await fetchText(source + '/pokemon'))
  const base = extractArray(indexDecoded, 'pokemonList', 289) || []
  const slugs = base.map(x => x.id)
  const details = {}
  for (let i = 0; i < slugs.length; i += 12) {
    const batch = await Promise.all(slugs.slice(i, i + 12).map(async slug => {
      const html = await fetchText(`${source}/pokemon/${slug}`)
      const decoded = decodeNext(html)
      return [slug, extractObject(decoded, 'pokemonData')]
    }))
    for (const [slug, data] of batch) if (data) details[slug] = data
    console.log(`Fetched Pokémon details ${Math.min(i + 12, slugs.length)}/${slugs.length}`)
  }
  if (Object.keys(details).length !== slugs.length) throw new Error(`Only fetched ${Object.keys(details).length}/${slugs.length} Pokémon details`)
  await writeFile(resolve('public/data/pokemon-details-source.json'), JSON.stringify(details, null, 2))
  const compact = Object.fromEntries(Object.entries(details).map(([slug, d]) => {
    const forms = d?.versions?.polished?.forms || d?.versions?.faithful?.forms || {}
    const plain = forms.plain || Object.values(forms).find(f => f && f.baseStats && f.types) || {}
    return [slug, { id: d.id, name: d.name, dexNo: d.dexNo, form: compactPokemonForm(plain) }]
  }))
  await writeFile(resolve('public/data/pokemon-details.json'), JSON.stringify(compact))
} else {
  try {
    const details = JSON.parse(await readFile(resolve('public/data/pokemon-details-source.json'), 'utf8'))
    const compact = Object.fromEntries(Object.entries(details).map(([slug, d]) => {
      const forms = d?.versions?.polished?.forms || d?.versions?.faithful?.forms || {}
      const plain = forms.plain || Object.values(forms).find(f => f && f.baseStats && f.types) || {}
      return [slug, { id: d.id, name: d.name, dexNo: d.dexNo, form: compactPokemonForm(plain) }]
    }))
    await writeFile(resolve('public/data/pokemon-details.json'), JSON.stringify(compact))
  } catch { /* full detail snapshot is optional until FULL_DETAILS=1 is run */ }
}
if (process.env.FULL_LOCATION_DETAILS === '1') {
  const locations = JSON.parse(await readFile(resolve('public/data/locations-source.json'), 'utf8'))
  const details = {}
  for (let i = 0; i < locations.length; i += 12) {
    const batch = await Promise.all(locations.slice(i, i + 12).map(async loc => {
      try {
        const html = await fetchText(`${source}/locations/${loc.id}`)
        return [loc.id, extractObject(decodeNext(html), 'location')]
      } catch (e) { console.warn('location skip', loc.id, e.message); return [loc.id, null] }
    }))
    for (const [id, data] of batch) if (data) details[id] = data
    console.log(`Fetched location details ${Math.min(i + 12, locations.length)}/${locations.length}`)
  }
  if (Object.keys(details).length < locations.length * 0.95) throw new Error(`Only fetched ${Object.keys(details).length}/${locations.length} location details`)
  await writeFile(resolve('public/data/location-details-source.json'), JSON.stringify(details))
}
if (process.env.FULL_TRAINER_DETAILS === '1') {
  const trainers = JSON.parse(await readFile(resolve('public/data/trainers-source.json'), 'utf8'))
  const details = {}
  for (let i = 0; i < trainers.length; i += 12) {
    const batch = await Promise.all(trainers.slice(i, i + 12).map(async trainer => {
      try {
        const html = await fetchText(`${source}/trainers/${trainer.id}`)
        return [trainer.id, extractObject(decodeNext(html), 'trainer')]
      } catch (e) { console.warn('trainer skip', trainer.id, e.message); return [trainer.id, null] }
    }))
    for (const [id, data] of batch) if (data) details[id] = data
    console.log(`Fetched trainer details ${Math.min(i + 12, trainers.length)}/${trainers.length}`)
  }
  if (Object.keys(details).length < trainers.length * 0.95) throw new Error(`Only fetched ${Object.keys(details).length}/${trainers.length} trainer details`)
  await writeFile(resolve('public/data/trainer-details-source.json'), JSON.stringify(details))
}
if (process.env.FULL_ITEM_DETAILS === '1') {
  const items = JSON.parse(await readFile(resolve('public/data/items-source.json'), 'utf8'))
  const details = {}
  for (let i = 0; i < items.length; i += 12) {
    const batch = await Promise.all(items.slice(i, i + 12).map(async item => {
      try {
        const html = await fetchText(`${source}/items/${item.id}`)
        return [item.id, extractObject(decodeNext(html), 'item', value => Boolean(value?.versions && value?.id))]
      } catch (e) { console.warn('item skip', item.id, e.message); return [item.id, null] }
    }))
    for (const [id, data] of batch) if (data) details[id] = data
    console.log(`Fetched item details ${Math.min(i + 12, items.length)}/${items.length}`)
  }
  if (Object.keys(details).length < items.length * 0.95) throw new Error(`Only fetched ${Object.keys(details).length}/${items.length} item details`)
  const malformed = Object.entries(details).filter(([, value]) => !value?.versions?.polished?.attributes)
  if (malformed.length) throw new Error(`Malformed item details for ${malformed.length} records (missing polished attributes)`)
  await writeFile(resolve('public/data/item-details-source.json'), JSON.stringify(details))
}
await mkdir(resolve('public/data'), { recursive: true })
for (const [name, sourceName] of Object.entries({ pokemon: 'pokemon-source', moves: 'moves-source', items: 'items-source', abilities: 'abilities-source', locations: 'locations-source', trainers: 'trainers-source' })) {
  try { await writeFile(resolve('public/data', `${name}.json`), await readFile(resolve('public/data', `${sourceName}.json`))) } catch {}
}
await writeFile(resolve('public/data/manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Validated ${Object.keys(manifest.collections).length} PolishedDex collections.`)
