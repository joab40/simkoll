import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://reward-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'reward-art-fixture-secret'
process.env.OPENAI_API_KEY = 'fixture-only'
const { handleRewardArt, generateRewardArt, levelArtwork, artworkUrl } = await import('../server/reward-art.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const id='11111111-1111-4111-8111-111111111111', assetId='22222222-2222-4222-8222-222222222222'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const res=()=>({setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}})
const req=(action='generate-level-art',body={},role='superadmin')=>({method:'POST',headers:{'x-simkoll-code':createCoachToken({id,role})},body:{action,levelId:8,kind:'emblem',style:'cosmic',confirmed:true,...body}})
const fixture = () => {
  const calls=[]
  return {calls,read:async(path,options={})=>{
    calls.push({path,options})
    if(path.startsWith('reward_levels?') && !options.method) return json([{id:8,emoji:'🪨'}])
    if(path==='rpc/reserve_reward_art') return json({id:assetId,emoji:'🪨'})
    if(path.startsWith('reward_level_art?') && !options.method) return json([{level_id:8,kind:'emblem',source_emoji:'🪨',storage_path:`8/${assetId}.webp`}])
    return json([])
  },storage:async(path,options)=>{calls.push({path,options});return json({public:true})},availability:async()=>({allowed:true}),audit:async()=>{},generate:async(_request,options)=>{calls.push({generated:options});return{bytes:Buffer.from('fixture'),mime:'image/webp',extension:'webp'}}}
}
test('only superadmin may generate; head coach may still publish existing art; malformed and unconfirmed requests never call AI',async()=>{
  for(const role of ['coach','swimmer']){const response=res();await handleRewardArt(req(undefined,{},role),response,fixture());assert.equal(response.code,403)}
  const head=fixture(),denied=res();await handleRewardArt(req('generate-level-art',{},'head_coach'),denied,head)
  assert.equal(denied.code,403);assert.equal(head.calls.length,0)
  const publishing=fixture(),published=res();await handleRewardArt(req('publish-level-art',{assetId},'head_coach'),published,publishing);assert.equal(published.code,200)
  for(const body of [{confirmed:false},{kind:'svg'},{style:'constructor'},{levelId:'8);delete'},{assetId:'https://untrusted.invalid'}]){
    const deps=fixture(), response=res();await handleRewardArt(req(body.assetId?'publish-level-art':undefined,body),response,deps)
    assert.equal(response.code,400); assert(!deps.calls.some(row=>row.generated))
  }
})
test('reservation permission failures fail closed and quota messages describe 50 attempts without calling AI',async()=>{
  for(const code of ['42501','P0001']){
    const deps=fixture(),base=deps.read;deps.read=(path,options)=>path==='rpc/reserve_reward_art'?json({code},400):base(path,options)
    const response=res();await handleRewardArt(req(),response,deps)
    assert.equal(response.code,code==='42501'?403:409);assert(!deps.calls.some(row=>row.generated))
    assert.match(response.data.error,code==='42501'?/superadmin/:/50 bildförsök/)
  }
})
test('generation reserves quota before one AI call, stores draft and never auto-publishes',async()=>{
  const deps=fixture(),response=res();await handleRewardArt(req(),response,deps)
  assert.equal(response.code,200); assert.equal(response.data.asset.id,assetId)
  assert(deps.calls.findIndex(row=>row.path==='rpc/reserve_reward_art')<deps.calls.findIndex(row=>row.generated))
  assert(!deps.calls.some(row=>row.path?.startsWith('reward_levels?') && row.options.method==='PATCH'))
  assert.deepEqual(deps.calls.find(row=>row.generated).generated,{emoji:'🪨',kind:'emblem',style:'cosmic',preserveEmojiColours:true})
})
test('disabled AI, private/missing bucket and reservation conflict block billable generation',async()=>{
  for(const type of ['disabled','bucket','quota']){
    const deps=fixture(),response=res()
    if(type==='disabled')deps.availability=async()=>({allowed:false})
    if(type==='bucket')deps.storage=async()=>json({public:false})
    if(type==='quota'){const original=deps.read;deps.read=(path,options)=>path==='rpc/reserve_reward_art'?json({},409):original(path,options)}
    await handleRewardArt(req(),response,deps)
    assert(response.code>=400);assert(!deps.calls.some(row=>row.generated))
  }
})
test('publish validates level/kind/current emoji; reset never deletes files or points',async()=>{
  const deps=fixture(),response=res();await handleRewardArt(req('publish-level-art',{assetId}),response,deps)
  assert.equal(response.code,200)
  assert.deepEqual(JSON.parse(deps.calls.find(row=>row.options?.method==='PATCH').options.body),{emblem_art_id:assetId})
  const reset=fixture(),answer=res();await handleRewardArt(req('publish-level-art',{assetId:null}),answer,reset);assert.equal(answer.code,200)
  assert(!reset.calls.some(row=>row.options?.method==='DELETE'||row.path==='rpc/reserve_reward_art'))
  const stale=fixture(),original=stale.read;stale.read=(path,options)=>path.startsWith('reward_level_art?')?json([{source_emoji:'🥉',storage_path:`8/${assetId}.webp`}]):original(path,options)
  const conflict=res();await handleRewardArt(req('publish-level-art',{assetId}),conflict,stale);assert.equal(conflict.code,409)
})
test('image failures mark reservation failed, without activating a partial image',async()=>{
  const deps=fixture();deps.generate=async()=>{throw new Error('Fixture provider failure')}
  const response=res();await handleRewardArt(req(),response,deps);assert.equal(response.code,503)
  assert(deps.calls.some(row=>row.options?.body===JSON.stringify({status:'failed'})))
})
test('only stored, current emoji art paths resolve; never arbitrary URLs or stale/cross-level drafts',async()=>{
  assert.equal(artworkUrl('https://evil.invalid/x'),null);assert.equal(artworkUrl('../secret'),null)
  const level={id:8,emoji:'🪨',emblem_art_id:assetId}
  for(const row of [{id:assetId,level_id:8,kind:'emblem',source_emoji:'🥉'},{id:assetId,level_id:7,kind:'emblem',source_emoji:'🪨'}]){
    assert.deepEqual((await levelArtwork([level],async()=>json([row]))).get(8),{})
  }
  const ready=await levelArtwork([level],async()=>json([{id:assetId,level_id:8,kind:'emblem',source_emoji:'🪨',storage_path:`8/${assetId}.webp`}]))
  assert.match(ready.get(8).emblemUrl,/\/object\/public\/reward-level-art\/8\//)
})
test('public cards reuse backgrounds across levels and emoji changes, but never foreign emblems or wrong storage directories',async()=>{
  const levels=[{id:8,emoji:'🪨',background_art_id:assetId},{id:9,emoji:'🔮',background_art_id:assetId,emblem_art_id:assetId}]
  for(const level_id of [8,null]){
    const result=await levelArtwork(levels,async()=>json([{id:assetId,level_id,kind:'background',source_emoji:'🥉',storage_path:`8/${assetId}.webp`}]))
    assert.equal(result.get(8).backgroundUrl,result.get(9).backgroundUrl);assert(result.get(9).backgroundUrl);assert(!result.get(9).emblemUrl)
  }
  const bad=await levelArtwork(levels,async()=>json([{id:assetId,level_id:8,kind:'background',storage_path:`9/${assetId}.webp`}]))
  assert.deepEqual(bad.get(9),{})
})
test('legacy single-slot publication supports a shared background without allowing a foreign emblem or invoking AI',async()=>{
  for(const kind of ['background','emblem']){
    const deps=fixture(),base=deps.read;deps.read=(path,options)=>path.startsWith('reward_level_art?')?json([{level_id:9,kind,source_emoji:'🔮',storage_path:`9/${assetId}.webp`}]):base(path,options)
    const answer=res();await handleRewardArt(req('publish-level-art',{kind,assetId}),answer,deps)
    assert.equal(answer.code,kind==='background'?200:409);assert(!deps.calls.some(row=>row.generated))
  }
})
test('image provider receives only emoji and fixed style, transparent WebP for emblem; usage logged',async()=>{
  const calls=[],logs=[]
  const image=Buffer.from('RIFF0000WEBPfixture').toString('base64')
  const result=await generateRewardArt(req(),{emoji:'🪨',kind:'emblem',style:'cosmic'}, {fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return json({data:[{b64_json:image}],usage:{input_tokens:10,output_tokens:20}})},log:async(_request,entry)=>logs.push(entry)})
  assert.equal(result.mime,'image/webp');assert.equal(calls.length,1)
  assert.equal(calls[0].body.background,'transparent');assert.equal(calls[0].body.output_format,'webp');assert.equal(calls[0].body.n,1)
  assert(!calls[0].body.prompt.includes(id));assert.equal(logs[0].feature,'reward_level_art');assert.equal(logs[0].response.usage.output_tokens,20)
})
