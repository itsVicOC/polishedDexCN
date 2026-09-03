import { mkdir, readFile, writeFile } from 'node:fs/promises'

const load = async name => JSON.parse(await readFile(`public/data/${name}.json`, 'utf8'))
const [rawPokemon, rawMoves, rawItems, rawAbilities, rawTrainers, rawLocations, rawLocationDetails, rawTrainerDetails, rawPokemonDetails, rawItemDetails, pokemonZh, movesZh, itemsZh, abilitiesZh, locationsZh, rawEvolutions, events, guides, contentZh] = await Promise.all([
  'pokemon-source', 'moves-source', 'items-source', 'abilities-source', 'trainers-source', 'locations-source',
  'location-details-source', 'trainer-details-source', 'pokemon-details', 'item-details-source',
  'pokemon-zh', 'moves-zh', 'items-zh', 'abilities-zh', 'locations-zh', 'evolutions', 'events', 'guides', 'content-zh',
].map(load))

const types = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy']
const L = (en, zh, aliases = []) => ({ en, zh, aliases })
const slugText = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const localized = (en, id, dictionary) => {
  const key = id.toLowerCase(), compact = key.replace(/-/g, '')
  return L(en, dictionary[key] || dictionary[compact] || dictionary[slugText(en)] || en, [en, id])
}
const rawLocalized = (en, id) => L(en, pokemonZh[id] || en, [en, id].filter(Boolean))
const rawType = value => value.charAt(0).toUpperCase() + value.slice(1)
const firstVersion = value => value?.versions?.polished || value?.versions?.faithful || {}
const growthLabel = {growthmediumslow:'Medium Slow · 中慢速',growthmediumfast:'Medium Fast · 中快速',growthfast:'Fast · 快速',growthslow:'Slow · 慢速',growtherratic:'Erratic · 不定',growthfluctuating:'Fluctuating · 波动'}
const hatchLabel = {fastest:'Fastest · 最快',faster:'Faster · 较快',fast:'Fast · 快',mediumfast:'Medium Fast · 中快',mediumslow:'Medium Slow · 中慢',slow:'Slow · 慢',slower:'Slower · 较慢',slowest:'Slowest · 最慢',unknown:'Unknown · 未知'}
const abilityRoles = ['第一特性 · Primary','第二特性 · Secondary','隐藏特性 · Hidden']
const moveDisplayNames = {ancientpower:'Ancient Power',dazzlingleam:'Dazzling Gleam',disarmvoice:'Disarming Voice',dragonbreath:'Dragon Breath',dynamicpunch:'Dynamic Punch',extremespeed:'Extreme Speed',hijumpkick:'High Jump Kick',poisonpowder:'Poison Powder',thunderpunch:'Thunder Punch',thundershock:'Thunder Shock',healinglight:'Healing Light'}
const moveAliases = { psychicm: 'psychic' }
const natureCodes = new Set(['atkupsatkdown','defupspedown','satkupatkdown','satkupsdefdown','sdefupatkdown','sdefupsatkdown','speupatkdown','speupdefdown','speupsatkdown','speupsdefdown'])
const hiddenPowerLabels = {hpfighting:'觉醒力量（格斗） · Hidden Power Fighting',hprock:'觉醒力量（岩石） · Hidden Power Rock',hpgrass:'觉醒力量（草） · Hidden Power Grass',hpice:'觉醒力量（冰） · Hidden Power Ice',hpfire:'觉醒力量（火） · Hidden Power Fire',hpground:'觉醒力量（地面） · Hidden Power Ground'}
const locationZhFallback = {newbarktown:'若叶镇',route29:'29号道路',route30:'30号道路',route31:'31号道路',cherrygrovecity:'吉花市',violetcity:'桔梗市',azaleatown:'桧皮镇',goldenrodcity:'满金市',ecruteakcity:'圆朱市',olivinecity:'浅葱市',cianwoodcity:'湛蓝市',mahoganytown:'卡吉镇',blackthorncity:'烟墨市',indigoplateau:'石英高原',lakeofrage:'愤怒之湖',nationalpark:'自然公园',celadoncity:'彩虹市',saffroncity:'金黄市',vermilioncity:'枯叶市',lavendertown:'紫苑镇'}

