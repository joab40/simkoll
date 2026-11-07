import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {rallyScore,RALLY_MAX_SCORE} from '../src/rally-engine.js'
process.env.SUPABASE_URL='https://rally-fixture.invalid'
process.env.SUPABASE_SECRET_KEY='fixture'
process.env.SIMKOLL_SWIMMER_CODE='rally-swimmer'
process.env.SIMKOLL_COACH_CODE='rally-coach'
const {default:handler}=await import('../api/points.js')
const row={score:rallyScore(0,1,42),profile_id:'driver',game_key:'rally',created_at:'2026-11-06T12:00:00Z',profiles:{display_name:'Testförare',emoji:'🏎️'}}
async function call(body,query={},code='rally-swimmer'){
  const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}}
  await handler({method:body?'POST':'GET',headers:{'x-simkoll-code':code,cookie:'simkoll_session=fixture'},body,query},response);return response
}
function fixture({session=true,existing=[],scores=[row],schedule}={}){
  const writes=[],reads=[]
  globalThis.fetch=async(raw,options={})=>{
    const path=String(raw).split('/rest/v1/')[1];let data=[]
    if(options.method)writes.push({path,method:options.method,body:JSON.parse(options.body||'{}')})
    else{reads.push(path);if(path.startsWith('profile_sessions?'))data=session?[{profile_id:'driver'}]:[];else if(path.startsWith('profiles?'))data=[{id:'driver'}];else if(path.startsWith('app_settings?')&&schedule)data=[{setting_value:{schedule}}];else if(path.includes('select=id,score'))data=existing;else if(path.includes('select=profile_id&limit'))data=[{profile_id:'driver'}];else if(path.startsWith('game_scores?'))data=scores}
    return{ok:true,json:async()=>data}
  }
  return{writes,reads}
}
test('rally saves to its own authenticated profile/key and returns a lifetime board',async()=>{
  const original=globalThis.fetch
  try{const{writes,reads}=fixture(),response=await call({action:'submit-game-score',gameKey:'rally',score:row.score,profileId:'forged'})
    assert.equal(response.code,200);const saved=writes.find(w=>w.path==='game_scores').body
    assert.equal(saved.game_key,'rally');assert.equal(saved.profile_id,'driver')
    assert.ok(reads.some(p=>p.includes('game_key=eq.rally&score=gte.10000')))
    assert.equal(response.data.leaderboard[0].displayName,'Testförare')
  }finally{globalThis.fetch=original}
})
test('rally only updates a better score and rejects invalid or unauthenticated submissions before writes',async()=>{
  const original=globalThis.fetch
  try{
    let db=fixture({existing:[{id:'record',score:row.score}]});await call({action:'submit-game-score',gameKey:'rally',score:row.score-1});assert.ok(db.writes.every(w=>!w.path.startsWith('game_scores')))
    db=fixture({existing:[{id:'record',score:10001}]});await call({action:'submit-game-score',gameKey:'rally',score:row.score});assert.equal(db.writes.find(w=>w.path.startsWith('game_scores')).method,'PATCH')
    db=fixture();for(const score of [0,14000,19999,RALLY_MAX_SCORE+1,1.5])assert.equal((await call({action:'submit-game-score',gameKey:'rally',score})).code,400);assert.equal(db.writes.length,0)
    db=fixture({session:false});assert.equal((await call({action:'submit-game-score',gameKey:'rally',score:row.score})).code,403);assert.equal(db.writes.length,0)
    db=fixture();assert.notEqual((await call({action:'submit-game-score',gameKey:'rally',score:row.score},{},'rally-coach')).code,200);assert.equal(db.writes.length,0)
  }finally{globalThis.fetch=original}
})
test('rally is available in coach library but never auto-published; real publication and archive use same key',async()=>{
  const original=globalThis.fetch
  try{
    fixture();const library=await call(null,{games:'true'},'rally-coach');assert.ok(library.data.catalog.some(g=>g.key==='rally'));assert.ok(library.data.schedule.every(g=>g.gameKey!=='rally'))
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
    for(const[published,date,active]of[[true,today,true],[false,today,false],[true,'2999-01-01',false]]){
      fixture({schedule:[{id:'rally',gameKey:'rally',startDate:date,endDate:date,published}]});assert.equal((await call(null,{games:'true'})).data.catalog.some(g=>g.key==='rally'),active)
    }
  }finally{globalThis.fetch=original}
})
test('lifetime and combined lists include rally and filter impossible historical scores',async()=>{
  const original=globalThis.fetch
  try{for(const query of[{game:'rally',lifetime:'true'},{game:'alltime'}]){
    const{reads}=fixture({scores:[{...row,score:19999,profile_id:'invalid'},row]});const response=await call(null,query)
    assert.equal(response.code,200);assert.equal(response.data.leaderboard.length,1);assert.equal(response.data.leaderboard[0].displayName,'Testförare');assert.ok(reads.some(p=>p.includes('rally')))
  }}finally{globalThis.fetch=original}
})
test('both real app entry points lazy-load rally and coach preview cannot save',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8'),component=readFileSync(new URL('../src/rally-game.jsx',import.meta.url),'utf8')
  assert.match(main,/deferredPanel\(\(\) => import\('\.\/rally-game.jsx'\)/)
  assert.match(main,/rally: \(\) => onOpen\('rally'\)/)
  assert.match(main,/screen === 'rally' && <RallyGame/)
  assert.ok(main.includes("{testing === 'rally' && <RallyGame code={code} onBack={() => setTesting('')} preview request={apiRequest} />"))
  assert.match(component,/if\(preview\|\|!validRallyScore\(score\)\|\|saveLock.current\)return/)
  assert.match(component,/visibilitychange/);assert.match(component,/onPointerCancel=\{lift\}/);assert.match(component,/onLostPointerCapture=\{lift\}/)
  assert.doesNotMatch(component,/brake|Broms|nextUnlocked|chooseStage/)
  assert.match(main,/profileId=\{profile\?\.id\} code=\{auth.code\}/)
  assert.match(component,/preview \? null : loadRallyGhost/)
  assert.match(component,/best===candidate&&!preview/)
  assert.match(component,/onClick=\{start\} aria-label="Starta om loppet"/)
  assert.match(component,/setRun\(value=>value\+1\)/)
  assert.match(component,/\[phase,run,draw/)
  const css=readFileSync(new URL('../src/rally-game.css',import.meta.url),'utf8')
  assert.ok(css.includes('.rally-fullscreen .rally-stage canvas{height:100%;'))
  assert.ok(css.includes('orientation:landscape'))
})
