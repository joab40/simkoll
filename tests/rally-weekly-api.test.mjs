import test from 'node:test'
import assert from 'node:assert/strict'
import { rallyWeekStart } from '../shared/rally-weekly.js'
import { createRallyGame, advanceRally, rallyAiInput, finishRallyReplay, RALLY_REPLAY_VERSION } from '../src/rally-engine.js'
process.env.SUPABASE_URL='https://weekly-rally-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='weekly-swimmer'
process.env.SIMKOLL_COACH_CODE='weekly-coach'
const {default:handler}=await import('../api/points.js')
const game=createRallyGame()
while(!['finished','timeout'].includes(game.status))advanceRally(game,1/120,{steer:rallyAiInput(game,game.cars[0]).steer})
const replay=finishRallyReplay(game),week=rallyWeekStart(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
const publication={gameKey:'rally',published:true,startDate:today,endDate:today}
const record={profile_id:'leader',duration_ms:replay.duration,replay,profiles:{display_name:'Snabbast',emoji:'🏎️'}}
async function call(body=null,code='weekly-swimmer',query={rallyGhost:'true'},method=body?'POST':'GET') {
  const response={setHeader(key,value){this[key]=value},status(value){this.code=value;return this},json(data){this.data=data;return this}}
  await handler({method,headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'},body,query},response)
  return response
}
function fixture({session=true,testProfile=false,schedule=[publication],records=[record],failure}={}) {
  const reads=[],writes=[]
  globalThis.fetch=async(raw,options={})=>{
    const path=String(raw).split('/rest/v1/')[1]
    if(options.method)writes.push({path,method:options.method,body:JSON.parse(options.body||'{}')});else reads.push(path)
    let data=[]
    if(path.startsWith('profile_sessions?'))data=session?[{profile_id:'driver'}]:[]
    else if(path.startsWith('profiles?'))data=[{id:'driver',is_test_profile:testProfile}]
    else if(path.startsWith('app_settings?'))data=[{setting_value:{schedule}}]
    else if(path.startsWith('rally_weekly_ghosts?'))data=records
    return {ok:!failure?.(path),status:503,json:async()=>data}
  }
  return {reads,writes}
}
const submission=()=>({action:'submit-rally-ghost',weekStart:week,replay})

test('authenticated weekly read returns one current-version leader with display name, never health data or all-time score',async()=>{
  const original=globalThis.fetch
  try {
    const db=fixture(),res=await call()
    assert.equal(res.code,200);assert.equal(res['Cache-Control'],'no-store')
    assert.equal(res.data.weekStart,week);assert.equal(res.data.trackVersion,RALLY_REPLAY_VERSION);assert.equal(res.data.active,true)
    assert.equal(res.data.leader.displayName,'Snabbast');assert.equal(res.data.leader.durationMs,replay.duration)
    assert.ok(db.reads.some(path=>path.includes(`week_start=eq.${week}`)&&path.includes(`track_version=eq.${RALLY_REPLAY_VERSION}`)&&path.includes('profiles.is_test_profile=eq.false')&&path.includes('profiles.active=eq.true')&&path.includes('profiles.approval_status=eq.approved')&&path.includes('order=duration_ms.asc,achieved_at.asc,profile_id.asc&limit=1')))
    assert.equal(db.writes.length,0);assert.ok(db.reads.every(path=>!/responses|game_scores|point_events/.test(path)))
  } finally {globalThis.fetch=original}
})

test('weekly submission uses session identity and server week, strips extras and never awards duplicate points',async()=>{
  const original=globalThis.fetch
  try {
    const db=fixture(),res=await call({...submission(),profileId:'forged',score:99999,replay:{...replay,privateData:'discard'}})
    assert.equal(res.code,200);assert.equal(db.writes.length,1)
    assert.deepEqual(db.writes[0],{path:'rpc/keep_weekly_rally_ghost',method:'POST',body:{p_profile_id:'driver',p_week_start:week,p_replay:replay}})
  } finally {globalThis.fetch=original}
})

test('no session, wrong role and wrong HTTP methods cannot read or publish ghosts',async()=>{
  const original=globalThis.fetch
  try {
    let db=fixture({session:false});assert.equal((await call()).code,403);assert.equal((await call(submission())).code,403);assert.equal(db.writes.length,0)
    for(const role of ['weekly-coach','wrong']) {db=fixture();assert.equal((await call(null,role)).code,403);assert.equal((await call(submission(),role)).code,403);assert.equal(db.reads.length,0);assert.equal(db.writes.length,0)}
    db=fixture();assert.equal((await call(null,'weekly-swimmer',{rallyGhost:'true'},'DELETE')).code,405);assert.equal(db.writes.length,0)
  } finally {globalThis.fetch=original}
})

test('unpublished, beta/test profiles and superseded publications never enter the weekly challenge',async()=>{
  const original=globalThis.fetch
  try {
    for(const config of [{schedule:[]},{schedule:[{...publication,published:false}]},{schedule:[{...publication,startDate:'2999-01-01',endDate:'2999-01-07'}]},{testProfile:true},{schedule:[{...publication,startDate:'2000-01-01'},{...publication,gameKey:'balance'}]}]) {
      const db=fixture(config),res=await call()
      assert.equal(res.code,200);assert.equal(res.data.active,false);assert.equal(res.data.leader,null)
      assert.equal((await call(submission())).code,409);assert.equal(db.writes.length,0);assert.ok(db.reads.every(path=>!path.startsWith('rally_weekly_ghosts?')))
    }
  } finally {globalThis.fetch=original}
})

test('empty current week is not substituted with last week, and crossed-week/old-track/fake runs are rejected',async()=>{
  const original=globalThis.fetch
  try {
    let db=fixture({records:[]});assert.equal((await call()).data.leader,null)
    for(const body of [{...submission(),weekStart:'2000-01-03'},{...submission(),replay:{...replay,version:'old-track'}},{...submission(),replay:{...replay,frames:replay.frames.slice(0,2)}}]) {
      db=fixture();assert.ok([400,409].includes((await call(body)).code));assert.equal(db.writes.length,0)
    }
  } finally {globalThis.fetch=original}
})

test('missing migration, failed upload and corrupt stored replay return explicit errors, leaving score storage untouched',async()=>{
  const original=globalThis.fetch
  try {
    for(const config of [{failure:path=>path.startsWith('rally_weekly_ghosts?')},{failure:path=>path.startsWith('rpc/keep_weekly')},{records:[{...record,duration_ms:1}]}]) {
      const db=fixture(config),res=await call(submission())
      assert.equal(res.code,503);assert.match(res.data.error,/ghost/)
      assert.ok(db.writes.every(write=>write.path==='rpc/keep_weekly_rally_ghost'))
    }
  } finally {globalThis.fetch=original}
})