const pokemon = rawPokemon.map(record => {
  const detail = rawPokemonDetails[record.id], form = detail?.form || {}, stats = form.baseStats || {}
  const withLevel = move => move.level !== undefined && move.level !== '$undefined' ? `${move.name} · Lv.${move.level}` : move.name
  const female = Number(form.genderRatio)
  const hasGenderRatio = Number.isFinite(female) && form.genderRatio !== 'unknown'
  return {
    id:record.dexNo,slug:record.id,name:rawLocalized(record.name,record.id),types:(form.types||firstVersion(record).plain?.types||[]).map(rawType),genus:record.dexEntry?.category||'Pokémon',description:record.dexEntry?.description||'',descriptionZh:contentZh.pokemon?.[record.id]?.description||record.dexEntry?.description||'',
    abilities:(form.abilities||[]).map((ability,index)=>({name:localized(ability.name,ability.id,abilitiesZh),role:abilityRoles[index]||`特性 ${index+1} · Ability ${index+1}`,effect:ability.description||'',effectZh:contentZh.abilities?.[ability.id]?.effect||ability.description||''})),
    stats:{HP:stats.hp||0,Attack:stats.attack||0,Defense:stats.defense||0,SpAtk:stats.specialAttack||0,SpDef:stats.specialDefense||0,Speed:stats.speed||0},growth:growthLabel[form.growthRate]||form.growthRate||'—',gender:hasGenderRatio?`${100-female}% 雄性 Male · ${female}% 雌性 Female`:'无性别 · Genderless',
    eggGroups:(form.eggGroups||record.eggGroups||[]).map(group=>group.charAt(0).toUpperCase()+group.slice(1)),hatch:hatchLabel[form.hatchRate]||form.hatchRate||'—',hatchCycles:form.hatchCycles||form.hatchAmount,height:form.height,weight:form.weight,catchRate:form.catchRate||0,baseExp:form.baseExp||0,evYield:Object.entries(form.evYield||{}).map(([key,value])=>`${value} ${key}`).join(', ')||'—',heldItems:(form.heldItems||[]).filter(item=>item&&item!=='$undefined').map(item=>({id:item.id||slugText(item.name||''),name:localized(item.name||item.id||'',item.id||item.name||'',itemsZh),rarity:item.rarity||'unknown'})),
    weak:[],resist:[],evolution:[record.name],obtain:[],moves:(form.movesets?.levelUp||[]).map(withLevel),tmMoves:(form.movesets?.tm||[]).map(withLevel),eggMoves:(form.movesets?.eggMoves||[]).map(withLevel),tutorMoves:(form.movesets?.tutor||form.movesets?.moveTutor||[]).map(move=>move.name||move.id),sprite:record.id,
  }
}).sort((a,b)=>a.id-b.id)

const moves = rawMoves.map((record,index)=>{const version=firstVersion(record),displayName=moveDisplayNames[record.id]||version.name||record.id;return {id:index+1,slug:record.id,name:localized(displayName,record.id,movesZh),type:rawType(version.type||'normal'),category:(version.category||'status').replace(/^./,character=>character.toUpperCase()),power:version.power||0,accuracy:version.accuracy||100,pp:version.pp||0,effect:version.description||'',effectZh:contentZh.moves?.[record.id]?.effect||version.description||'',tm:version.tm}})
const itemAreaAliases = {mtmoonsquare:'mountmoonsquare',shamoutiislandpokecenter1f:'shamoutipokecenter1f'}
const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const locationIdFor = (area,name) => rawLocations.find(location=>location.id===(itemAreaAliases[area]||area)||compact(location.name)===compact(name))?.id
const items = rawItems.map((record,index)=>{const detail=rawItemDetails[record.id]||{},version=firstVersion(detail.id?detail:record),attributes=version.attributes||{};const locationDetails=(version.locations||[]).map(source=>({area:source.area||'',locationId:locationIdFor(source.area||'',source.name||source.area||''),name:source.name||source.area||'',method:source.method||'unknown',npcName:source.giftDetails?.npcName,prerequisites:source.giftDetails?.prerequisites}));return {id:index+1,slug:record.id,name:localized(version.name||record.id,record.id,itemsZh),category:rawType(attributes.category||version.category||'item'),buy:attributes.price??version.price??0,sell:attributes.sellPrice??Math.floor((attributes.price??version.price??0)/2),effect:version.description||'—',effectZh:contentZh.items?.[record.id]?.effect||version.description||'—',use:version.use||'—',useZh:contentZh.items?.[record.id]?.use||version.use||'—',locations:locationDetails.map(source=>`${source.name}${source.method?` · ${source.method}`:''}`.trim()).filter(Boolean),moveName:attributes.moveName,locationDetails,pickup:version.pickup?.levelRanges||[]}})
const abilities = rawAbilities.map((record,index)=>{const version=firstVersion(record);return {id:index+1,slug:record.id,name:localized(record.name||record.id,record.id,abilitiesZh),effect:version.description||'',effectZh:contentZh.abilities?.[record.id]?.effect||version.description||''}})

