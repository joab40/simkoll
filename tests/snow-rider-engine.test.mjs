import test from 'node:test'
import assert from 'node:assert/strict'
import {createSnowGame,startSnow,advanceSnow,jumpSnow,pauseSnow,resumeSnow,snowTrackCentre,snowScore,validSnowScore,SNOW_MAX_SCORE,SNOW_SECONDS} from '../src/snow-rider-engine.js'

test('the original course is deterministic and bounded, with one free collectible lane in each row',()=>{
  const a=createSnowGame(),b=createSnowGame();assert.deepEqual(a,b)
  for(let i=0;i<a.objects.length;i+=2){assert.notEqual(a.objects[i].x,a.objects[i+1].x);assert.equal(a.objects[i+1].kind,'gem');assert(a.objects[i].s>=65)}
  for(let s=0;s<5000;s+=13)assert(Number.isFinite(snowTrackCentre(s)))
  assert.notDeepEqual(a.objects,createSnowGame(444).objects)
})
test('ready/paused games do not progress; pause clears queued jumps and resume starts without accumulated time',()=>{
  const g=createSnowGame();advanceSnow(g,1);assert.equal(g.distance,0);assert.equal(jumpSnow(g),false)
  startSnow(g);advanceSnow(g,1/60);const distance=g.distance;assert(jumpSnow(g));pauseSnow(g)
  assert.equal(g.jumpQueued,false);advanceSnow(g,99);assert.equal(g.distance,distance)
  resumeSnow(g);advanceSnow(g,1/60);assert(g.distance>distance);assert.equal(g.y,0)
})
test('fixed physics agree at 30/60/120fps; invalid/long deltas cannot teleport through the course',()=>{
  const runs=[30,60,120].map(fps=>{const game=startSnow(createSnowGame());for(let n=0;n<fps*2;n++)advanceSnow(game,1/fps,.25);return game})
  assert(Math.abs(runs[0].distance-runs[2].distance)<1e-8);assert(Math.abs(runs[0].x-runs[2].x)<1e-8)
  const g=startSnow(createSnowGame());for(const dt of [0,-1,NaN,Infinity])advanceSnow(g,dt);assert.equal(g.distance,0)
  advanceSnow(g,90,Infinity);assert(g.distance<2);assert.equal(g.x,0)
})
test('steering is continuous and bounded, jump is grounded-only, and low hazards can be cleared',()=>{
  const g=startSnow(createSnowGame());for(let i=0;i<120;i++)advanceSnow(g,1/120,1);assert(g.x>3);assert(g.x<=4.25)
  const low=startSnow(createSnowGame());low.objects=[{id:'rock',kind:'rock',s:8,x:0,height:.6,radius:.8}];low.row=1000
  assert(jumpSnow(low));advanceSnow(low,1/120);assert.equal(jumpSnow(low),false)
  for(let n=0;n<100;n++)advanceSnow(low,1/120)
  assert.equal(low.status,'playing');assert(low.distance>8)
})
test('a genuine collision ends the run exactly once; a crystal awards 25 exactly once',()=>{
  const g=startSnow(createSnowGame());g.objects=[{id:'tree',kind:'pine',s:.5,x:0,height:4,radius:.7}];advanceSnow(g,1/60);assert.equal(g.status,'over')
  const stopped=g.distance;advanceSnow(g,1);assert.equal(g.distance,stopped)
  const c=startSnow(createSnowGame());c.objects=[{id:'gem',kind:'gem',s:.5,x:0,height:1.1,radius:.75}];advanceSnow(c,1/60)
  assert.equal(c.gems,1);advanceSnow(c,1/60);assert.equal(c.gems,1);assert.equal(c.score,Math.floor(c.distance)+25)
})
test('two-minute runs end, scene object pools stay bounded and score validation rejects fabricated ranges',()=>{
  const g=startSnow(createSnowGame());let max=0
  for(let i=0;i<SNOW_SECONDS*120+2&&g.status==='playing';i++){for(const item of g.objects)item.taken=true;advanceSnow(g,1/120);max=Math.max(max,g.objects.length)}
  assert.equal(g.status,'complete');assert.equal(g.elapsed,SNOW_SECONDS);assert(max<32);assert(validSnowScore(g.score));assert(g.distance<=32*SNOW_SECONDS)
  assert.equal(snowScore({distance:999999,gems:999999}),SNOW_MAX_SCORE)
  for(const score of [0,-1,1.5,NaN,Infinity,SNOW_MAX_SCORE+1,'50'])assert.equal(validSnowScore(score),false)
})
