import { readFile, writeFile } from 'node:fs/promises'

const source = JSON.parse(await readFile('public/data/pokemon-details-source.json', 'utf8'))

const compactMove = move => ({
  id: move.id,
  name: move.name,
  level: move.level,
})

const compactForm = form => ({
  types: form.types || [],
  abilities: (form.abilities || []).map(({ id, name, description }) => ({ id, name, description })),
  baseStats: form.baseStats || {},
  height: form.height,
  weight: form.weight,
  growthRate: form.growthRate,
  genderRatio: form.genderRatio,
  hatchRate: form.hatchRate,
  hatchCycles: form.hatchCycles,
  catchRate: form.catchRate,
  baseExp: form.baseExp,
  evYield: form.evYield || {},
  eggGroups: form.eggGroups || [],
  heldItems: Array.isArray(form.heldItems) ? form.heldItems.map(({ id, name, rarity }) => ({ id, name, rarity })) : [],
  movesets: Object.fromEntries(Object.entries(form.movesets || {}).map(([kind, moves]) => [kind, Array.isArray(moves) ? moves.map(compactMove) : []])),
})

const compact = Object.fromEntries(Object.entries(source).map(([slug, detail]) => {
  const forms = detail?.versions?.polished?.forms || detail?.versions?.faithful?.forms || {}
  const form = forms.plain || Object.values(forms).find(value => value?.baseStats && value?.types) || {}
  return [slug, { id: detail.id, name: detail.name, dexNo: detail.dexNo, form: compactForm(form) }]
}))

await writeFile('public/data/pokemon-details.json', JSON.stringify(compact))
console.log(`Compacted ${Object.keys(compact).length} Pokémon detail records.`)
