import { readFile, writeFile, readdir } from 'node:fs/promises'
import { translateHtmlProtected, translateProtected, lastTranslationSucceeded } from './deeplx.mjs'

const terms = [['Polished Crystal','抛光水晶'],['Pokémon','宝可梦'],['Pokédex','图鉴'],['Introduction','简介'],['Overview','概览'],['Walkthrough','流程攻略'],['Guide','指南'],['Guides','攻略'],['Route','道路'],['City','市'],['Town','镇'],['Cave','洞窟'],['Forest','森林'],['Tower','塔'],['Lake','湖'],['Gym','道馆'],['Badge','徽章'],['Trainer','训练家'],['Battle','战斗'],['Battles','战斗'],['Wild Pokémon','野生宝可梦'],['Encounter','遭遇'],['Encounters','遭遇'],['Items','物品'],['Item','物品'],['Moves','技能'],['Move','技能'],['Ability','特性'],['Abilities','特性'],['Evolution','进化'],['Evolutions','进化'],['Breeding','繁殖'],['Egg','蛋'],['Eggs','蛋'],['Team','队伍'],['Stats','能力值'],['Type','属性'],['Types','属性'],['Damage','伤害'],['Catch','捕获'],['Shiny','闪光'],['Location','地点'],['Locations','地点'],['Reward','奖励'],['Rewards','奖励'],['Tips','提示'],['Tip','提示'],['How to','如何'],['available','可用'],['required','需要'],['Level','等级'],['level','等级'],['Time','时间'],['Morning','早晨'],['Day','白天'],['Night','夜晚']]
const glossary = value => terms.reduce((text, [en, zh]) => text.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi'), zh), String(value || ''))
const sourceNames = []
for (const file of ['pokemon-source', 'moves-source', 'items-source', 'abilities-source', 'locations-source']) {
  try {
    const rows = JSON.parse(await readFile(`public/data/${file}.json`, 'utf8'))
    for (const row of rows) { sourceNames.push(row.name); for (const value of Object.values(row.versions || {})) if (value?.name) sourceNames.push(value.name) }
  } catch { /* optional during a partial sync */ }
}
const protectedTerms = ['Pokémon', 'Pokédex', 'Polished Crystal', ...sourceNames]
const translateText = value => translateProtected(value, protectedTerms, glossary)
const translateHtml = value => translateHtmlProtected(value, protectedTerms, glossary)

const files = (await readdir('public/data/guides')).filter(file => file.endsWith('.json'))
for (const file of files) {
  const path = `public/data/guides/${file}`
  const guide = JSON.parse(await readFile(path, 'utf8'))
  // Re-run DeepLX when requested so an earlier offline-glossary snapshot can
  // be upgraded without deleting the source article. This is useful after a
  // rate limit or when rotating the local endpoint.
  const refresh = process.env.DEEPLX_REFRESH === '1'
  if (refresh || !guide.titleZh) { const value = await translateText(guide.title, glossary); if (!refresh || lastTranslationSucceeded || !guide.titleZh) guide.titleZh = value }
  if (refresh || !guide.descriptionZh) { const value = await translateText(guide.description, glossary); if (!refresh || lastTranslationSucceeded || !guide.descriptionZh) guide.descriptionZh = value }
  if (refresh || !guide.htmlZh) { const value = await translateHtml(guide.html, glossary); if (!refresh || lastTranslationSucceeded || !guide.htmlZh) guide.htmlZh = value }
  await writeFile(path, JSON.stringify(guide))
}
const index = JSON.parse(await readFile('public/data/guides.json', 'utf8'))
for (const guide of index) {
  const refresh = process.env.DEEPLX_REFRESH === '1'
  if (refresh || !guide.titleZh) { const value = await translateText(guide.title, glossary); if (!refresh || lastTranslationSucceeded || !guide.titleZh) guide.titleZh = value }
  if (refresh || !guide.descriptionZh) { const value = await translateText(guide.description, glossary); if (!refresh || lastTranslationSucceeded || !guide.descriptionZh) guide.descriptionZh = value }
}
await writeFile('public/data/guides.json', JSON.stringify(index, null, 2))
console.log(`Localized ${files.length} guide articles.`)
