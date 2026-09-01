import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
const base='https://www.polisheddex.app'
const get=async u=>{const r=await fetch(u);if(!r.ok)throw new Error(`${r.status} ${u}`);return Buffer.from(await r.arrayBuffer())}
const download=async (items,dir,extension='png')=>{await mkdir(resolve(dir),{recursive:true}); for(let i=0;i<items.length;i+=16){await Promise.all(items.slice(i,i+16).map(async ([id,url])=>{const target=resolve(dir,id+'.'+extension);try{await access(target);return}catch{}try{await writeFile(target,await get(url))}catch(e){console.warn('skip',id,e.message)}}));console.log(`${dir}: ${Math.min(i+16,items.length)}/${items.length}`)}}
const pokemon=JSON.parse(await readFile('public/data/pokemon-source.json','utf8')).flatMap(x=>[
  [`${x.id}`,`${base}/sprites/pokemon/${x.id}/normal_front.png`],
  [`${x.id}-back`,`${base}/sprites/pokemon/${x.id}/normal_back.png`],
  [`${x.id}-shiny`,`${base}/sprites/pokemon/${x.id}/shiny_front.png`],
  [`${x.id}-shiny-back`,`${base}/sprites/pokemon/${x.id}/shiny_back.png`]
])
const items=JSON.parse(await readFile('public/data/items-source.json','utf8')).map(x=>[x.id,`${base}/sprites/items/${x.id}.png`])
await download(pokemon,'public/assets/sprites'); await download(items,'public/assets/items')
const trainerPortraitAliases={rocketscientist:'scientist',rival0:'rival1'}
const trainerClasses=[...new Set(JSON.parse(await readFile('public/data/trainers-source.json','utf8')).map(x=>String(x.class||'trainer').toLowerCase().replace(/_/g,'')))]
  .map(id=>[id,trainerPortraitAliases[id]||id])
  .filter((value,index,array)=>array.findIndex(entry=>entry[1]===value[1])===index)
await download(trainerClasses.map(([id,portrait])=>[portrait,`${base}/sprites/trainers/${id}/${id}.png`]),'public/assets/trainers')
const animated=JSON.parse(await readFile('public/data/pokemon-source.json','utf8')).flatMap(x=>[
  [`${x.id}-animated`,`${base}/sprites/pokemon/${x.id}/normal_front_animated.gif`],
  [`${x.id}-shiny-animated`,`${base}/sprites/pokemon/${x.id}/shiny_front_animated.gif`]
])
await download(animated,'public/assets/sprites','gif')

// Keep the bounded tile set exposed by the PolishedDex map endpoint.
// The current world uses one x-column at z1 and two x-columns at z2.
const mapDir='public/assets/maps/tiles'; await mkdir(resolve(mapDir),{recursive:true}); const mapTiles=[]
const mapRequests=[...Array.from({length:2},(_,y)=>({z:1,x:0,y})),...Array.from({length:4},(_,y)=>({z:2,x:0,y})),...Array.from({length:4},(_,y)=>({z:2,x:1,y}))]
for(const {z,x,y} of mapRequests){
  const file=`${z}-${x}-${y}.webp`, path=resolve(mapDir,file)
  try{await access(path);mapTiles.push({z,x,y,file});continue}catch{}try{await writeFile(path,await get(`${base}/tiles/${z}/${x}/${y}.webp`)); mapTiles.push({z,x,y,file})}catch(e){console.warn('skip map tile',z,x,y,e.message)}
}
if(mapTiles.length!==10) throw new Error(`Map tile snapshot incomplete: ${mapTiles.length}/10 tiles`)
await writeFile('public/data/map-tiles.json',JSON.stringify({source:`${base}/tiles/{z}/{x}/{y}.webp`,tiles:mapTiles},null,2))
console.log(`Downloaded ${mapTiles.length} local map tiles.`)
