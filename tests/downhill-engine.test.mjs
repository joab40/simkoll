import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceDownhill, canTimeDownhillJump, createDownhillRace, downhillCentre, downhillJumpAction, downhillStartAction, downhillTime, DOWNHILL_CRESTS, DOWNHILL_GATES, DOWNHILL_GREEN_AT, DOWNHILL_LENGTH, DOWNHILL_SCORE_BASE, validDownhillScore } from '../src/downhill-engine.js'

function launch(start) {
  const race = createDownhillRace()
  downhillStartAction(race)
  if (start === 'early') downhillStartAction(race)
  for (let frame = 0; frame < DOWNHILL_GREEN_AT * 120 + 2; frame++) advanceDownhill(race, 1 / 120)
  if (start === 'perfect') downhillStartAction(race)
  return race
}

function finish(race, steer) {
  let landedBoost = false
  for (let frame = 0; race.phase !== 'finished' && frame < 10800; frame++) {
    const gate = DOWNHILL_GATES[race.gateIndex]
    advanceDownhill(race, 1 / 120, steer(race, gate))
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
  const clean = finish(normal, (race, gate) => gate ? (gate.x - race.x) * .55 - race.vx * .06 : 0)
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
    for (let i = 0; i < 8 * fps; i++) advanceDownhill(race, 1 / fps, -.14)
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

test('the hop button lifts the skier immediately and ignores extra presses while airborne', () => {
  const race = launch('perfect')
  downhillJumpAction(race)
  assert(race.jump)
  assert.equal(race.jump.crest, null)
  advanceDownhill(race, 1 / 120)
  assert(race.jump.height > 0)
  const velocity = race.jump.velocity
  downhillJumpAction(race)
  assert.equal(race.jump.velocity, velocity)
  assert.equal(race.jumpBoostUntil, 0)
})

test('the straight has three small bumps and buffers a timed jump until the crest', () => {
  const bumps = DOWNHILL_CRESTS.filter(crest => crest.distance >= 700 && crest.distance <= 900 && crest.height < 1)
  assert.equal(bumps.length, 3)
  assert(bumps.every(crest => downhillCentre(crest.distance) === downhillCentre(700)))
  const crest = bumps[0]
  const race = launch('perfect')
  race.track = crest.distance - 12
  race.crestIndex = DOWNHILL_CRESTS.indexOf(crest)
  assert(canTimeDownhillJump(race))
  downhillJumpAction(race)
  assert.equal(race.jump, null)
  for (let frame = 0; !race.jump && frame < 120; frame++) advanceDownhill(race, 1 / 120)
  assert(race.jump.extended)
  assert.equal(race.jump.crest.distance, crest.distance)
  assert(!canTimeDownhillJump(race))
})

test('a well-timed press at a crest lengthens the jump and boosts once', () => {
  const race = launch('perfect')
  while (!race.jump && race.track < 400) advanceDownhill(race, 1 / 120)
  assert(canTimeDownhillJump(race))
  const takeoff = race.track
  for (let frame = 0; frame < 16; frame++) advanceDownhill(race, 1 / 120)
  const natural = structuredClone(race)
  const late = structuredClone(race)
  downhillJumpAction(race)
  assert(race.jump.extended && !canTimeDownhillJump(race))
  assert(race.speed > natural.speed)
  const boostEnd = race.jumpBoostUntil
  downhillJumpAction(race)
  assert.equal(race.jumpBoostUntil, boostEnd)
  for (let frame = 0; frame < 25; frame++) advanceDownhill(late, 1 / 120)
  downhillJumpAction(late)
  assert.equal(late.jump.extended, false)
  for (const attempt of [race, natural]) {
    for (let frame = 0; attempt.jump && frame < 240; frame++) advanceDownhill(attempt, 1 / 120)
    assert.equal(attempt.jump, null)
  }
  assert(race.track - takeoff > (natural.track - takeoff) * 1.3)
})

test('a short correction keeps more speed than steering continuously', () => {
  const race = launch('perfect')
  while (race.track < 63) advanceDownhill(race, 1 / 120, 0)
  const straight = structuredClone(race), shortTurn = structuredClone(race), longTurn = structuredClone(race)
  for (let frame = 0; frame < 60; frame++) {
    advanceDownhill(straight, 1 / 120, 0)
    advanceDownhill(shortTurn, 1 / 120, frame < 24 ? 1 : 0)
    advanceDownhill(longTurn, 1 / 120, 1)
  }
  assert(straight.speed > shortTurn.speed)
  assert(shortTurn.speed > longTurn.speed)
  assert(longTurn.speed > straight.speed * .94)
  assert(longTurn.gateIndex === 0 && longTurn.x < 6)
})

test('the last jump comes after the final gate and lands before the timer stops', () => {
  const crest = DOWNHILL_CRESTS.at(-1)
  const gate = DOWNHILL_GATES.at(-1)
  assert(gate.distance < crest.distance)
  function finishWithJump(timed) {
    const race = launch('perfect')
    race.track = gate.distance - 1
    race.x = gate.x
    race.gateIndex = DOWNHILL_GATES.length - 1
    race.crestIndex = DOWNHILL_CRESTS.length - 1
    race.speed = 44
    for (let frame = 0; race.phase !== 'finished' && frame < 600; frame++) {
      if (timed && canTimeDownhillJump(race)) downhillJumpAction(race)
      advanceDownhill(race, 1 / 120)
    }
    assert.equal(race.phase, 'finished')
    assert.equal(race.jump, null)
    assert.equal(race.result.gates, 1)
    return race.result.finalJumpDistance
  }
  const normal = finishWithJump(false)
  const timed = finishWithJump(true)
  assert(normal >= 65)
  assert(timed > normal + 15)
})
