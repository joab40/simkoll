import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {SNOW_MAX_SCORE} from '../src/snow-rider-engine.js'
process.env.SUPABASE_URL='https://snow-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture-only'
process.env.SIMKOLL_SWIMMER_CODE='snow-swimmer'
process.env.SIMKOLL_COACH_CODE='snow-coach'
const {default:handler}=await import('../api/points.js')
const row={profile_id:'snow-player',game_key:'snowrider',score:350,created_at:'2026-11-21T10:00:00Z',profiles:{display_name:'Teståkare',emoji:'🛷'}}
const json=data=>({ok:true,json:async()=>data})
function fixture({session=true,existing=[],rows=[row],ownRows=[],schedule}={}){
  const reads=[],writes=[]
  globalThis.fetch=async(raw,options={})=>{
    const url=new URL(raw),path=url.pathname.split('/rest/v1/')[1];assert.equal(url.hostname,'snow-fixture.invalid')
    if(options.method){writes.push({path,query:url.searchParams,method:options.method,body:JSON.parse(options.body||'{}')});return json([])}
    reads.push({path,query:url.searchParams})
    if(path==='profile_sessions')return json(session?[{profile_id:'snow-player'}]:[])
    if(path==='profiles')return json([{id:'snow-player'}])
    if(path==='app_settings')return json(schedule?[{setting_value:{schedule}}]:[])
    if(path==='game_scores') {
      const select = url.searchParams.get('select')
      return json(select === 'id,score' ? existing : select === 'score' ? ownRows : rows)
    }
    return json([])
  }
  return {reads,writes}
}
async function call(body,query={},code='snow-swimmer'){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',query,body,headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'}},response);return response
}
test('Snow Rider saves the current week and returns the all-time record without awarding daily or team points',async()=>{
  const db=fixture(),result=await call({action:'submit-game-score',gameKey:'snowrider',score:350,profileId:'other'})
  assert.equal(result.code,200);assert.equal(result.data.ownBest,350)
  assert.equal(db.writes.length,1);assert.equal(db.writes[0].body.profile_id,'snow-player');assert.equal(db.writes[0].body.game_key,'snowrider')
  assert.match(db.writes[0].body.week_start, /^\d{4}-\d{2}-\d{2}$/)
  assert(!db.reads.some(r=>['point_events','personal_training_sessions','responses','profile_daily_activity'].includes(r.path)))
  const unchanged=fixture({existing:[{id:'best',score:500}]});await call({action:'submit-game-score',gameKey:'snowrider',score:350});assert.equal(unchanged.writes.length,0)
})
test('a lower score in a new week keeps the older personal record and ranking', async () => {
  const rows = [{ ...row, score: 620, created_at: '2026-11-11T10:00:00Z' }, row]
  const db = fixture({ rows })
  const latest = await call({ action: 'submit-game-score', gameKey: 'snowrider', score: 350 })
  const reopened = await call(null, { game: 'snowrider', lifetime: 'true' })
  for (const result of [latest, reopened]) {
    assert.equal(result.data.ownBest, 620)
    assert.deepEqual(result.data.leaderboard.map(record => record.score), [620])
  }
  const scoreReads = db.reads.filter(read => read.path === 'game_scores')
  assert.equal(scoreReads.filter(read => !read.query.has('week_start')).length, 2)
})
test('personal Snow Rider record is read without a week filter even outside the fetched board', async () => {
  const db = fixture({ rows: [{ ...row, profile_id: 'another-player' }], ownRows: [{ score: 275 }] })
  const result = await call(null, { game: 'snowrider', lifetime: 'true' })
  assert.equal(result.data.ownBest, 275)
  const personal = db.reads.find(read => read.query.get('select') === 'score')
  assert.equal(personal.query.get('profile_id'), 'eq.snow-player')
  assert.equal(personal.query.get('order'), 'score.desc')
  assert.equal(personal.query.has('week_start'), false)
})
test('impossible scores and non-swimmer actors cannot submit',async()=>{
  const db=fixture();for(const score of [0,-1,1.5,SNOW_MAX_SCORE+1])assert.equal((await call({action:'submit-game-score',gameKey:'snowrider',score})).code,400)
  assert.equal(db.writes.length,0)
  const absent=fixture({session:false});assert.equal((await call({action:'submit-game-score',gameKey:'snowrider',score:200})).code,403);assert.equal(absent.writes.length,0)
  const coach=fixture();assert.notEqual((await call({action:'submit-game-score',gameKey:'snowrider',score:200},{},'snow-coach')).code,200);assert.equal(coach.writes.length,0)
})
test('new game is available for coach preview/beta but is not automatically published',async()=>{
  const db=fixture(),result=await call(null,{games:'true'},'snow-coach');assert.equal(result.code,200)
  assert(result.data.catalog.some(game=>game.key==='snowrider'&&game.route==='snowrider'));assert(!result.data.schedule.some(period=>period.gameKey==='snowrider'));assert.equal(db.writes.length,0)
})
test('weekly, lifetime and combined standings reject impossible records; reset touches only own game',async()=>{
  for(const query of [{game:'snowrider'},{game:'snowrider',lifetime:'true'},{game:'alltime'}]){
    const db=fixture({rows:[{...row,profile_id:'bad',score:SNOW_MAX_SCORE+1},row]}),response=await call(null,query)
    assert.equal(response.code,200);assert.equal(response.data.leaderboard.length,1);assert.equal(response.data.leaderboard[0].score,query.game==='alltime'?10:350)
    assert(db.reads.some(r=>r.path==='game_scores'))
  }
  const db=fixture(),reset=await call({action:'reset-game-score',gameKey:'snowrider',profileId:'other'});assert.equal(reset.code,200)
  assert.equal(db.writes[0].path,'game_scores');assert.equal(db.writes[0].method,'DELETE')
  assert.equal(db.writes[0].query.get('profile_id'),'eq.snow-player');assert.equal(db.writes[0].query.get('game_key'),'eq.snowrider')
})
test('the real integration is lazy, original, preview-safe and handles input cancellation, pause and 3D errors',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8'),game=readFileSync(new URL('../src/snow-rider-game.jsx',import.meta.url),'utf8'),scene=readFileSync(new URL('../src/snow-rider-scene.jsx',import.meta.url),'utf8')
  assert.match(main,/import\('\.\/snow-rider-game.jsx'\)/);assert.match(main,/screen === 'snowrider'/);assert.match(main,/snowrider: SnowRiderGame/);assert.match(main,/<SnowRiderGame code=\{code\} onBack=\{\(\) => setTesting\(''\)\} preview/)
  assert.match(game,/if\(preview\)return/);assert.match(game,/if\(preview\|\|!pending.current/)
  assert.match(game,/game=snowrider&lifetime=true/)
  assert.match(game,/onPointerCancel=\{releasePointer\}/);assert.match(game,/onLostPointerCapture=\{releasePointer\}/);assert.match(game,/cancelAnimationFrame/);assert.match(game,/visibilitychange/)
  assert.match(scene,/webglcontextlost/);assert.match(game,/SnowGraphicsBoundary/);assert.match(game,/frameloop=\{view.status==='playing'\?'always':'demand'\}/)
  assert.doesNotMatch(game+scene,/360playzone|<iframe|localStorage|https?:\/\//)
})