const locations = rawLocations.map((record,index)=>{const detail=rawLocationDetails[record.id]||{};const encounters=(detail.encounters||[]).map(encounter=>({...encounter,encounterTier:encounter.encounter_tier,pokemonId:encounter.pokemon,pokemon:rawPokemon.find(entry=>entry.id===encounter.pokemon)?.name||encounter.pokemon}));const itemDetails=(detail.items||[]).map(entry=>({id:entry.item||entry.id||slugText(entry.name||''),name:entry.name||entry.item||'',type:entry.type||'item',chance:entry.chance,npcName:entry.giftDetails?.npcName}));const description=detail.description||`${record.name||record.id} in Pokémon Polished Crystal.`;return {id:index+1,slug:record.id,name:localized(record.name||record.id,record.id,{...locationsZh,...locationZhFallback}),region:detail.region||record.region||'Johto',kind:(detail.type||['area'])[0],description,descriptionZh:contentZh.locations?.[record.id]?.description||description,pokemon:[...new Set(encounters.map(entry=>String(entry.pokemon)))],items:itemDetails.map(entry=>entry.name),itemDetails,trainers:(detail.trainers||[]).map(entry=>typeof entry==='string'?entry:entry.id||entry.name||entry.trainer||String(entry)),children:detail.children||[],connections:detail.connections||[],encounters}})
const trainerPortraitAliases={rocketscientist:'scientist',rival0:'rival1'}
const trainers = rawTrainers.map((record,index)=>{const detail=rawTrainerDetails[record.id]||{},teams=detail.versions?.polished?.teams||detail.versions?.faithful?.teams||[];const battles=teams.flatMap(team=>(team.pokemon||[]).map(member=>({...member,matchCount:team.matchCount}))).map(member=>{const found=pokemon.find(entry=>entry.slug===String(member.pokemonName||'').toLowerCase()),misplacedNature=natureCodes.has(member.ability||'')?member.ability:undefined;return {matchCount:member.matchCount,level:member.level||0,levelDisplay:member.levelDisplay,pokemon:found?`${found.name.zh} · ${found.name.en}`:member.pokemonName,formName:member.formName,ability:misplacedNature?undefined:member.ability,nature:member.nature||misplacedNature,item:member.item,dvs:member.dvs,evs:member.evs,moves:(member.moves||[]).map(value=>{const move=moves.find(entry=>entry.slug===(moveAliases[value.id]||value.id));return move?`${move.name.zh} · ${move.name.en}`:hiddenPowerLabels[value.id]||value.id})}});const location=Object.values(rawLocationDetails).find(entry=>(entry.trainers||[]).some(trainer=>(typeof trainer==='string'?trainer:trainer.id||trainer.trainer)===record.id));const portraitBase=String(record.class||detail.class||'trainer').toLowerCase().replace(/_/g,'');const portrait=trainerPortraitAliases[portraitBase]||portraitBase;return {id:index+1,slug:record.id,name:L(record.name||detail.name||record.id,record.name||detail.name||record.id,[record.id]),className:(record.class||detail.class||'Trainer').replaceAll('_',' '),portrait,location:location?.name||detail.locationName||detail.location||record.location||'Unknown',locationId:location?.id,battles}})

