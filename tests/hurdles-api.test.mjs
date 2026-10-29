import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://hurdles-test.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_SWIMMER_CODE='runner-fixture'
process.env.SIMKOLL_COACH_CODE='coach-fixture'
const { default: handler }=await import('../api/points.js')
const row={score:86500,profile_id:'runner',game_key:'hurdles100',created_at:'2026-10-29T12:00:00Z',profiles:{display_name:'Löpare'}}
async function call(body,query={},code='runner-fixture'){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'},body,query},response)
  return response
}
function db(existing=[]){
  const writes=[],reads=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw);assert.equal(url.hostname,'hurdles-test.invalid')
    const path=String(raw).split('/rest/v1/')[1];let data=[]
    if(options.method)writes.push({path,body:JSON.parse(options.body||'{}')})
    else { reads.push(path)
      if(path.startsWith('profile_sessions?'))data=[{profile_id:'runner'}]
      else if(path.startsWith('profiles?'))data=[{id:'runner'}]
      else if(path.includes('select=id,score'))data=existing
      else if(path.includes('select=profile_id&limit'))data=[{profile_id:'runner'}]
      else if(path.startsWith('game_scores?'))data=[row]
    }
    return {ok:true,json:async()=>data}
  }
  return {writes,reads}
}
test('hurdle results save under their own key and return all-time times',async()=>{
  const state=db(),response=await call({action:'submit-game-score',gameKey:'hurdles100',score:86500})
  assert.equal(response.code,200)
  assert.equal(state.writes.find(write=>write.path==='game_scores').body.game_key,'hurdles100')
  assert.equal(response.data.leaderboard[0].displayTime,'13,50 s')
  assert(state.reads.some(path=>path.includes('game_key=eq.hurdles100')&&path.includes('order=score.desc')&&!path.includes('created_at=gte')))
})
test('slower times cannot replace a personal best; impossible scores never write',async()=>{
  let state=db([{id:'old',score:88000}])
  assert.equal((await call({action:'submit-game-score',gameKey:'hurdles100',score:86500})).code,200)
  assert(state.writes.every(write=>!write.path.startsWith('game_scores')))
  state=db()
  for(const score of [0,90001,39999,80000.5])assert.equal((await call({action:'submit-game-score',gameKey:'hurdles100',score})).code,400)
  assert.equal(state.writes.length,0)
})
test('coaches can select the new game without it being automatically published; all-time standings include it',async()=>{
  let state=db(),response=await call(null,{games:'true'},'coach-fixture')
  assert.equal(response.code,200)
  assert(response.data.catalog.some(game=>game.key==='hurdles100'))
  assert(response.data.schedule.every(item=>item.gameKey!=='hurdles100'))
  state=db();response=await call(null,{game:'alltime'})
  assert.equal(response.code,200)
  assert(state.reads.some(path=>path.includes('game_key=in.')&&path.includes('hurdles100')))
  assert.equal(response.data.leaderboard[0].displayName,'Löpare')
})
