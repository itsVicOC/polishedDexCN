import { readFile, writeFile } from 'node:fs/promises'

// PokeAPI publishes the official Simplified Chinese names in a CSV. Keep only
// the species ids present in our PolishedDex snapshot so the frontend remains
// deterministic and offline.
const csv = await readFile('/tmp/pokemon_species_names.csv', 'utf8')
const rows = csv.split(/\r?\n/).slice(1)
const english = {}, zh = {}
for (const row of rows) {
  const m = row.match(/^(\d+),(\d+),([^,]*)/)
  if (!m) continue
  const value = m[3].replace(/^"|"$/g, '').replaceAll('""', '"')
  if (m[2] === '9') english[m[1]] = value
  if (m[2] === '12') zh[m[1]] = value
}
const source = JSON.parse(await readFile('public/data/pokemon-source.json', 'utf8'))
const byEnglish = Object.fromEntries(Object.entries(english).map(([id,name]) => [name.toLowerCase(), zh[id]]).filter(([,name]) => name))
const pokemonOverrides = { farfetchd: '大葱鸭', mrmime: '魔墙人偶', sirfetchd: '葱游兵', mrrime: '踏冰人偶' }
const out = Object.fromEntries(source.map(p => [p.id, pokemonOverrides[p.id] || byEnglish[p.name.toLowerCase()] || p.name]))
await writeFile('public/data/pokemon-zh.json', JSON.stringify(out, null, 2))

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
const parseNames = async (file) => {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).slice(1)
  const byId = {}, result = {}
  for (const line of lines) {
    const m = line.match(/^(\d+),(\d+),(.*)$/); if (!m) continue
    const value = m[3].replace(/^"|"$/g, '').replaceAll('""', '"')
    if (m[2] === '9') byId[m[1]] = value
    if (m[2] === '12') result[m[1]] = value
  }
  return Object.fromEntries(Object.entries(result).flatMap(([id, value]) => byId[id] ? [[slug(byId[id]), value]] : []))
}
for (const [kind, file, sourceFile] of [['moves', '/tmp/move_names.csv', 'public/data/moves-source.json'], ['items', '/tmp/item_names.csv', 'public/data/items-source.json'], ['abilities', '/tmp/ability_names.csv', 'public/data/abilities-source.json']]) {
  const names = await parseNames(file)
  const records = JSON.parse(await readFile(sourceFile, 'utf8'))
  const moveOverrides = { ancientpower: '原始之力', dazzlingleam: '魔法闪耀', disarmvoice: '魅惑之声', dragonbreath: '龙息', dynamicpunch: '爆裂拳', extremespeed: '神速', healinglight: '治愈之光', hijumpkick: '飞膝踢', poisonpowder: '毒粉', thunderpunch: '雷电拳', thundershock: '电击' }
  const mapped = Object.fromEntries(records.map(x => { const v = x.versions?.polished || x.versions?.faithful || {}; const en = v.name || x.name || x.id; return [x.id, kind === 'moves' && moveOverrides[x.id] ? moveOverrides[x.id] : names[slug(en)] || en] }))
  await writeFile(`public/data/${kind}-zh.json`, JSON.stringify(mapped, null, 2))
  console.log(`Generated ${Object.keys(mapped).length} ${kind} Chinese names`)
}

// Location names use the same language table but have a fourth parent-id
// column. Match on the English display name used by PolishedDex.
const locLines = (await readFile('/tmp/location_names.csv', 'utf8')).split(/\r?\n/).slice(1)
const locEn = {}, locZh = {}
for (const line of locLines) {
  const m = line.match(/^(\d+),(\d+),([^,]*)/); if (!m) continue
  const value = m[3].replace(/^"|"$/g, '').replaceAll('""', '"')
  if (m[2] === '9') locEn[m[1]] = value
  if (m[2] === '12') locZh[m[1]] = value
}
const locByEn = Object.fromEntries(Object.entries(locEn).map(([id, name]) => [slug(name), locZh[id]]).filter(([, name]) => name))
const locSource = JSON.parse(await readFile('public/data/locations-source.json', 'utf8'))
const locationOverrides = {
  newbarktown:'若叶镇',cherrygrovecity:'吉花市',violetcity:'桔梗市',azaleatown:'桧皮镇',goldenrodcity:'满金市',ecruteakcity:'圆朱市',olivinecity:'浅葱市',cianwoodcity:'湛蓝市',mahoganytown:'卡吉镇',blackthorncity:'烟墨市',indigoplateau:'石英高原',pallettown:'真新镇',viridiancity:'常青市',pewtercity:'深灰市',ceruleancity:'华蓝市',vermilioncity:'枯叶市',lavendertown:'紫苑镇',celadoncity:'彩虹市',fuchsiacity:'浅红市',saffroncity:'金黄市',cinnabarisland:'红莲岛',viridianforest:'常青森林',mtmoon:'月见山',diglettscave:'地鼠洞',rocktunnel:'岩山隧道',seafoamislands:'双子岛',pokemontower:'宝可梦塔',safarizone:'狩猎地带',powerplant:'发电厂',victoryroad:'冠军之路',mtsilver:'白银山',tintower:'铃铛塔',burnedtower:'烧焦塔',whirlislands:'漩涡岛',slowpokewell:'呆呆兽之井',ilexforest:'桐树林',nationalpark:'自然公园',lakeofrage:'愤怒之湖',sprouttower:'桔梗塔',unioncave:'连接洞窟',mtmortar:'烧焦山',icepath:'冰之通路',dragonsden:'龙之穴',route27:'27号道路',route28:'28号道路',route29:'29号道路',route30:'30号道路',route31:'31号道路',route32:'32号道路',route33:'33号道路',route34:'34号道路',route35:'35号道路',route36:'36号道路',route37:'37号道路',route38:'38号道路',route39:'39号道路',route40:'40号水道',route41:'41号水道',route42:'42号道路',route43:'43号道路',route44:'44号道路',route45:'45号道路',route46:'46号道路',route47:'47号道路',route48:'48号道路'
}
const translateLocation = (record) => {
  const key = slug(record.id)
  if (locationOverrides[key]) return locationOverrides[key]
  if (locByEn[key]) return locByEn[key]
  let value = record.name
  value = value.replace(/Pok[eé]Center/gi, '宝可梦中心').replace(/Pok[eé]mon/gi, '宝可梦').replace(/Mart/gi, '商店').replace(/Gym/gi, '道馆').replace(/House/gi, '的家').replace(/Lab/gi, '研究所').replace(/Tower/gi, '塔').replace(/Cave/gi, '洞窟').replace(/Forest/gi, '森林').replace(/Lake/gi, '湖').replace(/Park/gi, '公园').replace(/Gate/gi, '关卡').replace(/Ruins/gi, '遗迹').replace(/Island/gi, '岛').replace(/Beach/gi, '海滩').replace(/Path/gi, '通路').replace(/Tunnel/gi, '隧道').replace(/Battle Frontier/gi, '对战开拓区').replace(/(\d+)F\b/g, '$1层').replace(/Route (\d+)/gi, '$1号道路')
  return value
}
const locOut = Object.fromEntries(locSource.map(x => [x.id, translateLocation(x)]))
await writeFile('public/data/locations-zh.json', JSON.stringify(locOut, null, 2))
console.log(`Generated ${Object.keys(locOut).length} location Chinese names`)