const evolutionChains=Object.values(rawEvolutions)
const typeWeak={Normal:['Fighting'],Fire:['Water','Ground','Rock'],Water:['Electric','Grass'],Electric:['Ground'],Grass:['Fire','Ice','Poison','Flying','Bug'],Ice:['Fire','Fighting','Rock','Steel'],Fighting:['Flying','Psychic','Fairy'],Poison:['Ground','Psychic'],Ground:['Water','Grass','Ice'],Flying:['Electric','Ice','Rock'],Psychic:['Bug','Ghost','Dark'],Bug:['Fire','Flying','Rock'],Rock:['Water','Grass','Fighting','Ground','Steel'],Ghost:['Ghost','Dark'],Dragon:['Ice','Dragon','Fairy'],Dark:['Fighting','Bug','Fairy'],Steel:['Fire','Fighting','Ground'],Fairy:['Poison','Steel']}
const typeResist={Normal:['Ghost'],Fire:['Fire','Grass','Ice','Bug','Steel','Fairy'],Water:['Fire','Water','Ice','Steel'],Electric:['Electric','Flying','Steel'],Grass:['Water','Electric','Grass','Ground'],Ice:['Ice'],Fighting:['Bug','Rock','Dark'],Poison:['Grass','Fighting','Poison','Bug','Fairy'],Ground:['Poison','Rock'],Flying:['Grass','Fighting','Bug'],Psychic:['Fighting','Psychic'],Bug:['Grass','Fighting','Ground'],Rock:['Normal','Fire','Poison','Flying'],Ghost:['Poison','Bug'],Dragon:['Fire','Water','Electric','Grass'],Dark:['Ghost','Dark'],Steel:['Normal','Grass','Ice','Flying','Psychic','Bug','Rock','Dragon','Steel','Fairy'],Fairy:['Fighting','Bug','Dark']}
const typeImmune={Normal:['Ghost'],Ground:['Electric'],Flying:['Ground'],Ghost:['Normal','Fighting'],Dark:['Psychic'],Steel:['Poison'],Fairy:['Dragon']}
for(const entry of pokemon){const matchups=types.map(attack=>({attack,multiplier:entry.types.reduce((value,defense)=>{if((typeImmune[defense]||[]).includes(attack))return 0;if((typeWeak[defense]||[]).includes(attack))return value*2;if((typeResist[defense]||[]).includes(attack))return value*.5;return value},1)}));entry.weak=matchups.filter(value=>value.multiplier>1).map(value=>`${value.attack} ×${value.multiplier}`);entry.resist=matchups.filter(value=>value.multiplier<1).map(value=>value.multiplier===0?`${value.attack} ×0 (immune)`:`${value.attack} ×${value.multiplier}`);const chain=evolutionChains.find(value=>value.relatedPokemon.includes(entry.slug));entry.evolution=(chain?.relatedPokemon||[entry.slug]).map(id=>pokemon.find(value=>value.slug===id)?.name.en||id);const hits=locations.filter(location=>location.encounters.some(encounter=>String(encounter.pokemonId||encounter.pokemon).toLowerCase()===entry.slug));entry.obtain=hits.length?[...new Set(hits.flatMap(location=>location.encounters.filter(encounter=>String(encounter.pokemonId||encounter.pokemon).toLowerCase()===entry.slug).map(encounter=>`${location.name.zh} · ${location.name.en} · ${encounter.method||'encounter'} · Lv. ${encounter.levelRange||'—'} · ${encounter.rate??'—'}%`)))]:['Evolution / Gift · 进化或赠礼']}

