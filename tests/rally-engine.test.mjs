import test from 'node:test'
import assert from 'node:assert/strict'
import { createRallyGame, createRallyTrack, rallyTrackAt, projectRally, advanceRally, advanceRallyGates, recoverRallyCar, rallyAiInput, rallyScore, validRallyScore, RALLY_MAX_SCORE, RALLY_LIMIT, RALLY_TRACKS } from '../src/rally-engine.js'

test('original circuits are closed, finite and share renderer/physics geometry',()=>{
  assert.equal(RALLY_TRACKS.length,1)
  assert.ok(RALLY_TRACKS[0].anchors.length>8)
  for(let stage=0;stage<RALLY_TRACKS.length;stage++){
    const track=createRallyTrack(stage)
    assert.ok(track.length>2200&&track.length<5000)
    for(let s=0;s<track.length;s+=83){const p=rallyTrackAt(track,s),q=projectRally(track,p.x,p.y);assert.ok(q.distance<.01);assert.ok(Number.isFinite(p.angle))}
    assert.deepEqual(rallyTrackAt(track,0),rallyTrackAt(track,track.length))
  }
  assert.throws(()=>createRallyTrack(1))
})
test('countdown does not move cars, hidden-tab frame gaps are clamped, fixed steps agree at 30 and 120 fps',()=>{
  const game=createRallyGame(),x=game.cars[0].x
  for(let i=0;i<60;i++)advanceRally(game,1/60)
  assert.equal(game.elapsed,0);assert.equal(game.cars[0].x,x)
  advanceRally(game,900);assert.ok(game.countdown>1.8)
  const slow=createRallyGame(),fast=createRallyGame()
  for(let i=0;i<240;i++)advanceRally(slow,1/30,{steer:.2})
  for(let i=0;i<960;i++)advanceRally(fast,1/120,{steer:.2})
  assert.ok(Math.abs(slow.cars[0].x-fast.cars[0].x)<.01)
  assert.ok(Math.abs(slow.elapsed-fast.elapsed)<.01)
})
test('finish crossings, backwards driving and shortcuts cannot award unearned laps',()=>{
  const game=createRallyGame(),car=game.cars[0],track=game.track
  car.speed=220
  advanceRallyGates(car,track.length-1,1,track,true,1/120)
  assert.equal(car.laps,0);assert.equal(car.gates,0)
  advanceRallyGates(car,1,track.length-1,track,true,1/120)
  assert.equal(car.gates,0)
  advanceRallyGates(car,20,track.length/12+2,track,true,1/120)
  assert.equal(car.gates,0)
  for(let gate=1;gate<=36;gate++){
    const s=(gate%12)/12*track.length
    const before=(s-.5+track.length)%track.length,after=(s+.5)%track.length
    advanceRallyGates(car,before,after,track,false,1/120);assert.equal(car.gates,gate-1)
    advanceRallyGates(car,before,after,track,true,1/120);assert.equal(car.gates,gate)
  }
  assert.equal(car.laps,3)
})
test('three laps can be completed on every circuit; rivals really drive the same road',()=>{
  for(let stage=0;stage<RALLY_TRACKS.length;stage++){
    const game=createRallyGame(stage)
    for(let i=0;i<18000&&!['finished','timeout'].includes(game.status);i++)advanceRally(game,1/120,{steer:rallyAiInput(game,game.cars[0]).steer})
    assert.equal(game.status,'finished');assert.equal(game.cars[0].laps,3)
    assert.ok(game.elapsed>20&&game.elapsed<RALLY_LIMIT)
    assert.ok(game.cars.slice(1).every(car=>car.gates>20))
    assert.ok(validRallyScore(game.score))
  }
})
test('boost, grass drag, recovery penalty and time limit affect real physics',()=>{
  const game=createRallyGame();game.status='racing'
  const car=game.cars[0],point=rallyTrackAt(game.track,game.track.boosts[0]-2)
  Object.assign(car,{x:point.x,y:point.y,s:point.s,heading:point.angle,speed:220})
  advanceRally(game,1/60);assert.ok(car.boost>0)
  Object.assign(car,{x:1450,y:30,speed:240})
  for(let i=0;i<60;i++)advanceRally(game,1/120)
  assert.equal(car.offroad,true);assert.ok(car.speed<120)
  const gates=car.gates,time=game.elapsed
  recoverRallyCar(game);assert.equal(car.gates,gates);assert.equal(game.elapsed,time+3);assert.equal(game.recoveries,1)
  game.elapsed=RALLY_LIMIT-.001;advanceRally(game,1/60)
  assert.equal(game.status,'timeout');assert.equal(game.score,0)
})
test('score prioritizes place then race time and preserves historical score formats',()=>{
  assert.ok(rallyScore(1,4,179)>rallyScore(0,1,20))
  assert.ok(rallyScore(0,1,179)>rallyScore(0,2,20))
  assert.ok(rallyScore(0,1,40)>rallyScore(0,1,50))
  assert.ok(validRallyScore(rallyScore(2,1,40)))
  for(const value of [0,-1,14000,19999,RALLY_MAX_SCORE+1,1.5,NaN,Infinity])assert.equal(validRallyScore(value),false)
  assert.equal(rallyScore(0,1,0),0);assert.equal(rallyScore(3,1,40),0)
})
test('eight solid obstacles slow cars without closing the road or skipping gates',()=>{
  const game=createRallyGame();game.status='racing'
  assert.equal(game.track.obstacles.length,8)
  for(const obstacle of game.track.obstacles){
    assert.ok(projectRally(game.track,obstacle.x,obstacle.y).distance>=38)
    assert.ok(projectRally(game.track,obstacle.x,obstacle.y).distance-obstacle.radius>20)
  }
  const car=game.cars[0],obstacle=game.track.obstacles[0]
  Object.assign(car,{x:obstacle.x,y:obstacle.y,s:obstacle.s,speed:205,heading:obstacle.angle})
  advanceRally(game,1/120)
  assert.ok(car.speed<90);assert.ok(car.hitCooldown>0)
  assert.ok(Math.hypot(car.x-obstacle.x,car.y-obstacle.y)>obstacle.radius+12)
  assert.equal(car.gates,0)
})
test('player only steers: legacy brake and speed inputs have no effect',()=>{
  const a=createRallyGame(),b=createRallyGame()
  for(let i=0;i<600;i++){
    advanceRally(a,1/120,{steer:.3})
    advanceRally(b,1/120,{steer:.3,brake:true,targetSpeed:1})
  }
  assert.deepEqual(a.cars[0],b.cars[0])
})
