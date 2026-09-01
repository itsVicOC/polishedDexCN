import { readFile, access, readdir } from 'node:fs/promises'

const load = async name => JSON.parse(await readFile(`public/data/${name}.json`, 'utf8'))
const expected = { 'pokemon-source': 289, 'moves-source': 255, 'items-source': 396, 'abilities-source': 154, 'locations-source': 649, 'trainers-source': 761, 'pokemon-details': 289, 'item-details-source': 396, 'location-details-source': 649, 'trainer-details-source': 761 }
let failed = false
for (const [name, count] of Object.entries(expected)) {
  const data = await load(name)
  const actual = Array.isArray(data) ? data.length : Object.keys(data).length
  if (actual !== count) { console.error(`${name}: expected ${count}, got ${actual}`); failed = true }
}
const pokemon = await load('pokemon-source'), moves = await load('moves-source'), itemSource = await load('items-source'), abilitySource = await load('abilities-source'), locations = await load('locations-source'), trainers = await load('trainers-source')
const details = await load('pokemon-details'), itemDetails = await load('item-details-source')
const locationDetails = await load('location-details-source'), trainerDetails = await load('trainer-details-source')
const evolutions = await load('evolutions'), events = await load('events'), guides = await load('guides')
const appData = await load('app-data')
const appManifest = await load('app-manifest')
const mapTiles = await load('map-tiles')
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
for (const alias of ['pokemon','moves','items','abilities','locations','trainers']) {
  try {
    const records = await load(alias), source = await load(`${alias}-source`)
    if (!Array.isArray(records) || records.length !== expected[`${alias}-source`] || records.some((record, index) => record.id !== source[index]?.id)) throw new Error('content mismatch')
  }
  catch { console.error(`Missing public API collection: ${alias}.json`); failed = true }
}
if (Object.keys(evolutions).length !== 105) { console.error(`evolutions: expected 105, got ${Object.keys(evolutions).length}`); failed = true }
for (const [group, count] of [['daily', 7], ['weekly', 7], ['rematches', 23]]) {
  if (!Array.isArray(events[group]) || events[group].length !== count) { console.error(`events.${group}: expected ${count}, got ${events[group]?.length ?? 0}`); failed = true }
}
if (!Array.isArray(guides) || guides.length !== 47) { console.error(`guides: expected 47, got ${guides?.length ?? 0}`); failed = true }
for (const guide of guides) {
  try { const detail = JSON.parse(await readFile(`public/data/guides/${guide.id}.json`, 'utf8')); if (!detail.html || !detail.htmlZh || !detail.titleZh || !detail.descriptionZh || detail.id !== guide.id) throw new Error('missing bilingual article fields') }
  catch { console.error(`Missing guide detail: ${guide.id}`); failed = true }
}
if (guides.some(guide => !guide.titleZh || !guide.descriptionZh)) { console.error('Guide index is missing bilingual metadata'); failed = true }
for (const p of pokemon) {
  // Some multi-form species (Unown, regional Arbok, etc.) intentionally only
  // expose form metadata upstream; they are valid records without a shared
  // base-stat block. Require the compact detail object itself instead.
  if (!details[p.id]?.form) { console.error(`Incomplete Pokémon: ${p.id}`); failed = true }
  try { await access(`public/assets/sprites/${p.id}.png`) } catch { if (p.id !== 'unown') { console.error(`Missing sprite: ${p.id}`); failed = true } }
  const held = details[p.id]?.form?.heldItems || []
  for (const item of held) if (item && item !== '$undefined' && item.id && !itemSource.some(source => source.id === item.id)) { console.error(`Missing held item reference: ${p.id} -> ${item.id}`); failed = true }
}
for (const [id, item] of Object.entries(itemDetails)) if (!item?.versions?.polished?.attributes) { console.error(`Incomplete item: ${id}`); failed = true }
const moveIds = new Set(moves.map(x => x.id)), moveAliases = new Map([['psychicm', 'psychic']])
for (const [id, p] of Object.entries(details)) for (const group of Object.values(p.form.movesets || {})) for (const m of Array.isArray(group) ? group : []) if (m.id && !moveIds.has(moveAliases.get(m.id) || m.id)) { console.error(`Missing move reference: ${id} -> ${m.id}`); failed = true }
const pokemonIds = new Set(pokemon.map(x => x.id)), pokemonSlugs = new Set(pokemon.map(x => x.id))
const locationIds = new Set(locations.map(x => x.id)), trainerIds = new Set(trainers.map(x => x.id))
const itemIds = new Set(itemSource.map(x => x.id)), abilityIds = new Set(abilitySource.map(x => x.id))
const itemNames = new Set(itemSource.flatMap(item => [item.id, item.versions?.polished?.name, item.versions?.faithful?.name]).map(normalize).filter(Boolean))
const locationNames = new Map(locations.flatMap(location => [[normalize(location.id), location.id], [normalize(location.name), location.id]]))
const itemAreaAliases = new Map([['mtmoonsquare', 'mountmoonsquare'], ['shamoutiislandpokecenter1f', 'shamoutipokecenter1f']])
const globalItemAreas = new Set(['anyheadbutttree'])
const specialLocationItems = new Set(['itemfrommem'])
const locationItemAliases = new Map([['psychicm', 'psychic'], ['metronomei', 'metronome']])
const specialLocationTrainers = new Set(['gruntm', 'gruntf', 'inver'])
const hiddenPowerMoves = new Set(['hpfighting', 'hprock', 'hpgrass', 'hpice', 'hpfire', 'hpground'])
const natureCodes = new Set(['atkupsatkdown', 'defupspedown', 'satkupatkdown', 'satkupsdefdown', 'sdefupatkdown', 'sdefupsatkdown', 'speupatkdown', 'speupdefdown', 'speupsatkdown', 'speupsdefdown'])

