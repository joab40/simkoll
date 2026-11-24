import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceDownhill, canExtendDownhillJump, createDownhillRace, downhillStartAction, downhillTime, DOWNHILL_GATES, DOWNHILL_GREEN_AT, DOWNHILL_LENGTH, DOWNHILL_SCORE_BASE, validDownhillScore } from '../src/downhill-engine.js'

function launch(start) {
  const race = createDownhillRace()
  downhillStartAction(race)
  if (start === 'early') downhillStartAction(race)
  for (let frame = 0; frame < DOWNHILL_GREEN_AT * 120 + 2; frame++) advanceDownhill(race, 1 / 120)
  if (start === 'perfect') downhillStartAction(race)
  return race
}

function finish(race, steer, tuck = false) {
  let landedBoost = false
  for (let frame = 0; race.phase !== 'finished' && frame < 10800; frame++) {
    const gate = DOWNHILL_GATES[race.gateIndex]
    advanceDownhill(race, 1 / 120, steer(race, gate), tuck)
    landedBoost ||= race.feedback?.tone === 'boost'
  }
  assert.equal(race.phase, 'finished')
  return { ...race.result, landedBoost }
}

test('the start clock rewards reaction at green and penalizes an early press', () => {
  const good = launch('perfect'), early = launch('early'), automatic = launch('automatic')
  assert.equal(good.launch, 'perfect')
  assert.equal(early.launch, 'early')
  assert.equal(early.penalty, .8)
  assert(good.speed > early.speed)
  for (let i = 0; i < 120; i++) advanceDownhill(automatic, 1 / 120)
  assert.equal(automatic.launch, 'normal')
  assert.equal(automatic.penalty, 0)
})

test('a clean line accelerates and finishes inside the target time', () => {
  const normal = launch('perfect')
  const clean = finish(normal, (race, gate) => gate ? (gate.x - race.x) * .55 - race.vx * .06 : 0, true)
  const missed = finish(launch('perfect'), () => 0)
  const snow = finish(launch('perfect'), () => 1)
  assert.equal(clean.gates, DOWNHILL_GATES.length)
  assert.equal(clean.penaltyMs, 0)
  assert.equal(clean.landedBoost, true)
  assert.equal(normal.track, DOWNHILL_LENGTH)
  assert(clean.raceMs >= 30000 && clean.raceMs <= 40000)
  assert(clean.timeMs < missed.timeMs)
  assert(clean.raceMs < snow.raceMs)
  assert.equal(missed.penaltyMs, (DOWNHILL_GATES.length - missed.gates) * 1250)
  assert(validDownhillScore(DOWNHILL_SCORE_BASE - clean.timeMs))
  assert.equal(downhillTime(35678, 3), '0:35,678')
})

test('race time and steering are stable across render frame rates', () => {
  function simulate(fps) {
    const race = launch('perfect')
    for (let i = 0; i < 8 * fps; i++) advanceDownhill(race, 1 / fps, -.14, true)
    return race
  }
  const slow = simulate(30), smooth = simulate(120)
  assert(Math.abs(slow.track - smooth.track) < .01)
  assert(Math.abs(slow.x - smooth.x) < .01)
  assert.equal(slow.penalty, smooth.penalty)
})

test('the wider gate accepts a line near the post and still penalizes a miss', () => {
  const first = DOWNHILL_GATES[0]
  function cross(offset) {
    const race = launch('perfect')
    race.track = first.distance - .1
    race.x = first.x + offset
    advanceDownhill(race, 1 / 120)
    return race
  }
  assert.equal(cross(4.65).cleared, 1)
  assert.equal(cross(5).penalty, 1.25)
})

test('tucking saves time and releasing lets the skier slow gradually', () => {
  const steer = (race, gate) => gate ? (gate.x - race.x) * .55 - race.vx * .06 : 0
  const standing = finish(launch('perfect'), steer)
  const tucked = finish(launch('perfect'), steer, true)
  assert.equal(tucked.gates, DOWNHILL_GATES.length)
  assert(tucked.timeMs >= 30000 && tucked.timeMs < standing.timeMs)

  const race = launch('perfect')
  while (race.track < 150) advanceDownhill(race, 1 / 120, 0, true)
  const speedBeforeRelease = race.speed
  for (let frame = 0; frame < 30; frame++) advanceDownhill(race, 1 / 120)
  assert(race.tuck > 0 && race.tuck < .2)
  assert(race.speed < speedBeforeRelease && race.speed > speedBeforeRelease * .95)
})

test('holding into the crest and releasing in the air lengthens the jump and adds speed once', () => {
  const race = launch('perfect')
  while (!race.jump && race.track < 400) advanceDownhill(race, 1 / 120, 0, true)
  assert(canExtendDownhillJump(race.jump))
  const takeoff = race.track
  for (let frame = 0; frame < 16; frame++) advanceDownhill(race, 1 / 120, 0, true)
  const held = structuredClone(race)
  const late = structuredClone(race)
  advanceDownhill(race, 1 / 120, 0, false)
  advanceDownhill(held, 1 / 120, 0, true)
  assert(race.jump.extended && !canExtendDownhillJump(race.jump))
  assert(race.speed > held.speed)
  const boostEnd = race.jumpBoostUntil
  for (let frame = 0; frame < 25; frame++) {
    advanceDownhill(race, 1 / 120, 0, frame < 14)
    advanceDownhill(late, 1 / 120, 0, true)
  }
  assert.equal(race.jumpBoostUntil, boostEnd)
  advanceDownhill(late, 1 / 120, 0, false)
  assert.equal(late.jump.extended, false)
  for (const [attempt, tucked] of [[race, false], [held, true]]) {
    for (let frame = 0; attempt.jump && frame < 240; frame++) advanceDownhill(attempt, 1 / 120, 0, tucked)
    assert.equal(attempt.jump, null)
  }
  assert(race.track - takeoff > (held.track - takeoff) * 1.3)
})
