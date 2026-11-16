import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://reward-library-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'reward-library-fixture-secret'
const { handleRewardCardLibrary } = await import('../server/reward-card-library.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { usableRewardSelection, sameRewardSelection, savedRewardCombination, rewardSelectionArtwork } = await import('../shared/reward-card-library.js')
const actor='11111111-1111-4111-8111-111111111111', bg='22222222-2222-4222-8222-222222222222', emblem='33333333-3333-4333-8333-333333333333', card='44444444-4444-4444-8444-444444444444'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const res=()=>({setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}})
const request=(body={},role='superadmin',method='GET')=>({method,headers:{'x-simkoll-code':createCoachToken({id:actor,role,session_version:2})},query:{artLibrary:'true',levelId:'8'},body:{action:'save-level-card',levelId:8,sourceEmoji:'🪨',backgroundId:bg,emblemId:emblem,name:'Kosmisk sten',cardId:card,...body}})
function fixture(){
  const calls=[]
  const assets=[{id:bg,level_id:8,kind:'background',style:'cosmic',source_emoji:'🪨',storage_path:`8/${bg}.webp`,created_at:'2026-11-16T12:00:00Z'}, {id:emblem,level_id:8,kind:'emblem',style:'aurora',source_emoji:'🪨',storage_path:`8/${emblem}.webp`,created_at:'2026-11-16T12:00:00Z'}]
  return {calls,assets,read:async(path,options={})=>{calls.push({path,options});if(path.startsWith('reward_levels?'))return json([{id:8,emoji:'🪨',name:'Svart diamant',background_art_id:bg,emblem_art_id:emblem}]);if(path.startsWith('reward_level_art?'))return json(assets);if(path.startsWith('reward_level_cards?'))return json([{id:card,name:'Favorit',source_emoji:'🪨',background_art_id:bg,emblem_art_id:emblem,created_at:'2026-11-16T12:00:00Z'}]);assert.equal(path,'rpc/configure_reward_level_card');return json({saved:true,cardId:card})}}
}
test('library denies wrong roles/methods/level IDs before reading or writing anything',async()=>{
  for(const role of ['coach','swimmer']){const deps=fixture(),response=res();await handleRewardCardLibrary(request({},role),response,deps);assert.equal(response.code,403);assert.equal(deps.calls.length,0)}
  for(const levelId of ['8);delete',{},['8'],null]){const deps=fixture(),response=res(),req=request();req.query.levelId=levelId;await handleRewardCardLibrary(req,response,deps);assert.equal(response.code,400);assert.equal(deps.calls.length,0)}
  const response=res();await handleRewardCardLibrary(request({},'superadmin','DELETE'),response,fixture());assert.equal(response.code,405)
})
test('library recovers old ready images and both active slots, plus named cards, with no AI call',async()=>{
  const deps=fixture(),response=res();await handleRewardCardLibrary(request(),response,deps)
  assert.equal(response.code,200);assert.deepEqual(response.data.active,{backgroundId:bg,emblemId:emblem})
  assert.equal(response.data.assets.length,2);assert(response.data.assets.every(row=>row.compatible));assert.equal(response.data.cards[0].compatible,true)
  assert(deps.calls.every(row=>!row.options.method));assert(deps.calls.some(row=>row.path.includes('status=eq.ready')))
  assert(deps.calls.every(row=>!row.path.includes('reserve_reward_art')))
})
test('backgrounds survive emoji changes while invalid paths still disable cards',async()=>{
  const deps=fixture();deps.assets[0].source_emoji='🥉';deps.assets[1].storage_path='https://invalid.example/x'
  const response=res();await handleRewardCardLibrary(request(),response,deps)
  assert.equal(response.code,200);assert.equal(response.data.assets[0].compatible,true);assert.equal(response.data.assets[1].compatible,false);assert.equal(response.data.cards[0].compatible,false)
})
test('shared backgrounds from other levels and deleted levels are usable; foreign/stale emblems are not',async()=>{
  const deps=fixture();deps.assets[0].level_id=9;deps.assets[0].source_emoji='🔮';deps.assets[0].storage_path=`9/${bg}.webp`
  const answer=res();await handleRewardCardLibrary(request(),answer,deps)
  assert.equal(answer.code,200);assert.equal(answer.data.assets[0].compatible,true);assert.equal(answer.data.cards[0].compatible,true)
  assert(deps.calls.some(row=>row.path.includes('or=(kind.eq.background,level_id.eq.8)')))
  deps.assets[0].level_id=null;deps.assets[1].level_id=9;deps.assets[1].storage_path=`9/${emblem}.webp`
  const orphan=res();await handleRewardCardLibrary(request(),orphan,deps)
  assert.equal(orphan.data.assets[0].compatible,true);assert.equal(orphan.data.assets[1].compatible,false)
  deps.assets[0].level_id=9;deps.assets[0].storage_path=`8/${bg}.webp`
  const mismatch=res();await handleRewardCardLibrary(request(),mismatch,deps);assert.equal(mismatch.data.assets[0].compatible,false)
})
test('save and activation use one validated SQL transaction; saving does not publish, activation has both IDs and a concurrency token',async()=>{
  for(const action of ['save-level-card','publish-level-card']){
    const deps=fixture(),response=res();await handleRewardCardLibrary(request({action,confirmed:true,expectedBackgroundId:bg,expectedEmblemId:emblem},'superadmin','POST'),response,deps)
    assert.equal(response.code,200)
    const writes=deps.calls.filter(row=>row.options.method)
    assert.equal(writes.length,1);assert.equal(writes[0].path,'rpc/configure_reward_level_card')
    const body=JSON.parse(writes[0].options.body)
    assert.equal(body.p_actor_id,actor);assert.equal(body.p_background_id,bg);assert.equal(body.p_emblem_id,emblem)
    assert.equal(body.p_action,action==='save-level-card'?'save':'activate')
    assert.equal(body.p_card_id,action==='save-level-card'?card:null)
    assert.equal(body.p_expected_background_id,action==='save-level-card'?null:bg)
    assert.equal(body.p_name,action==='save-level-card'?'Kosmisk sten':null)
    assert(!deps.calls.some(row=>row.path.startsWith('point_events')||row.path.includes('reserve_reward_art')))
  }
})
test('reject bad references, wrong emoji, missing/null name and absent activation confirmation before mutation',async()=>{
  for(const body of [{backgroundId:'https://evil.invalid'},{emblemId:undefined},{sourceEmoji:'🥉'},{name:''},{name:' '.repeat(2)},{name:'x'.repeat(61)},{cardId:'not-uuid'},{action:'publish-level-card',confirmed:false},{action:'publish-level-card',confirmed:true,expectedBackgroundId:undefined}]){
    const deps=fixture(),response=res();await handleRewardCardLibrary(request(body,'head_coach','POST'),response,deps)
    assert.equal(response.code,400);assert(!deps.calls.some(row=>row.options.method))
  }
})
test('stale activation and session failures are explicit; unavailable/truncated library never looks empty/successful',async()=>{
  for(const [code,status] of [['40001',409],['22023',409],['42501',403],['PGRST202',503]]){
    const deps=fixture(),read=deps.read;deps.read=(path,options)=>path.startsWith('rpc/')?json({code},400):read(path,options)
    const response=res();await handleRewardCardLibrary(request({},'superadmin','POST'),response,deps);assert.equal(response.code,status)
  }
  const deps=fixture(),read=deps.read;deps.read=(path,options)=>path.startsWith('reward_level_cards?')?json({},404):read(path,options)
  const response=res();await handleRewardCardLibrary(request(),response,deps);assert.equal(response.code,503);assert(!response.data.cards)
  const paging=fixture(),base=paging.read;let pages=0
  paging.read=(path,options)=>{if(path.startsWith('reward_level_art?')){pages++;const offset=Number(new URL(`https://fixture.invalid/${path}`).searchParams.get('offset'));return json(Array.from({length:offset===0?500:1},(_,i)=>({...paging.assets[0],id:`fixture-${offset+i}`})))}return base(path,options)}
  const all=res();await handleRewardCardLibrary(request(),all,paging);assert.equal(all.code,200);assert.equal(all.data.assets.length,501);assert.equal(pages,2)
})
test('selection helpers mix backgrounds/emblems independently, allow originals and refuse stale references',()=>{
  const assets=[{id:bg,kind:'background',url:'background',compatible:true},{id:emblem,kind:'emblem',url:'emblem',compatible:true},{id:card,kind:'emblem',url:'stale',compatible:false}]
  assert.deepEqual(rewardSelectionArtwork(assets,{backgroundId:bg,emblemId:emblem}),{backgroundUrl:'background',emblemUrl:'emblem'})
  assert.deepEqual(rewardSelectionArtwork(assets,{backgroundId:bg,emblemId:null}),{backgroundUrl:'background',emblemUrl:null})
  assert.deepEqual(usableRewardSelection(assets,{backgroundId:emblem,emblemId:card}),{backgroundId:null,emblemId:null})
  assert(sameRewardSelection({backgroundId:bg,emblemId:null},{backgroundId:bg,emblemId:null}))
  assert(!sameRewardSelection({backgroundId:bg,emblemId:null},{backgroundId:bg,emblemId:emblem}))
  assert(savedRewardCombination([{name:'Min favorit',backgroundId:bg,emblemId:emblem,compatible:true}],' Min favorit ',{backgroundId:bg,emblemId:emblem}))
  assert(!savedRewardCombination([{name:'Min favorit',backgroundId:bg,emblemId:emblem,compatible:true}],'Min favorit',{backgroundId:null,emblemId:emblem}))
})