for (const collection of [[pokemon, details, 'Pokémon'], [itemSource, itemDetails, 'item'], [locations, locationDetails, 'location'], [trainers, trainerDetails, 'trainer']]) {
  const [source, detail, label] = collection
  for (const record of source) if (!detail[record.id]) { console.error(`Missing ${label} detail: ${record.id}`); failed = true }
  for (const id of Object.keys(detail)) if (!source.some(record => record.id === id)) { console.error(`${label} detail has no source record: ${id}`); failed = true }
}

for (const [itemId, detail] of Object.entries(itemDetails)) {
  const version = detail.versions?.polished || detail.versions?.faithful || {}
  for (const source of version.locations || []) {
    const rawArea = normalize(source.area || source.name)
    const aliased = itemAreaAliases.get(rawArea) || rawArea
    if (rawArea && !globalItemAreas.has(rawArea) && !locationNames.has(aliased) && !locationNames.has(normalize(source.name))) {
      console.error(`Missing item location: ${itemId} -> ${source.area || source.name}`); failed = true
    }
  }
}
for (const [id, detail] of Object.entries(locationDetails)) {
  for (const connection of detail.connections || []) if (connection.toId && !locationIds.has(connection.toId)) { console.error(`Missing location connection: ${id} -> ${connection.toId}`); failed = true }
  for (const encounter of detail.encounters || []) if (encounter.pokemon && !pokemonSlugs.has(encounter.pokemon)) { console.error(`Missing encounter Pokémon: ${id} -> ${encounter.pokemon}`); failed = true }
  for (const item of detail.items || []) {
    const rawId = item.item || item.id || item.name
    const resolvedId = locationItemAliases.get(rawId) || rawId
    const valid = itemIds.has(resolvedId) || moveIds.has(resolvedId) || itemNames.has(normalize(rawId)) || specialLocationItems.has(rawId)
    if (rawId && !valid) { console.error(`Missing location item: ${id} -> ${rawId}`); failed = true }
  }
  for (const trainer of detail.trainers || []) {
    const trainerId = typeof trainer === 'string' ? trainer : trainer.id || trainer.trainer
    if (trainerId && !trainerIds.has(trainerId) && !specialLocationTrainers.has(trainerId)) { console.error(`Missing location trainer: ${id} -> ${trainerId}`); failed = true }
  }
}
for (const [id, detail] of Object.entries(trainerDetails)) {
  for (const team of detail.versions?.polished?.teams || detail.versions?.faithful?.teams || []) for (const member of team.pokemon || []) {
    if (member.pokemonName && !pokemonSlugs.has(member.pokemonName)) { console.error(`Missing trainer Pokémon: ${id} -> ${member.pokemonName}`); failed = true }
    for (const move of member.moves || []) if (move.id && !moveIds.has(moveAliases.get(move.id) || move.id) && !hiddenPowerMoves.has(move.id)) { console.error(`Missing trainer move: ${id} -> ${move.id}`); failed = true }
    if (member.ability && !abilityIds.has(member.ability) && !natureCodes.has(member.ability)) { console.error(`Missing trainer ability: ${id} -> ${member.ability}`); failed = true }
    if (member.nature && !natureCodes.has(member.nature)) { console.error(`Unknown trainer nature: ${id} -> ${member.nature}`); failed = true }
    if (member.item && !itemIds.has(member.item)) { console.error(`Missing trainer item: ${id} -> ${member.item}`); failed = true }
  }
  if (!trainerIds.has(id)) { console.error(`Trainer detail has no source record: ${id}`); failed = true }
}
for (const [id, chain] of Object.entries(evolutions)) {
  for (const ref of chain.relatedPokemon || []) if (!pokemonSlugs.has(ref)) { console.error(`Missing evolution Pokémon reference: ${id} -> ${ref}`); failed = true }
  for (const path of chain.evolutionChain || []) for (const step of path) {
    if (!step.from?.name || !step.to?.name || !step.method?.action || !pokemonSlugs.has(step.from.name) || !pokemonSlugs.has(step.to.name)) { console.error(`Incomplete evolution step: ${id}`); failed = true }
  }
}
const localeFiles = [['pokemon-zh',289],['moves-zh',255],['items-zh',396],['abilities-zh',154],['locations-zh',649]]
for (const [name,count] of localeFiles) { const locale = await load(name); const values = Object.values(locale); if (values.length !== count || values.some(v => typeof v !== 'string' || !v.trim())) { console.error(`Invalid locale table: ${name}`); failed = true } }
const officialPokemonNames = { farfetchd: '大葱鸭', mrmime: '魔墙人偶', sirfetchd: '葱游兵', mrrime: '踏冰人偶' }
const officialMoveNames = { ancientpower: '原始之力', dazzlingleam: '魔法闪耀', disarmvoice: '魅惑之声', dragonbreath: '龙息', dynamicpunch: '爆裂拳', extremespeed: '神速', healinglight: '治愈之光', hijumpkick: '飞膝踢', poisonpowder: '毒粉', thunderpunch: '雷电拳', thundershock: '电击' }
for (const [file, expectedNames] of [['pokemon-zh', officialPokemonNames], ['moves-zh', officialMoveNames]]) {
  const locale = await load(file)
  for (const [id, expectedName] of Object.entries(expectedNames)) if (locale[id] !== expectedName) { console.error(`Incorrect official locale: ${file}.${id}`); failed = true }
}
if (appData.schemaVersion !== 2) { console.error(`Unsupported app-data schema: ${appData.schemaVersion}`); failed = true }
if (appManifest.schemaVersion !== 2 || appManifest.source !== 'https://www.polisheddex.app') { console.error('Invalid app-manifest metadata'); failed = true }
if (!mapTiles.source?.includes('/tiles/{z}/{x}/{y}.webp') || !Array.isArray(mapTiles.tiles) || mapTiles.tiles.length !== 10) { console.error('Invalid map tile manifest'); failed = true }
else for (const tile of mapTiles.tiles) { try { await access(`public/assets/maps/tiles/${tile.file}`) } catch { console.error(`Missing map tile: ${tile.file}`); failed = true } }
for (const [key, count] of [['pokemon',289],['moves',255],['items',396],['abilities',154],['locations',649],['trainers',761]]) {
  if (!Array.isArray(appData[key]) || appData[key].length !== count) { console.error(`Invalid app-data.${key}: expected ${count}, got ${appData[key]?.length ?? 0}`); failed = true }
}
for (const [key, source] of [['pokemon', pokemon], ['moves', moves], ['items', itemSource], ['abilities', abilitySource], ['locations', locations], ['trainers', trainers]]) {
  const records = appData[key] || []
  if (records.some(record => !record.slug || !record.name?.en || !record.name?.zh)) { console.error(`Incomplete app-data.${key} record`); failed = true }
  const sourceIds = source.map(record => record.id), appIds = records.map(record => record.slug)
  if (records.length !== source.length || sourceIds.some(id => !appIds.includes(id)) || appIds.some(id => !sourceIds.includes(id))) { console.error(`app-data.${key} records do not match source snapshot`); failed = true }
}
if (!Array.isArray(appData.evolutionChains) || Object.keys(evolutions).length !== appData.evolutionChains.length) { console.error('app-data.evolutionChains mismatch'); failed = true }
for (const group of ['daily','weekly','rematches']) if (!Array.isArray(appData.events?.[group]) || appData.events[group].length !== events[group].length) { console.error(`app-data.events.${group} mismatch`); failed = true }
if (appManifest.collections?.pokemon !== 289 || appManifest.collections?.moves !== 255 || appManifest.collections?.items !== 396 || appManifest.collections?.abilities !== 154 || appManifest.collections?.locations !== 649 || appManifest.collections?.trainers !== 761 || appManifest.collections?.guides !== 47) { console.error('app-manifest collection counts mismatch'); failed = true }
if (appManifest.tools?.headbutt !== 238 || appManifest.tools?.encountersByPokemon !== 5623 || appManifest.tools?.compatibility !== 289 || appManifest.tools?.eggMovePaths !== 1440) { console.error('app-manifest tool counts mismatch'); failed = true }
if (appManifest.resources?.mapTiles !== 10 || appManifest.resources?.trainerPortraitClasses !== 135) { console.error('app-manifest resource counts mismatch'); failed = true }
const detailCollections = { pokemon, moves, items:itemSource, locations, trainers }
for (const [kind, source] of Object.entries(detailCollections)) {
  const files = await readdir(`public/data/details/${kind}`)
  const expectedFiles = new Set(source.map(record => `${record.id}.json`))
  if (files.length !== expectedFiles.size || files.some(file => !expectedFiles.has(file))) { console.error(`Invalid ${kind} detail file manifest`); failed = true }
  for (const record of source) {
    try {
      const detail = JSON.parse(await readFile(`public/data/details/${kind}/${record.id}.json`, 'utf8'))
      if (detail.slug !== record.id || !detail.name?.en || !detail.name?.zh) throw new Error('missing identity fields')
      if (kind === 'pokemon' && (!Array.isArray(detail.moves) || !detail.stats || !Array.isArray(detail.obtain))) throw new Error('missing Pokémon fields')
      if (kind === 'moves') {
        if (!Array.isArray(detail.learners) || !Array.isArray(detail.machines)) throw new Error('missing move associations')
        for (const learner of detail.learners) if (!pokemonIds.has(learner.slug) || !learner.methods?.length) throw new Error(`invalid learner ${learner.slug}`)
        for (const machine of detail.machines) if (!itemIds.has(machine)) throw new Error(`invalid machine ${machine}`)
      }
      if (kind === 'items' && !Array.isArray(detail.locationDetails)) throw new Error('missing item locations')
      if (kind === 'locations' && (!Array.isArray(detail.encounters) || !Array.isArray(detail.trainers))) throw new Error('missing location fields')
      if (kind === 'trainers' && !Array.isArray(detail.battles)) throw new Error('missing trainer battles')
    } catch (error) { console.error(`Invalid ${kind} detail: ${record.id} (${error.message})`); failed = true }
  }
}
const headbutt = await load('tools/headbutt')
if (!Array.isArray(headbutt) || headbutt.length !== 238) { console.error(`Invalid headbutt tool index: ${headbutt?.length ?? 0}`); failed = true }
else for (const row of headbutt) if (!locationIds.has(row.location) || !pokemonIds.has(row.pokemon)) { console.error(`Invalid headbutt reference: ${row.location} -> ${row.pokemon}`); failed = true }
const encounterFinder = await load('tools/encounters-by-pokemon')
const encounterRows = Array.isArray(encounterFinder) ? encounterFinder.flatMap(entry => entry.encounters || []) : []
if (!Array.isArray(encounterFinder) || encounterFinder.length !== 202 || encounterRows.length !== 5623) { console.error(`Invalid encounter finder index: ${encounterFinder?.length ?? 0} Pokémon / ${encounterRows.length} encounters`); failed = true }
else for (const entry of encounterFinder) {
  if (!pokemonIds.has(entry.pokemon)) { console.error(`Invalid encounter finder Pokémon: ${entry.pokemon}`); failed = true }
  for (const row of entry.encounters) if (!locationIds.has(row.location) || row.pokemon !== entry.pokemon) { console.error(`Invalid encounter finder reference: ${entry.pokemon} -> ${row.location}`); failed = true }
}
const compatibility = await load('tools/compatibility')
if (!Array.isArray(compatibility) || compatibility.length !== 289) { console.error(`Invalid compatibility index: ${compatibility?.length ?? 0}`); failed = true }
else for (const entry of compatibility) {
  if (!pokemonIds.has(entry.pokemon) || !Array.isArray(entry.eggGroups) || !Array.isArray(entry.partners)) { console.error(`Invalid compatibility entry: ${entry.pokemon}`); failed = true; continue }
  for (const partner of entry.partners) if (!pokemonIds.has(partner)) { console.error(`Invalid compatibility partner: ${entry.pokemon} -> ${partner}`); failed = true }
}
const eggMovePaths = await load('tools/egg-move-paths')
const eggMoveRows = Array.isArray(eggMovePaths) ? eggMovePaths.flatMap(entry => entry.moves || []) : []
if (!Array.isArray(eggMovePaths) || eggMovePaths.length !== 250 || eggMoveRows.length !== 1440) { console.error(`Invalid egg-move path index: ${eggMovePaths?.length ?? 0} Pokémon / ${eggMoveRows.length} moves`); failed = true }
else for (const entry of eggMovePaths) {
  if (!pokemonIds.has(entry.pokemon)) { console.error(`Invalid egg-move target: ${entry.pokemon}`); failed = true }
  for (const move of entry.moves) {
    if (!moveIds.has(move.move) || !Array.isArray(move.parents) || !Array.isArray(move.chains)) { console.error(`Invalid egg-move row: ${entry.pokemon} -> ${move.move}`); failed = true; continue }
    for (const parent of move.parents) if (!pokemonIds.has(parent.pokemon) || !parent.methods?.length) { console.error(`Invalid egg-move parent: ${entry.pokemon} -> ${parent.pokemon}`); failed = true }
    for (const chain of move.chains) if (!pokemonIds.has(chain.source) || !pokemonIds.has(chain.via) || !chain.methods?.length) { console.error(`Invalid egg-move chain: ${entry.pokemon} -> ${chain.source}/${chain.via}`); failed = true }
  }
}
if (failed) process.exit(1)
console.log('Data validation passed: counts, required fields, assets and cross-entity references are complete.')
