import test from 'node:test'
import assert from 'node:assert/strict'
import { createRallyGame, advanceRally, rallyAiInput, finishRallyReplay, validRallyReplay, rallyGhostAt, recoverRallyCar, RALLY_REPLAY_VERSION } from '../src/rally-engine.js'
import { loadRallyGhost, keepFasterRallyGhost, saveRallyGhost } from '../src/rally-ghost.js'

const replay = (duration=1000) => ({version:RALLY_REPLAY_VERSION,duration,frames:[[0,100,200,3.1,0],[duration,120,220,-3.1,0]]})
const memory = () => { const data=new Map(); return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)} }

test('real completed run captures a bounded replay with exact start, finish and original trajectory',()=>{
  const game=createRallyGame()
  assert.equal(finishRallyReplay(game),null)
  for(let i=0;i<18000&&!['finished','timeout'].includes(game.status);i++)advanceRally(game,1/120,{steer:rallyAiInput(game,game.cars[0]).steer})
  const saved=finishRallyReplay(game)
  assert.ok(validRallyReplay(saved));assert.ok(saved.frames.length<4000)
  assert.equal(saved.duration,Math.round(game.elapsed*1000))
  const last=rallyGhostAt(saved,game.elapsed)
  assert.ok(Math.abs(last.x-game.cars[0].x)<.06)
  assert.ok(Math.abs(last.y-game.cars[0].y)<.06)
  saved.frames[0][1]=999
  assert.notEqual(saved.frames[0][1],game.replayFrames[0][1])
  game.status='timeout';assert.equal(finishRallyReplay(game),null)
})
test('playback interpolates by race time and follows the short heading rotation',()=>{
  const saved=replay(),middle=rallyGhostAt(saved,.5)
  assert.equal(middle.x,110);assert.equal(middle.y,210)
  assert.ok(Math.abs(middle.heading)>3.13)
  assert.deepEqual(rallyGhostAt(saved,.5),middle) // paused race time is unchanged
  assert.equal(rallyGhostAt(saved,100).x,120)
  assert.equal(rallyGhostAt(saved,-100).x,100)
  assert.equal(rallyGhostAt(null,0),null)
})
test('recovery records its penalty and teleports instead of drawing a ghost through the scenery',()=>{
  const game=createRallyGame();game.status='racing'
  for(let i=0;i<30;i++)advanceRally(game,1/120)
  game.cars[0].x=700;game.cars[0].y=500
  const before=game.elapsed
  recoverRallyCar(game)
  const saved={version:RALLY_REPLAY_VERSION,duration:Math.round(game.elapsed*1000),frames:game.replayFrames}
  assert.ok(validRallyReplay(saved))
  assert.equal(rallyGhostAt(saved,before+1).x,700)
  assert.ok(Math.abs(rallyGhostAt(saved,before+3).x-game.cars[0].x)<.06)
})
test('fastest time wins regardless of placing, slower/invalid candidates never replace it',()=>{
  const best=replay(1000),slow=replay(2000),fast=replay(900)
  assert.equal(keepFasterRallyGhost(best,slow),best)
  assert.equal(keepFasterRallyGhost(best,replay(1000)),best)
  assert.equal(keepFasterRallyGhost(best,null),best)
  assert.equal(keepFasterRallyGhost(best,fast),fast)
})
test('ghost storage persists across visits, isolates profiles and survives disabled/corrupt storage',()=>{
  const storage=memory()
  assert.equal(saveRallyGhost(storage,'swimmer-a',replay()),true)
  assert.deepEqual(loadRallyGhost(storage,'swimmer-a'),replay())
  assert.equal(loadRallyGhost(storage,'swimmer-b'),null)
  saveRallyGhost(storage,'swimmer-a',replay(2000))
  assert.equal(loadRallyGhost(storage,'swimmer-a').duration,1000)
  assert.equal(saveRallyGhost(storage,null,replay()),false)
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}}
  assert.equal(loadRallyGhost(blocked,'a'),null);assert.equal(saveRallyGhost(blocked,'a',replay()),false)
  for(const raw of ['{',JSON.stringify({...replay(),version:'old-track'}),'x'.repeat(250001)]){
    assert.equal(loadRallyGhost({getItem:()=>raw},'a'),null)
  }
})
test('rejects wrong tracks, oversized, nonfinite, out-of-order and incomplete replays',()=>{
  assert.ok(validRallyReplay(replay()))
  const invalid=[{...replay(),version:'old'},{...replay(),duration:180001},{...replay(),frames:[]},{...replay(),frames:Array(4001).fill([0,0,0,0,0])},
    {...replay(),frames:[[0,100,200,0,0],[0,120,220,0,0]]},
    {...replay(),frames:[[0,100,200,0,0],[999,120,220,0,0]]},
    {...replay(),frames:[[0,100,200,NaN,0],[1000,120,220,0,0]]},
    {...replay(),frames:[[0,-100,200,0,0],[1000,120,220,0,0]]}]
  for(const value of invalid)assert.equal(validRallyReplay(value),false)
})
