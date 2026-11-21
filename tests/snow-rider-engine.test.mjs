import test from 'node:test'
import assert from 'node:assert/strict'
import {createSnowGame,startSnow,advanceSnow,jumpSnow,pauseSnow,resumeSnow,snowTrackCentre,snowTrackHeight,snowTrackGrade,snowUpcomingChallenge,snowScore,validSnowScore,SNOW_MAX_SCORE,SNOW_MAX_SPEED,SNOW_SECONDS,SNOW_STEP} from '../src/snow-rider-engine.js'

test('the hilly course is deterministic and keeps a collectible lane open between ice banks',()=>{
  const a=createSnowGame(),b=createSnowGame();assert.deepEqual(a,b)
  for (const gem of a.objects.filter(item => item.kind === 'gem')) {
    for (const bank of a.objects.filter(item => item.kind === 'bank' && item.s === gem.s - 4)) {
      assert(Math.abs(bank.x - gem.x) > bank.radius + .38)
    }
  }
  const grades = []
  for (let distance = 0; distance < 5000; distance += 13) {
    assert(Number.isFinite(snowTrackCentre(distance)))
    const grade = snowTrackGrade(distance)
    grades.push(grade)
    const sampledGrade = (snowTrackHeight(distance + .01) - snowTrackHeight(distance - .01)) / .02
    assert(Math.abs(grade - sampledGrade) < 1e-6)
  }
  assert(Math.max(...grades) > .1 && Math.min(...grades) < -.1)
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
  advanceSnow(g,90,Infinity);assert(g.distance<SNOW_MAX_SPEED*.1);assert.equal(g.x,0)
})
test('steering is continuous and bounded, jump is grounded-only, and low hazards can be cleared',()=>{
  const g=startSnow(createSnowGame());for(let i=0;i<120;i++)advanceSnow(g,1/120,1);assert(g.x>3);assert(g.x<=4.25)
  const low=startSnow(createSnowGame());low.objects=[{id:'rail',kind:'rail',s:12,x:0,height:.9,radius:5.1,depth:1.2}];low.row=1000
  assert(jumpSnow(low));advanceSnow(low,1/120);assert.equal(jumpSnow(low),false)
  for(let n=0;n<100;n++)advanceSnow(low,1/120)
  assert.equal(low.status,'playing');assert(low.distance>12)
})
test('a genuine collision ends the run exactly once; a crystal awards 25 exactly once',()=>{
  const g=startSnow(createSnowGame());g.objects=[{id:'bank',kind:'bank',s:.5,x:0,height:2.75,radius:.7,depth:1.75}];advanceSnow(g,1/60);assert.equal(g.status,'over')
  const stopped=g.distance;advanceSnow(g,1);assert.equal(g.distance,stopped)
  const c=startSnow(createSnowGame());c.objects=[{id:'gem',kind:'gem',s:.5,x:0,height:1.1,radius:.75,depth:1}];advanceSnow(c,1/60)
  assert.equal(c.gems,1);advanceSnow(c,1/60);assert.equal(c.gems,1);assert.equal(c.score,Math.floor(c.distance)+25)
})
test('the opening ends an unsteered run after three seconds and a hop alone is insufficient', () => {
  for (const hop of [false, true]) {
    const game = startSnow(createSnowGame())
    while (game.status === 'playing' && game.elapsed < 10) {
      if (hop && game.distance >= 96 && game.distance < 97) jumpSnow(game)
      advanceSnow(game, SNOW_STEP)
    }
    assert.equal(game.status, 'over')
    assert(game.elapsed >= 3 && game.elapsed < 5)
    assert.match(game.reason, hop ? /isvallen/ : /bommen/)
  }
})

test('a runner who times jumps and steers through the gaps can finish at maximum speed', () => {
  const game = startSnow(createSnowGame())
  const lanes = {left: -3.2, middle: 0, right: 3.2}
  let maxPool = 0
  for (let tick = 0; tick < SNOW_SECONDS / SNOW_STEP + 2 && game.status === 'playing'; tick++) {
    const next = snowUpcomingChallenge(game)
    if (next?.challenge === 'jump' && Math.abs((next.s - game.distance) / game.speed - .34) < .01) jumpSnow(game)
    const target = lanes[next?.challenge] ?? game.x
    advanceSnow(game, SNOW_STEP, (target - game.x) * 1.4 - game.vx * .12)
    maxPool = Math.max(maxPool, game.objects.length)
  }
  assert.equal(game.status, 'complete', `Crashed at ${game.distance.toFixed(1)} m: ${game.reason}`)
  assert.equal(game.elapsed, SNOW_SECONDS)
  assert.equal(game.speed, SNOW_MAX_SPEED)
  assert(maxPool <= 18)
  assert(validSnowScore(game.score))
  assert(game.distance <= SNOW_MAX_SPEED * SNOW_SECONDS)
  assert.equal(snowScore({distance:999999,gems:999999}),SNOW_MAX_SCORE)
  for(const score of [0,-1,1.5,NaN,Infinity,SNOW_MAX_SCORE+1,'50'])assert.equal(validSnowScore(score),false)
})
