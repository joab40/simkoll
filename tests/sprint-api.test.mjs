import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL='https://sprint-test.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_SWIMMER_CODE='sprint-fixture'
process.env.SIMKOLL_COACH_CODE='coach-fixture'
const {default:handler}=await import('../api/points.js')
const profile={id:'runner',display_name:'Test',emoji:'🏃'}
const row={score:89000,profile_id:'runner',game_key:'sprint100',created_at:'2026-10-10T12:00:00Z',profiles:profile}
const reply=data=>({ok:true,json:async()=>data})
async function call(body,query={},code='sprint-fixture',cookie='simkoll_session=test-session'){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,cookie},body,query},response)
  return response
}
function mockDb(existing=[]){
  const writes=[]
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).split('/rest/v1/')[1]
    if(options.method && options.method!=='GET'){writes.push({path,body:JSON.parse(options.body||'{}'),method:options.method});return reply([])}
    if(path.startsWith('profile_sessions?'))return reply([{profile_id:profile.id}])
    if(path.startsWith('profiles?'))return reply([profile])
    if(path.includes('select=id,score'))return reply(existing)
    if(path.includes('select=profile_id&limit'))return reply([{profile_id:profile.id}])
    if(path.startsWith('game_scores?'))return reply([row])
    return reply([])
  }
  return writes
}
test('sprint result is saved under its own game key and returned as a time',async()=>{
  const writes=mockDb()
  const response=await call({action:'submit-game-score',gameKey:'sprint100',score:89000})
  assert.equal(response.code,200)
  assert.equal(writes.find(item=>item.path==='game_scores').body.game_key,'sprint100')
  assert.equal(response.data.leaderboard[0].displayTime,'11,00 s')
  assert.equal(response.data.ownBest,89000)
})
test('slower second race does not replace the best weekly score',async()=>{
  const writes=mockDb([{id:'existing',score:90000}])
  const response=await call({action:'submit-game-score',gameKey:'sprint100',score:89000})
  assert.equal(response.code,200)
  assert.ok(writes.every(item=>!item.path.startsWith('game_scores')))
})
test('invalid sprint times and missing profile session cannot create scores',async()=>{
  const writes=mockDb()
  assert.equal((await call({action:'submit-game-score',gameKey:'sprint100',score:99999})).code,400)
  assert.equal((await call({action:'submit-game-score',gameKey:'sprint100',score:39000})).code,400)
  assert.equal((await call({action:'submit-game-score',gameKey:'sprint100',score:89000},{},'sprint-fixture','')).code,403)
  assert.equal(writes.length,0)
})
test('new sprint is in trainer catalog but not silently published in fallback schedule',async()=>{
  mockDb()
  const response=await call(null,{games:'true'},'coach-fixture')
  assert.equal(response.code,200)
  assert.ok(response.data.catalog.some(game=>game.key==='sprint100'))
  assert.ok(response.data.schedule.every(game=>game.gameKey!=='sprint100'))
})
