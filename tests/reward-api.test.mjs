import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://reward-api.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.COACH_SESSION_SECRET='reward-api-secret'
process.env.SIMKOLL_SWIMMER_CODE='reward-swimmer'
const {default:handler}=await import('../api/points.js')
const {createCoachToken}=await import('../server/coach-auth.js')
const id='11111111-1111-4111-8111-111111111111'
const levels=[{id:1,name:'Brons',emoji:'🥉',min_points:0},{id:8,name:'Svart diamant',emoji:'🪨',min_points:800},{id:9,name:'Lila diamant',emoji:'🔮',min_points:1000}]
const json=(data,status=200)=>new Response(JSON.stringify(data),{status})
const res=()=>({setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}})
test('real endpoint uses the same complete total for coach and swimmer and never sums the recent-reward list',async()=>{
  const totalRequests=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),table=url.pathname.split('/').at(-1)
    if(table==='coach_accounts')return json([{id}])
    if(table==='profile_sessions')return json([{profile_id:id}])
    if(table==='profiles')return json([{id}])
    if(table==='reward_levels')return json(levels)
    if(table==='reward_point_totals'){totalRequests.push(JSON.parse(options.body));return json({[id]:878})}
    assert.equal(table,'point_events');assert.equal(url.searchParams.get('profile_id'),`eq.${id}`)
    return json([{id:'event',points:3,event_type:'training_feedback',created_at:new Date().toISOString()}])
  }
  const coach=res();await handler({method:'GET',headers:{'x-simkoll-code':createCoachToken({id,role:'superadmin'})},query:{}},coach)
  const swimmer=res();await handler({method:'GET',headers:{'x-simkoll-code':'reward-swimmer',cookie:'simkoll_session=fixture'},query:{}},swimmer)
  assert.equal(coach.code,200);assert.equal(swimmer.code,200)
  assert.equal(coach.data.profiles[0].total,878);assert.equal(swimmer.data.total,878)
  assert.equal(coach.data.profiles[0].level.id,swimmer.data.current.id)
  assert.equal(swimmer.data.next.remaining,122);assert.equal(swimmer.data.recentRewards[0].points,3)
  assert.deepEqual(totalRequests,[{p_profile_ids:[id]},{p_profile_ids:[id]}])
})
test('missing totals migration never falls back to a clipped or zero score; invalid sessions never reach data',async()=>{
  let lookups=0
  globalThis.fetch=async(raw)=>{
    const table=new URL(raw).pathname.split('/').at(-1)
    if(table==='coach_accounts')return json([{id}])
    if(table==='profiles')return json([{id}])
    if(table==='reward_levels')return json(levels)
    assert.equal(table,'reward_point_totals');lookups++;return json({},404)
  }
  const unavailable=res();await handler({method:'GET',headers:{'x-simkoll-code':createCoachToken({id,role:'superadmin'})},query:{}},unavailable)
  assert.equal(unavailable.code,503);assert.match(unavailable.data.error,/SQL 124/);assert.equal(lookups,1)
  globalThis.fetch=async raw=>{assert(new URL(raw).pathname.endsWith('/coach_accounts'));return json([])}
  const expired=res();await handler({method:'GET',headers:{'x-simkoll-code':createCoachToken({id,role:'superadmin'})},query:{}},expired);assert.equal(expired.code,401)
})
test('library actions use the real session guard and ordinary coaches cannot read saved cards',async()=>{
  for(const [role,revoked] of [['superadmin',true],['coach',false],['head_coach',false]]){
    const calls=[]
    globalThis.fetch=async raw=>{const table=new URL(raw).pathname.split('/').at(-1);calls.push(table);if(table==='coach_accounts')return json(revoked?[]:[{id}]);if(table==='reward_levels')return json([{id:8,name:'Svart diamant',emoji:'🪨',background_art_id:null,emblem_art_id:null}]);if(table==='reward_level_art'||table==='reward_level_cards')return json([]);assert.fail(table)}
    const response=res();await handler({method:'GET',headers:{'x-simkoll-code':createCoachToken({id,role})},query:{artLibrary:'true',levelId:'8'}},response)
    assert.equal(response.code,revoked?401:role==='coach'?403:200)
    if(revoked||role==='coach')assert.deepEqual(calls,['coach_accounts'])
    else {assert.deepEqual(response.data.cards,[]);assert(calls.includes('reward_level_cards'))}
  }
})
