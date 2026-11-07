import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { rallyWeekStart } from '../shared/rally-weekly.js'
import { createRallyGame, advanceRally, rallyAiInput, rallyTrackAt, rallyAngle, finishRallyReplay, recoverRallyCar, RALLY_REPLAY_VERSION } from '../src/rally-engine.js'
import { sharedRallyReplay } from '../server/rally-weekly.js'
import { weeklyGhostData, requestWeeklyGhost } from '../src/rally-weekly-client.js'
import { featureFaqGuide } from '../shared/feature-faq.js'

function completed(recover = false) {
  const game = createRallyGame();let recovered = false
  for (let i = 0; i < 22000 && !['finished', 'timeout'].includes(game.status); i++) {
    advanceRally(game, 1 / 120, { steer: rallyAiInput(game, game.cars[0]).steer })
    if (recover && !recovered && game.elapsed > 5) { recoverRallyCar(game);recovered = true }
  }
  return finishRallyReplay(game)
}
const replay = completed()
const leader = { profileId: 'driver', displayName: 'Testförare', emoji: '🏎️', durationMs: replay.duration, replay }
const data = { weekStart: '2026-11-02', trackVersion: RALLY_REPLAY_VERSION, active: true, leader }

test('weekly ghost follows Swedish calendar weeks across midnight, year boundary and DST', () => {
  for (const [stamp, week] of [
    ['2026-11-01T22:59:59Z','2026-10-26'],['2026-11-01T23:00:00Z','2026-11-02'],
    ['2026-12-31T23:30:00Z','2026-12-28'],['2027-01-03T23:00:00Z','2027-01-04'],
    ['2026-03-29T22:00:00Z','2026-03-30'],['2026-10-25T23:00:00Z','2026-10-26'],
  ]) assert.equal(rallyWeekStart(new Date(stamp)),week)
})

test('shared replay accepts real complete runs and paid recovery; strips unneeded metadata', () => {
  assert.deepEqual(sharedRallyReplay({ ...replay, auth: 'not stored', displayName: 'forged' }),replay)
  const recovered = completed(true)
  assert.ok(recovered.frames.some(frame=>frame[4]===1))
  assert.deepEqual(sharedRallyReplay(recovered),recovered)
})

test('shared replay also accepts legitimate inner, outer and wide-grass racing lines', () => {
  for (const offset of [-75,-50,0,50,75]) {
    const game=createRallyGame()
    for (let i=0;i<22000&&!['finished','timeout'].includes(game.status);i++) {
      const car=game.cars[0],point=rallyTrackAt(game.track,car.s+85,offset)
      const error=rallyAngle(Math.atan2(point.y-car.y,point.x-car.x)-car.heading)
      advanceRally(game,1/120,{steer:Math.max(-1,Math.min(1,error*1.8))})
    }
    assert.ok(sharedRallyReplay(finishRallyReplay(game)),`legitimate line at ${offset}`)
  }
})

test('shared replay rejects fake finishes, changed tracks, teleports, missing frames and unpaid recovery', () => {
  const clone = () => structuredClone(replay)
  const invalid = [{...replay,version:'old-track'}, {...replay,frames:[]}, {...replay,frames:Array(4001).fill(replay.frames[0])}]
  let value=clone();value.frames[0][1]+=10;invalid.push(value)
  value=clone();value.frames[3][1]+=100;invalid.push(value)
  value=clone();value.frames.splice(5,10);invalid.push(value)
  value=clone();value.frames[3][4]=1;invalid.push(value)
  value=clone();value.frames=value.frames.slice(0,Math.floor(value.frames.length/2));value.duration=value.frames.at(-1)[0];invalid.push(value)
  value=clone();value.frames.forEach(frame=>{frame[0]=Math.round(frame[0]/3)});value.duration=value.frames.at(-1)[0];invalid.push(value)
  for (const candidate of invalid) assert.equal(sharedRallyReplay(candidate),null)
})

test('client validates weekly leader version, date, matching duration, and supports empty or inactive weeks', () => {
  assert.deepEqual(weeklyGhostData(data),data)
  assert.deepEqual(weeklyGhostData({...data,leader:null}).leader,null)
  assert.deepEqual(weeklyGhostData({...data,active:false}).leader,null)
  for (const value of [null,{...data,weekStart:'2026-11-03'},{...data,weekStart:'2026-02-30'}, {...data,trackVersion:'old'}, {...data,leader:{...leader,durationMs:1}}, {...data,leader:{...leader,replay:{...replay,version:'old'}}}]) assert.throws(()=>weeklyGhostData(value))
})

