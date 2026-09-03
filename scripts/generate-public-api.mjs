import { readFile, writeFile } from 'node:fs/promises'

const aliases = {
  pokemon: 'pokemon-source',
  moves: 'moves-source',
  items: 'items-source',
  abilities: 'abilities-source',
  locations: 'locations-source',
  trainers: 'trainers-source',
}
for (const [name, source] of Object.entries(aliases)) {
  await writeFile(`public/data/${name}.json`, await readFile(`public/data/${source}.json`))
}
await writeFile('public/data/api-index.json', JSON.stringify({
  description: 'Offline Polished Crystal bilingual reference API',
  // Relative paths keep the generated API working on GitHub Pages project
  // sites (for example /polishedDexCN/) as well as a domain root.
  collections: Object.keys(aliases).map(name => ({ name, path: `data/${name}.json` })),
  details: [
    { name: 'pokemon', path: 'data/pokemon-details.json' },
    { name: 'evolutions', path: 'data/evolutions.json' },
    { name: 'events', path: 'data/events.json' },
    { name: 'guides', path: 'data/guides.json' },
  ],
}, null, 2))
console.log(`Generated ${Object.keys(aliases).length} public collection aliases.`)