const detailRoot='public/data/details'
for(const kind of ['pokemon','moves','items','locations','trainers'])await mkdir(`${detailRoot}/${kind}`,{recursive:true})
const moveDetails=Object.fromEntries(moves.map(move=>[move.slug,{
  ...move,
  learners:pokemon.map(entry=>({slug:entry.slug,methods:[entry.moves.some(value=>slugText(value.split(' · ')[0])===move.slug)?'升级 · Level up':null,entry.eggMoves.some(value=>slugText(value.split(' · ')[0])===move.slug)?'蛋技能 · Egg':null,entry.tmMoves.some(value=>slugText(value.split(' · ')[0])===move.slug)?'TM/HM':null,entry.tutorMoves.some(value=>slugText(value.split(' · ')[0])===move.slug)?'教学 · Tutor':null].filter(Boolean)})).filter(entry=>entry.methods.length),
  machines:items.filter(item=>item.moveName===move.slug).map(item=>item.slug),
}]))
await Promise.all([
  ...pokemon.map(entry=>writeFile(`${detailRoot}/pokemon/${entry.slug}.json`,JSON.stringify(entry))),
  ...Object.values(moveDetails).map(entry=>writeFile(`${detailRoot}/moves/${entry.slug}.json`,JSON.stringify(entry))),
  ...items.map(entry=>writeFile(`${detailRoot}/items/${entry.slug}.json`,JSON.stringify(entry))),
  ...locations.map(entry=>writeFile(`${detailRoot}/locations/${entry.slug}.json`,JSON.stringify(entry))),
  ...trainers.map(entry=>writeFile(`${detailRoot}/trainers/${entry.slug}.json`,JSON.stringify(entry))),
])
await mkdir('public/data/tools',{recursive:true})
const headbutt=locations.flatMap(location=>location.encounters.filter(encounter=>encounter.method==='headbutt').map((encounter,index)=>({location:location.slug,index,pokemon:encounter.pokemonId||slugText(encounter.pokemon),levelRange:encounter.levelRange,rate:encounter.rate,encounterTier:encounter.encounterTier,asleep:encounter.asleep})))
const encountersByPokemon=pokemon.map(entry=>({pokemon:entry.slug,encounters:locations.flatMap(location=>location.encounters.map((encounter,index)=>({location:location.slug,index,pokemon:encounter.pokemonId||slugText(encounter.pokemon),method:encounter.method,levelRange:encounter.levelRange,rate:encounter.rate,time:encounter.version,formName:encounter.formName,isSwarm:encounter.isSwarm,encounterTier:encounter.encounterTier,asleep:encounter.asleep})).filter(encounter=>encounter.pokemon===entry.slug))})).filter(entry=>entry.encounters.length)
const compatibility=pokemon.map(entry=>{
  const groups=entry.eggGroups.map(group=>group.toLowerCase())
  const isDitto=groups.includes('ditto')
  const partners=pokemon.filter(candidate=>{
    if(candidate.slug===entry.slug&&isDitto)return false
    const candidateGroups=candidate.eggGroups.map(group=>group.toLowerCase())
    if(!groups.length||!candidateGroups.length)return false
    if(isDitto)return !candidateGroups.includes('ditto')
    if(candidateGroups.includes('ditto'))return true
    return candidateGroups.some(group=>groups.includes(group))
  }).map(candidate=>candidate.slug)
  return {pokemon:entry.slug,eggGroups:entry.eggGroups,partners}
})
const learnMethodsFor=(entry,moveId)=>{
  const form=rawPokemonDetails[entry.slug]?.form||{},sets=form.movesets||{}
  return [
    ['levelUp','升级 · Level up'],['tm','TM/HM'],['tutor','教学 · Tutor'],['moveTutor','教学 · Tutor'],['eggMoves','蛋技能 · Egg'],
  ].filter(([key])=>(sets[key]||[]).some(move=>(moveAliases[move.id]||move.id)===moveId)).map(([,label])=>label)
}
const canPassAsFather=entry=>{
  const ratio=rawPokemonDetails[entry.slug]?.form?.genderRatio
  return ratio!==100&&ratio!=='unknown'&&ratio!==undefined
}
const eggMovePaths=pokemon.map(target=>{
  const targetDetail=rawPokemonDetails[target.slug]?.form||{},targetGroups=target.eggGroups.map(group=>group.toLowerCase())
  const moveIds=(targetDetail.movesets?.eggMoves||[]).map(move=>moveAliases[move.id]||move.id)
  const moveRows=moveIds.map(moveId=>{
    const direct=pokemon.filter(parent=>parent.slug!==target.slug&&canPassAsFather(parent)&&parent.eggGroups.some(group=>targetGroups.includes(group.toLowerCase()))).map(parent=>({pokemon:parent.slug,methods:learnMethodsFor(parent,moveId)})).filter(parent=>parent.methods.length)
    const directNonEgg=new Set(direct.filter(parent=>parent.methods.some(method=>!method.includes('Egg'))).map(parent=>parent.pokemon))
    const chains=[]
    for(const bridge of direct.filter(parent=>parent.methods.some(method=>method.includes('Egg')))){
      const bridgePokemon=pokemon.find(entry=>entry.slug===bridge.pokemon)
      if(!bridgePokemon)continue
      const bridgeGroups=bridgePokemon.eggGroups.map(group=>group.toLowerCase())
      for(const source of pokemon.filter(entry=>entry.slug!==target.slug&&entry.slug!==bridge.pokemon&&canPassAsFather(entry)&&entry.eggGroups.some(group=>bridgeGroups.includes(group.toLowerCase())))){
        const methods=learnMethodsFor(source,moveId).filter(method=>!method.includes('Egg'))
        if(methods.length&&!directNonEgg.has(source.slug))chains.push({source:source.slug,via:bridge.pokemon,methods})
      }
    }
    const uniqueChains=[...new Map(chains.map(chain=>[`${chain.source}/${chain.via}`,chain])).values()]
    return {move:moveId,parents:direct,chains:uniqueChains}
  })
  return {pokemon:target.slug,moves:moveRows}
}).filter(entry=>entry.moves.length)
await Promise.all([
  writeFile('public/data/tools/headbutt.json',JSON.stringify(headbutt)),
  writeFile('public/data/tools/encounters-by-pokemon.json',JSON.stringify(encountersByPokemon)),
  writeFile('public/data/tools/compatibility.json',JSON.stringify(compatibility)),
  writeFile('public/data/tools/egg-move-paths.json',JSON.stringify(eggMovePaths)),
])

