export type Localized = { en:string; zh:string; aliases?:string[] }
export type Pokemon = {
  id:number; slug:string; name:Localized; types:string[]; genus:string; description:string;
  descriptionZh?:string;
  abilities:{name:Localized;role:string;effect:string;effectZh?:string}[]; stats:Record<string,number>;
  growth:string; gender:string; eggGroups:string[]; hatch:string; hatchCycles?:number; height?:number; weight?:number; catchRate:number; baseExp:number;
  evYield:string; weak:string[]; resist:string[]; evolution?:string[]; obtain:string[]; moves:string[]; eggMoves?:string[]; tmMoves?:string[]; tutorMoves?:string[]; sprite:string;
  heldItems?:{id:string;name:Localized;rarity:string}[];
}
export type Move = { id:number; slug:string; name:Localized; type:string; category:string; power:number; accuracy:number; pp:number; effect:string; effectZh?:string; tm?:string }
export type ItemLocation = { area:string; locationId?:string; name:string; method:string; npcName?:string; prerequisites?:Record<string,unknown> }
export type Item = { id:number; slug:string; name:Localized; category:string; buy:number; sell:number; effect:string; effectZh?:string; use:string; useZh?:string; locations:string[]; moveName?:string; locationDetails?:ItemLocation[]; pickup?:{min:number;max:number;probability:number}[] }
export type Ability = { id:number; slug:string; name:Localized; effect:string; effectZh?:string }
export type LocationItem = { id:string; name:string; type:string; chance?:number; npcName?:string }
export type Location = { id:number; slug:string; name:Localized; region:string; kind:string; description:string; descriptionZh?:string; pokemon:string[]; items:string[]; itemDetails?:LocationItem[]; trainers:string[]; children?:{id:string;name:string}[]; connections?:{direction:string;to:string;toId:string}[]; encounters?:{pokemon:string;pokemonId?:string;method:string;levelRange?:string;rate?:number;formName?:string;version?:string;isSwarm?:boolean;encounterTier?:string;asleep?:string[]}[] }
export type Trainer = { id:number; slug:string; name:Localized; className:string; portrait?:string; location:string; locationId?:string; battles:{matchCount?:number;level:number;levelDisplay?:string;pokemon:string;formName?:string;ability?:string;nature?:string;item?:string;dvs?:string;evs?:string;moves:string[]}[] }
export type EvolutionStep = { from:{name:string;formName:string}; to:{name:string;formName:string}; method:{action:string;parameter?:string|number} }
export type EvolutionChain = { id:string; relatedPokemon:string[]; evolutionChain:EvolutionStep[][] }
export type EventData = { daily:any[]; weekly:any[]; rematches:any[] }

type AppData = { schemaVersion:number; pokemon:Pokemon[]; moves:Move[]; items:Item[]; abilities:Ability[]; locations:Location[]; trainers:Trainer[]; evolutionChains:EvolutionChain[]; events:EventData }
export type DetailKind='pokemon'|'moves'|'items'|'locations'|'trainers'

export const pokemon:Pokemon[]=[]
export const moves:Move[]=[]
export const items:Item[]=[]
export const abilities:Ability[]=[]
export const locations:Location[]=[]
export const trainers:Trainer[]=[]
export const evolutionChains:EvolutionChain[]=[]
export const events:EventData={daily:[],weekly:[],rematches:[]}
export const types=['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy']
export const nav=[['pokemon','宝可梦','Pokémon'],['moves','技能','Moves'],['items','物品','Items'],['abilities','特性','Abilities'],['locations','地点','Locations'],['evolutions','进化','Evolutions'],['egg-groups','蛋组','Egg Groups'],['stats','能力值','Stats'],['types','属性','Types'],['trainers','训练家','Trainers'],['map','地图','Map'],['events','事件','Events'],['guides','攻略','Guides']]

// Vite exposes the project-site prefix on GitHub Pages (for example
// /polishedDexCN/). Keep all runtime requests under that prefix so the app
// also works when deployed below a repository path.
export const APP_BASE=import.meta.env.BASE_URL
export const assetUrl=(path:string)=>`${APP_BASE}${path.replace(/^\/+/,'')}`

let loading:Promise<void>|undefined
export function loadDexData(){
  if(loading)return loading
  loading=fetch(assetUrl('data/app-data.json')).then(async response=>{
    if(!response.ok)throw new Error(`Failed to load app data: ${response.status}`)
    const data=await response.json() as AppData
    if(data.schemaVersion!==2||data.pokemon.length!==289||data.moves.length!==255||data.items.length!==396||data.abilities.length!==154||data.locations.length!==649||data.trainers.length!==761)throw new Error('The local Polished Crystal snapshot is incomplete or incompatible.')
    pokemon.push(...data.pokemon);moves.push(...data.moves);items.push(...data.items);abilities.push(...data.abilities);locations.push(...data.locations);trainers.push(...data.trainers);evolutionChains.push(...data.evolutionChains)
    events.daily.push(...data.events.daily);events.weekly.push(...data.events.weekly);events.rematches.push(...data.events.rematches)
  })
  return loading
}

const detailCache=new Map<string,unknown>()
export async function loadEntityDetail<T>(kind:DetailKind,slug:string):Promise<T>{
  const key=`${kind}/${slug}`
  if(detailCache.has(key))return detailCache.get(key) as T
  const response=await fetch(assetUrl(`data/details/${key}.json`))
  if(!response.ok)throw new Error(`Failed to load ${key}: ${response.status}`)
  const detail=await response.json() as T
  detailCache.set(key,detail)
  return detail
}
export async function loadToolData<T>(name:string):Promise<T>{
  const key=`tools/${name}`
  if(detailCache.has(key))return detailCache.get(key) as T
  const response=await fetch(assetUrl(`data/${key}.json`))
  if(!response.ok)throw new Error(`Failed to load ${key}: ${response.status}`)
  const data=await response.json() as T
  detailCache.set(key,data)
  return data
}
