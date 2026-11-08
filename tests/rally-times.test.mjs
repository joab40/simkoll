import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {rallyScore,createRallyGame,advanceRally,rallyAiInput,finishRallyReplay,RALLY_REPLAY_VERSION} from '../src/rally-engine.js'
import {convertedRallyTime,rankedRallyTimes,rallyTimeText,preferRallyTime} from '../shared/rally-times.js'
import {submitRallyTime} from '../src/rally-time-client.js'

test('legacy conversion discards rank/stage bonuses, marks estimates and bounds rounding uncertainty',()=>{
  for(const elapsed of[22,33.892,45,60.333,120.001,179.99])for(const stage of[0,1,2])for(const rank of[1,2,3,4]){
    const result=convertedRallyTime(rallyScore(stage,rank,elapsed))
    assert.ok(Math.abs(result.durationMs-elapsed*1000)<=91)
    assert.equal(result.timeSource,'converted');assert.equal(result.trackVersion,`legacy-stage-${stage}`)
  }
  for(const value of[0,19999,14000,13999,NaN,34000,'13000'])assert.equal(convertedRallyTime(value),null)
  assert.equal(rallyTimeText(0),'0:00,00');assert.equal(rallyTimeText(59999),'1:00,00')
  assert.equal(rallyTimeText(33892),'0:33,89');assert.equal(rallyTimeText(33874,true),'≈ 0:33,87')
  assert.equal(rallyTimeText(null),'—')
})
const record=(id,ms,source='recorded',trackVersion=RALLY_REPLAY_VERSION)=>({profileId:id,durationMs:ms,timeSource:source,trackVersion,savedAt:'2026-11-08T10:00:00Z',displayName:id,emoji:'🏎️'})
test('one fastest time per swimmer, originals preferred within their estimate bin; ranking is order independent',()=>{
  const old=record('a',33874,'converted','legacy-stage-0'),actual=record('a',33892)
  assert.equal(preferRallyTime(old,actual),actual);assert.equal(preferRallyTime(actual,old),actual)
  assert.equal(preferRallyTime(actual,null),actual)
  const rows=[old,actual,record('b',33000),record('b',45000),record('c',40000,'converted','legacy-stage-2'),record('bad',0)]
  const ranked=rankedRallyTimes(rows)
  assert.deepEqual(ranked.map(row=>[row.profileId,row.durationMs,row.rankingPoints]),[['b',33000,10],['a',33892,9],['c',40000,8]])
  assert.equal(ranked[1].displayTime,'0:33,89');assert.equal(ranked[2].historicalTrack,true)
  assert.match(ranked[2].displayTime,/≈/)
  assert.deepEqual(rankedRallyTimes([...rows].reverse()),ranked)
  assert.equal(rankedRallyTimes([record('a',30000,'converted','legacy-stage-0'),actual])[0].timeSource,'converted')
})
test('client sends actual full replay, with separate restoration action and no place-based score',async()=>{
  const game=createRallyGame()
  while(!['finished','timeout'].includes(game.status))advanceRally(game,1/120,{steer:rallyAiInput(game,game.cars[0]).steer})
  const replay=finishRallyReplay(game),calls=[],request=async(...args)=>{calls.push(args);return{leaderboard:[]}}
  await submitRallyTime(request,'code',replay);await submitRallyTime(request,'code',replay,true)
  assert.deepEqual(JSON.parse(calls[0][2].body),{action:'submit-rally-time',replay})
  assert.equal(JSON.parse(calls[1][2].body).action,'restore-rally-time')
  assert.ok(calls[0][2].signal instanceof AbortSignal)
  await assert.rejects(submitRallyTime(request,'code',null));assert.equal(calls.length,2)
  const component=readFileSync(new URL('../src/rally-game.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(component,/submit-game-score|entry\.score|view\.score|rallypoäng/)
  assert.match(component,/save\(candidate\);shareGhost\(candidate\)/)
  assert.match(component,/save\(pendingTime.current\)/)
  assert.match(component,/if\(preview\|\|!validRallyReplay\(replay\)\|\|saveLock.current\)return/)
  assert.match(component,/submitRallyTime\(request,code,local,true\)/)
})

test('SQL 117 backs up raw points, converts time without rank bonuses, recovers originals and preserves awards', {skip:!process.env.SIMKOLL_SQL_TEST_MODULE},async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href),db=new PGlite()
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333'
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key);create table point_events(id integer,points integer);insert into point_events values (1,42);')
    await db.exec(readFileSync(new URL('../supabase/migrations/017_game_scores.sql',import.meta.url),'utf8'))
    await db.exec(readFileSync(new URL('../supabase/migrations/116_rally_weekly_ghosts.sql',import.meta.url),'utf8'))
    await db.query('insert into profiles values ($1),($2),($3)',[a,b,c])
    const put=(id,week,score,key='rally')=>db.query('insert into game_scores(profile_id,week_start,score,game_key) values($1,$2,$3,$4)',[id,week,score,key])
    await put(a,'2026-11-02',rallyScore(0,1,60));await put(a,'2026-10-26',rallyScore(0,4,40))
    await put(b,'2026-11-02',rallyScore(0,2,33.892));await put(c,'2026-11-02',19999);await put(a,'2026-11-02',900,'balance')
    const replay={version:RALLY_REPLAY_VERSION,duration:33892,frames:[[0,1,1,0,0],[33892,2,2,0,0]]}
    await db.query('select keep_weekly_rally_ghost($1,$2,$3)',[b,'2026-11-02',replay])
    const before=(await db.query('select * from game_scores order by id')).rows
    const sql=readFileSync(new URL('../supabase/migrations/117_rally_time_ranking.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    assert.deepEqual((await db.query('select * from game_scores order by id')).rows,before)
    assert.equal((await db.query('select count(*)::integer as n from rally_score_backup')).rows[0].n,4)
    assert.equal((await db.query('select duration_ms from rally_times where profile_id=$1',[a])).rows[0].duration_ms,convertedRallyTime(rallyScore(0,4,40)).durationMs)
    const originals=(await db.query("select * from rally_times where profile_id=$1 and time_source='recorded'",[b])).rows
    assert.equal(originals[0].duration_ms,33892)
    assert.equal((await db.query('select * from rally_times where profile_id=$1',[c])).rows.length,0)
    assert.equal((await db.query('select points from point_events')).rows[0].points,42)
    const keep=(duration,source='recorded')=>db.query('select keep_rally_time($1,$2,$3,$4)',[a,duration,RALLY_REPLAY_VERSION,source])
    await keep(35000,'recovered')
    let own=(await db.query('select * from rally_times where profile_id=$1 and track_version=$2',[a,RALLY_REPLAY_VERSION])).rows[0]
    assert.equal(own.achieved_at,null);assert.equal(own.last_played_at,null)
    await keep(50000)
    own=(await db.query('select * from rally_times where profile_id=$1 and track_version=$2',[a,RALLY_REPLAY_VERSION])).rows[0]
    assert.equal(own.duration_ms,35000);assert.ok(own.last_played_at)
    await keep(34000);await keep(34000,'recovered')
    own=(await db.query('select * from rally_times where profile_id=$1 and track_version=$2',[a,RALLY_REPLAY_VERSION])).rows[0]
    assert.equal(own.duration_ms,34000);assert.equal(own.time_source,'recorded')
    await db.exec(sql);assert.equal((await db.query('select duration_ms from rally_times where profile_id=$1 and track_version=$2',[a,RALLY_REPLAY_VERSION])).rows[0].duration_ms,34000)
    await assert.rejects(keep(0));await assert.rejects(keep(180001));await assert.rejects(keep(33000,'forged'))
    for(const role of['anon','authenticated']){
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from rally_times'));await assert.rejects(db.query('select * from rally_score_backup'));await assert.rejects(keep(33000))
      await db.exec('reset role')
    }
    await db.query('delete from profiles where id=$1',[a])
    assert.equal((await db.query('select * from rally_times where profile_id=$1',[a])).rows.length,0)
    assert.equal((await db.query('select * from rally_score_backup where profile_id=$1',[a])).rows.length,0)
  }finally{await db.close()}
})