test('client requests only weekly endpoint with timeout signal and current finished candidate, not local all-time best', async () => {
  const requests=[],request=async(...args)=>{requests.push(args);return data}
  assert.deepEqual(await requestWeeklyGhost(request,'code'),data)
  await requestWeeklyGhost(request,'code',{weekStart:data.weekStart,replay})
  assert.equal(requests[0][0],'/api/points?rallyGhost=true');assert.equal(requests[0][1],'code')
  assert.ok(requests[0][2].signal instanceof AbortSignal)
  assert.equal(requests[1][0],'/api/points');assert.equal(requests[1][2].method,'POST')
  assert.deepEqual(JSON.parse(requests[1][2].body),{action:'submit-rally-ghost',weekStart:data.weekStart,replay})
  await assert.rejects(requestWeeklyGhost(async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'})},'code'),/inte i tid/)
})

test('game freezes weekly rival per start, isolates preview and leaves touch controls/physics separate', () => {
  const game=readFileSync(new URL('../src/rally-game.jsx',import.meta.url),'utf8')
  assert.match(game,/const next=preview\?null:await loadWeekly\(\)/)
  assert.equal((game.match(/raceWeekly\.current=/g)||[]).length,1)
  assert.match(game,/raceWeekly\.current=next\?\.active\?next.leader:null/)
  assert.match(game,/if\(preview\|\|!candidate\|\|!context\?\.active\)return/)
  assert.match(game,/const candidate=keepGhost\(\);save\(game.current.score\);shareGhost\(candidate\)/)
  assert.match(game,/replay:pending\?\.weekStart===context.weekStart/)
  assert.match(game,/if\(saveLock.current\|\|weeklyLock.current\|\|startLock.current\|\|saveError\)return/)
  assert.match(game,/Visa egen ghost/);assert.match(game,/Visa veckans ghost/)
  assert.match(game,/guardRallyTouches\(area.current,release\)/)
  const art=readFileSync(new URL('../src/rally-art.js',import.meta.url),'utf8')
  assert.match(art,/color:'#b7f5ff'/);assert.match(art,/color:'#ffcf6b'/)
  assert.match(art,/rallyGhostAt\(item.replay,game.elapsed\)/)
  assert.doesNotMatch(game,/setInterval/)
  for (const role of ['coach','swimmer']) assert.match(featureFaqGuide(role),/guldfärgad Veckans ghost/)
})

test('SQL 116 is private, repeatable, preserves faster records and cascades profile erasure', {skip:!process.env.SIMKOLL_SQL_TEST_MODULE}, async () => {
  const {PGlite}=await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href),db=new PGlite()
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles(id uuid primary key);")
    const sql=readFileSync(new URL('../supabase/migrations/116_rally_weekly_ghosts.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    const id='11111111-1111-4111-8111-111111111111'
    await db.query('insert into profiles values ($1)',[id])
    const keep=(duration)=>db.query('select public.keep_weekly_rally_ghost($1,$2,$3)',[id,'2026-11-02',{...replay,duration}])
    await keep(40000);await keep(50000);await keep(40000)
    assert.equal((await db.query('select duration_ms from rally_weekly_ghosts')).rows[0].duration_ms,40000)
    await keep(35000)
    assert.equal((await db.query('select duration_ms from rally_weekly_ghosts')).rows[0].duration_ms,35000)
    await assert.rejects(db.query('select public.keep_weekly_rally_ghost($1,$2,$3)',[id,'2026-11-03',replay]))
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.rally_weekly_ghosts'))
    await assert.rejects(keep(34000))
    await db.exec('reset role;set role authenticated')
    await assert.rejects(db.query('select * from public.rally_weekly_ghosts'))
    await assert.rejects(keep(34000))
    await db.exec('reset role')
    await db.query('delete from profiles where id=$1',[id])
    assert.equal((await db.query('select * from rally_weekly_ghosts')).rows.length,0)
  } finally {await db.close()}
})