const corePokemon=pokemon.map(entry=>({id:entry.id,slug:entry.slug,name:entry.name,types:entry.types,abilities:entry.abilities,stats:entry.stats,catchRate:entry.catchRate,eggGroups:entry.eggGroups,sprite:entry.sprite,heldItems:entry.heldItems,genus:'',description:'',growth:'',gender:'',hatch:'',baseExp:0,evYield:'',weak:[],resist:[],evolution:[],obtain:[],moves:[],eggMoves:[],tmMoves:[],tutorMoves:[]}))
const coreItems=items.map(entry=>({...entry,locationDetails:[],pickup:[]}))
const coreLocations=locations.map(entry=>({...entry,description:'',pokemon:[],items:[],itemDetails:[],trainers:[],children:[],connections:[],encounters:[]}))
const coreTrainers=trainers.map(entry=>({...entry,battles:[]}))
const appData={schemaVersion:2,generatedAt:new Date().toISOString(),pokemon:corePokemon,moves,items:coreItems,abilities,locations:coreLocations,trainers:coreTrainers,evolutionChains,events}
await writeFile('public/data/app-data.json',JSON.stringify(appData))
await writeFile('public/data/app-manifest.json',JSON.stringify({schemaVersion:2,source:'https://www.polisheddex.app',generatedAt:appData.generatedAt,collections:{pokemon:pokemon.length,moves:moves.length,items:items.length,abilities:abilities.length,locations:locations.length,trainers:trainers.length,evolutionChains:evolutionChains.length,guides:guides.length},tools:{headbutt:headbutt.length,encountersByPokemon:encountersByPokemon.reduce((sum,entry)=>sum+entry.encounters.length,0),compatibility:compatibility.length,eggMovePaths:eggMovePaths.reduce((sum,entry)=>sum+entry.moves.length,0)},resources:{mapTiles:10,trainerPortraitClasses:135},details:{pokemon:pokemon.length,moves:moves.length,items:items.length,locations:locations.length,trainers:trainers.length}},null,2))
console.log(`Built route data: ${pokemon.length} Pokémon, ${moves.length} moves, ${items.length} items, ${abilities.length} abilities, ${locations.length} locations, ${trainers.length} trainers, ${headbutt.length} headbutt encounters, ${encountersByPokemon.reduce((sum,entry)=>sum+entry.encounters.length,0)} searchable encounters, ${eggMovePaths.reduce((sum,entry)=>sum+entry.moves.length,0)} egg-move paths.`)
