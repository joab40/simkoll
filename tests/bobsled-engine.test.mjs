import test from 'node:test'
import assert from 'node:assert/strict'
import { BOB_FLAT, BOB_LANE, BOB_LENGTH, BOB_RIM, BOB_SCORE_BASE, advanceBob, bobAction, bobIceProfile, bobIdealLine, bobTrack, clamp, createBobRace, validBobScore } from '../src/bobsled-engine.js'

function simulateRace({ push = false, timed = false, steering = () => 0, tick = 1 / 120 } = {}) {
  const race = createBobRace()
  bobAction(race)
  while (race.phase === 'push') {
    advanceBob(race, tick)
    if ((push && race.pushTime < 2.9) || (timed && race.pushTime >= 3.24)) bobAction(race)
  }
  for (let i = 0; i < 61 / tick && race.phase === 'racing'; i++) advanceBob(race, tick, steering(race))
  return race
}
const followLine = race => {
  const force = bobTrack(race.distance).force
  return clamp((bobIdealLine(force) - race.lateral) * 2 + force * .63 - race.drift * .31, -1, 1)
}

test('rapid presses and a timed dive produce a faster start; the dive fallback always releases the sled', () => {
  const timed = simulateRace({ push: true, timed: true })
  const missed = simulateRace({ push: true })
  assert.equal(timed.launch, 'Perfekt start')
  assert.equal(missed.launch, 'Sent inhopp')
  assert.equal(timed.pushes, 12)
  assert.equal(missed.phase, 'finished')
  assert.ok(timed.result < missed.result)
})

test('the full icy run takes 20–30 seconds with good steering; wall hits cost real time', () => {
  const good = simulateRace({ push: true, timed: true, steering: followLine })
  const straight = simulateRace({ push: true, timed: true })
  const hardTurn = simulateRace({ push: true, timed: true, steering: () => -1 })
  assert.equal(good.distance, BOB_LENGTH)
  assert.equal(good.hits, 0)
  assert.ok(good.cleanTime > 6)
  assert.ok(good.boosts > 0 && good.boosts <= 7)
  assert.equal(straight.boosts, 0)
  assert.equal(hardTurn.boosts, 0)
  assert.ok(good.maxSpeed > straight.maxSpeed)
  assert.ok(good.result >= 20000 && good.result <= 30000)
  assert.ok(straight.hits > good.hits && hardTurn.hits > straight.hits)
  assert.ok(good.result < straight.result && straight.result < hardTurn.result)
  assert.ok(validBobScore(BOB_SCORE_BASE - good.result))
  assert.ok(!validBobScore(BOB_SCORE_BASE - 5000))
  const at30 = simulateRace({ push: true, timed: true, steering: followLine, tick: 1 / 30 })
  assert.ok(Math.abs(good.result - at30.result) < 150)
})

test('the racing line climbs the rounded bank on the outside of either turn', () => {
  for (const force of [-1, 1]) {
    const outside = -Math.sign(force)
    const start = bobIceProfile(outside * BOB_FLAT, force)
    const line = bobIceProfile(bobIdealLine(force), force)
    const contact = bobIceProfile(outside * BOB_LANE, force)
    const rim = bobIceProfile(outside * BOB_RIM, force)
    assert.equal(start.y, 0)
    assert.equal(start.slope, 0)
    assert.ok(line.y > .5 && line.y < contact.y && contact.y < rim.y)
    assert.ok(Math.abs(line.slope) < Math.abs(rim.slope))
    assert.ok(bobIceProfile(-outside * BOB_RIM, force).y < line.y)
    assert.ok(contact.x * outside < BOB_RIM)
  }
})

test('steering with short button presses can earn an exit boost', () => {
  let nextTap = 0, steer = 0
  const race = simulateRace({ push: true, timed: true, steering: race => {
    if (race.elapsed >= nextTap) {
      const correction = followLine(race)
      steer = Math.abs(correction) > .43 ? Math.sign(correction) : 0
      nextTap = race.elapsed + .13
    }
    return steer
  } })
  assert.equal(race.hits, 0)
  assert.ok(race.boosts > 0)
})
