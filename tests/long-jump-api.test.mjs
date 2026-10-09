import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL='https://jump-test.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_SWIMMER_CODE='jumper-fixture'
process.env.SIMKOLL_COACH_CODE='coach-fixture'
const {default:handler}=await import('../api/points.js')
const row={score:780,profile_id:'jumper',game_key:'longjump',created_at:'2026-10-10T12:00:00Z',profiles:{display_name:'Test'}}
async function call(body,query={},code='jumper-fixture'){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'},body,query},response)
  return response
}
function db(existing=[]) {
  const writes=[]
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).split('/rest/v1/')[1]
    let data=[]
    if(options.method){writes.push({path,body:JSON.parse(options.body||'{}')})}
    else if(path.startsWith('profile_sessions?'))data=[{profile_id:'jumper'}]
    else if(path.startsWith('profiles?'))data=[{id:'jumper'}]
    else if(path.includes('select=id,score'))data=existing
    else if(path.includes('select=profile_id&limit'))data=[{profile_id:'jumper'}]
    else if(path.startsWith('game_scores?'))data=[row]
    return {ok:true,json:async()=>data}
  }
  return writes
}
test('jump uses its own score key and displays centimetres as metres',async()=>{
  const writes=db(),response=await call({action:'submit-game-score',gameKey:'longjump',score:780})
  assert.equal(response.code,200)
  assert.equal(writes.find(item=>item.path==='game_scores').body.game_key,'longjump')
  assert.equal(response.data.leaderboard[0].displayTime,'7,80 m')
})
test('shorter jump cannot overwrite a better result',async()=>{
  const writes=db([{id:'old',score:800}])
  assert.equal((await call({action:'submit-game-score',gameKey:'longjump',score:780})).code,200)
  assert.ok(writes.every(item=>!item.path.startsWith('game_scores')))
})
test('fouls and impossible scores cannot award points or create records',async()=>{
  const writes=db()
  for(const score of [0,1001,7.5])assert.equal((await call({action:'submit-game-score',gameKey:'longjump',score})).code,400)
  assert.equal(writes.length,0)
})
test('new game can be tested by coaches without automatic publication',async()=>{
  db();const response=await call(null,{games:'true'},'coach-fixture')
  assert.ok(response.data.catalog.some(game=>game.key==='longjump'))
  assert.ok(response.data.schedule.every(game=>game.gameKey!=='longjump'))
})
