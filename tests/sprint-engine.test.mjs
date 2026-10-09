import test from 'node:test'
import assert from 'node:assert/strict'
import { createSprint, advanceSprint, sprintStep, sprintScore, validSprintScore, SPRINT_BASE } from '../src/sprint-engine.js'

function runRace(frameMs, cadenceMs) {
  const race=createSprint(0)
  let nextPress=3000, presses=0
  for(let frame=3000;frame<70000;frame+=frameMs){
    while(nextPress<=frame && ['countdown','running'].includes(race.status)){
      sprintStep(race, presses++%2?'right':'left',nextPress)
      nextPress+=cadenceMs
    }
    advanceSprint(race,frame)
    if(!['countdown','running'].includes(race.status))return race
  }
  return race
}
test('alternating touch/key inputs complete a valid 100m race',()=>{
  const race=runRace(16,140)
  assert.equal(race.status,'finished')
  assert.equal(race.distance,100)
  assert.ok(race.elapsed>9000 && race.elapsed<20000)
  assert.ok(validSprintScore(sprintScore(race.elapsed)))
})
test('race time is independent of rendering frequency',()=>{
  assert.ok(Math.abs(runRace(1000/120,140).elapsed-runRace(100,140).elapsed)<0.001)
})
test('holding a key or pressing the same side cannot accelerate the runner',()=>{
  const race=createSprint(0)
  assert.equal(sprintStep(race,'left',3000),true)
  assert.equal(sprintStep(race,'left',3100),false)
  assert.equal(race.steps,1)
  assert.ok(race.speed<1.65)
  assert.equal(sprintStep(race,'right',3200),true)
})
test('countdown input causes a false start, and abandoned race times are invalid',()=>{
  const race=createSprint(0)
  sprintStep(race,'left',2999)
  advanceSprint(race,15000)
  assert.equal(race.status,'false-start')
  assert.equal(race.distance,0)
  assert.equal(sprintScore(0),null)
  assert.equal(sprintScore(NaN),null)
  assert.equal(sprintScore(60001),null)
  assert.equal(validSprintScore(SPRINT_BASE-8000),false)
})
test('lack of movement times out without creating a finish',()=>{
  const race=createSprint(0)
  advanceSprint(race,63000)
  assert.equal(race.status,'timeout')
  assert.equal(race.distance,0)
})
test('a faster rhythm improves the time; later input cannot change a finished time',()=>{
  const fast=runRace(16,100),slow=runRace(16,240)
  assert.ok(fast.elapsed<slow.elapsed)
  const elapsed=fast.elapsed
  sprintStep(fast,'left',90000)
  advanceSprint(fast,95000)
  assert.equal(fast.elapsed,elapsed)
})
