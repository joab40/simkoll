import test from 'node:test'
import assert from 'node:assert/strict'
import {createRallyGame,advanceRally,rallyAiInput,finishRallyReplay,RALLY_REPLAY_VERSION,rallyScore} from '../src/rally-engine.js'
process.env.SUPABASE_URL='https://rally-times.invalid';process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='times-swimmer';process.env.SIMKOLL_COACH_CODE='times-coach'
const {default:handler}=await import('../api/points.js')
const game=createRallyGame();while(!['finished','timeout'].includes(game.status))advanceRally(game,1/120,{steer:rallyAiInput(game,game.cars[0]).steer})
const replay=finishRallyReplay(game)
const row=(id,time,source='recorded')=>({profile_id:id,duration_ms:time,track_version:source==='converted'?'legacy-stage-0':RALLY_REPLAY_VERSION,time_source:source,saved_at:'2026-11-08T10:00:00Z',profiles:{display_name:id,emoji:'🏎️'}})
function fixture({session=true,testProfile=false,times=[row('fast',30000),row('driver',40000)],scores=[],fail}={}){
  const writes=[],reads=[]
  globalThis.fetch=async(raw,options={})=>{
    const path=String(raw).split('/rest/v1/')[1];let data=[]
    if(options.method)writes.push({path,method:options.method,body:JSON.parse(options.body||'{}')});else reads.push(path)
    if(path.startsWith('profile_sessions?'))data=session?[{profile_id:'driver'}]:[]
    else if(path.startsWith('profiles?'))data=[{id:'driver',is_test_profile:testProfile}]
    else if(path.startsWith('rally_times?')&&path.includes('select=profile_id&'))data=[{profile_id:'driver'}]
    else if(path.startsWith('rally_times?'))data=times
    else if(path.startsWith('game_scores?'))data=scores
    return{ok:!fail?.(path),status:503,json:async()=>data}
  }
  return{writes,reads}
}
async function call(body=null,query={},code='times-swimmer'){
  const response={setHeader(){},status(value){this.code=value;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'},body,query},response);return response
}
test('time save uses actual authenticated replay time, not client place/score/time, and awards normal daily participation',async()=>{
  const original=globalThis.fetch
  try{
    const db=fixture(),res=await call({action:'submit-rally-time',replay,profileId:'forged',durationMs:1,score:99999})
    assert.equal(res.code,200)
    const write=db.writes.find(w=>w.path==='rpc/keep_rally_time')
    assert.deepEqual(write.body,{p_profile_id:'driver',p_duration_ms:replay.duration,p_track_version:RALLY_REPLAY_VERSION,p_time_source:'recorded'})
    assert.ok(db.writes.some(w=>w.path.startsWith('point_events?')))
    assert.ok(db.writes.every(w=>!w.path.startsWith('game_scores')))
    assert.equal(res.data.ownBest.durationMs,40000)
  }finally{globalThis.fetch=original}
})
test('local original restoration is idempotent storage only: no participation, points or weekly ghost upload',async()=>{
  const original=globalThis.fetch
  try{
    const db=fixture(),res=await call({action:'restore-rally-time',replay})
    assert.equal(res.code,200);assert.equal(db.writes.length,1)
    assert.equal(db.writes[0].body.p_time_source,'recovered')
    assert.ok(db.reads.every(path=>!path.startsWith('rally_weekly_ghosts?')))
  }finally{globalThis.fetch=original}
})
test('rally time board includes own best outside top ten and marks converted/old tracks',async()=>{
  const original=globalThis.fetch
  try{
    fixture({times:[...Array.from({length:11},(_,i)=>row(`other${i}`,30000+i*100)),row('driver',45000,'converted')]})
    const res=await call(null,{game:'rally',time:'true'})
    assert.equal(res.code,200);assert.equal(res.data.leaderboard.length,10)
    assert.equal(res.data.ownBest.rank,12);assert.equal(res.data.ownBest.rankingPoints,0);assert.equal(res.data.ownBest.historicalTrack,true)
    assert.match(res.data.ownBest.displayTime,/≈/)
  }finally{globalThis.fetch=original}
})
test('All time awards 10–1 for rally time once per person; ignores raw rally score and retains other game scoring',async()=>{
  const original=globalThis.fetch
  try{
    fixture({times:[row('fast',30000),row('fast',33000),row('driver',40000),row('third',45000,'converted')],scores:[
      {profile_id:'driver',score:15000,game_key:'balance',created_at:'2026-11-08T10:00:00Z',profiles:{display_name:'driver'}},
      {profile_id:'raw-only',score:rallyScore(0,1,22),game_key:'rally',created_at:'2026-11-08T10:00:00Z',profiles:{display_name:'raw-only'}},
    ]})
    const res=await call(null,{game:'alltime'})
    assert.equal(res.code,200)
    assert.deepEqual(res.data.leaderboard.map(p=>[p.displayName,p.score]),[['driver',19],['fast',10],['third',8]])
  }finally{globalThis.fetch=original}
})
test('no profile, coach/test profile or invalid replay may save a time or award points',async()=>{
  const original=globalThis.fetch
  try{
    for(const config of[{session:false},{testProfile:true}]){
      const db=fixture(config);assert.equal((await call({action:'submit-rally-time',replay})).code,403);assert.equal(db.writes.length,0)
    }
    let db=fixture();assert.equal((await call({action:'submit-rally-time',replay},{},'times-coach')).code,403);assert.equal(db.writes.length,0)
    for(const broken of[null,{...replay,version:'old'},{...replay,frames:replay.frames.slice(0,4)}]){
      db=fixture();assert.equal((await call({action:'submit-rally-time',replay:broken})).code,400);assert.equal(db.writes.length,0)
    }
    db=fixture({session:false});assert.equal((await call(null,{game:'rally',time:'true'})).code,403)
  }finally{globalThis.fetch=original}
})
