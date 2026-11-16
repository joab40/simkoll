import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {rewardEmojiColours} from '../shared/reward-emoji-colours.js'
process.env.SUPABASE_URL='https://emoji-colour-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.COACH_SESSION_SECRET='emoji-colour-fixture-secret'
process.env.OPENAI_API_KEY='fixture-only'
const {generateRewardArt,handleRewardArt,ART_STYLES,EMBLEM_MATERIAL_STYLES}=await import('../server/reward-art.js')
const {createCoachToken}=await import('../server/coach-auth.js')
const json=(value,status=200)=>new Response(JSON.stringify(value),{status})
const image=Buffer.from('RIFF0000WEBPfixture').toString('base64')
async function generated(options){
  const calls=[],logs=[]
  await generateRewardArt({},options,{fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return json({data:[{b64_json:image}],usage:{input_tokens:10,output_tokens:20}})},log:async(_request,row)=>logs.push(row)})
  assert.equal(calls.length,1);assert.equal(logs.length,1);assert.equal(logs[0].status,'success')
  return calls[0].body
}
test('red diamond hints ignore variation selectors; recognised palettes preserve main and secondary colours',()=>{
  for(const emoji of ['♦','♦️',' ♦︎ ']){assert.equal(rewardEmojiColours(emoji).label,'Röd');assert.match(rewardEmojiColours(emoji).instruction,/ruby\/crimson red/)}
  for(const [emoji,label] of [['💎','Blå'],['🔮','Lila'],['🥈','Silver'],['🥉','Brons'],['🏅','Guld'],['🔶','Orange'],['🖤','Svart / grå'],['🐦‍🔥','Eldens originalfärger']])assert.equal(rewardEmojiColours(emoji).label,label)
  assert.match(rewardEmojiColours('🔮').instruction,/original gold base/)
  assert.match(rewardEmojiColours('🥈').instruction,/medal ribbon colours/)
  for(const input of [undefined,null,{},'🦄','red; url(https://invalid.example)']){
    const result=rewardEmojiColours(input);assert.equal(result.label,'Emojins egna färger');assert.deepEqual(result.colours,[])
    assert(!result.instruction.includes('invalid.example'))
  }
})
test('all nine styles preserve a red diamond by default without sending competing palette or composition instructions',async()=>{
  assert.deepEqual(Object.keys(EMBLEM_MATERIAL_STYLES),Object.keys(ART_STYLES))
  for(const style of Object.keys(ART_STYLES)){
    const body=await generated({emoji:'♦️',kind:'emblem',style})
    assert.match(body.prompt,/COLOUR CONSTRAINT \(higher priority than style\)/)
    assert.match(body.prompt,/ruby\/crimson red/);assert.match(body.prompt,/not merely a small accent/)
    assert(body.prompt.includes(EMBLEM_MATERIAL_STYLES[style]));assert(!body.prompt.includes(ART_STYLES[style]))
    assert.doesNotMatch(body.prompt,/\b(teal|violet|turquoise|sapphire|cyan|magenta|champagne|copper|petrol|mint|peach)\b/i)
    assert.equal(body.background,'transparent');assert.equal(body.size,'1024x1024');assert.equal(body.n,1)
    assert.match(body.prompt,/no scenery, pedestal, border or text/)
  }
})
test('colour lock can be disabled explicitly and never changes background prompts or image output settings',async()=>{
  const unlocked=await generated({emoji:'♦️',kind:'emblem',style:'champion',preserveEmojiColours:false})
  assert(unlocked.prompt.includes(ART_STYLES.champion));assert.match(unlocked.prompt,/sculpted brushed gold/);assert(!unlocked.prompt.includes('COLOUR CONSTRAINT'))
  const a=await generated({emoji:'♦️',kind:'background',style:'neon',preserveEmojiColours:true})
  const b=await generated({emoji:'♦️',kind:'background',style:'neon',preserveEmojiColours:false})
  assert.deepEqual(a,b);assert.equal(a.background,'opaque');assert.match(a.prompt,/cyan and magenta/)
})
test('server validates colour flag before billing, uses only reserved emoji and forwards explicit or default selection',async()=>{
  const actor='11111111-1111-4111-8111-111111111111',asset='22222222-2222-4222-8222-222222222222'
  for(const value of [undefined,true,false,null,'true',0,{},[]]){
    const calls=[],response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
    await handleRewardArt({method:'POST',headers:{'x-simkoll-code':createCoachToken({id:actor,role:'superadmin'})},body:{action:'generate-level-art',levelId:6,kind:'emblem',style:'neon',confirmed:true,preserveEmojiColours:value,emoji:'🔮',colour:'blue',name:'Private name must not be sent'}},response,{
      read:async(path,options={})=>{calls.push({path,options});return json(path.startsWith('reward_levels?')?[{id:6,emoji:'♦️'}]:{id:asset,emoji:'♦️'})},
      storage:async()=>json({public:true}),availability:async()=>({allowed:true}),generate:async(_request,options)=>{calls.push({generated:options});return{bytes:Buffer.from('fixture'),mime:'image/webp',extension:'webp'}},
    })
    const valid=value===undefined||typeof value==='boolean'
    assert.equal(response.code,valid?200:400)
    if(valid){assert.deepEqual(calls.find(row=>row.generated).generated,{emoji:'♦️',kind:'emblem',style:'neon',preserveEmojiColours:value??true})}
    else assert(!calls.some(row=>row.generated||row.path==='rpc/reserve_reward_art'))
  }
})
test('UI defaults the colour lock on, sends it only for emblems and changing it resets active cost confirmation',async()=>{
  const source=await readFile(new URL('../src/reward-art-studio.jsx',import.meta.url),'utf8')
  assert.match(source,/\[preserveEmojiColours, setPreserveEmojiColours\] = useState\(true\)/)
  assert.match(source,/kind === 'emblem' \? \{preserveEmojiColours\} : \{\}/)
  assert.match(source,/setPreserveEmojiColours\(event.target.checked\); setConfirmed\(false\)/)
  assert.match(source,/Behåll emojins originalfärger/)
  assert.match(source,/keepColours \? REWARD_ART_STYLES\[style\].emblemDescription/)
})
