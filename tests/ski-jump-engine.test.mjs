import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceSkiJump, createSkiJump, skiAction, skiTiming, validSkiJumpScore,
  SKI_APPROACH_TIME, SKI_K_POINT, SKI_WIND, skiPushAngle,
} from '../src/ski-jump-engine.js'

function fly(wind, takeoff = .95, crosswind = 0) {
  const game = createSkiJump(wind, crosswind)
  skiAction(game)
  advanceSkiJump(game, SKI_APPROACH_TIME * takeoff)
  skiAction(game)
  return game
}

const step = .004
const correct = game => Math.abs(game.bank) > .11 ? -Math.sign(game.bank) : 0

function land(game, timing, steer = () => 0) {
  while (game.phase === 'air') {
    if (!game.landing && skiTiming(game).position >= timing) skiAction(game)
    advanceSkiJump(game, step, steer(game))
  }
  advanceSkiJump(game, 2)
  return game.result
}

test('an accurately timed jump can reach the K point and earn a perfect telemark', () => {
  const game = fly(0)
  assert.equal(game.phase, 'air')
  assert.equal(skiTiming(game).position, 0)
  const result = land(game, .72)
  assert.equal(game.phase, 'finished')
  assert.equal(result.style, 100)
  assert(result.distance > SKI_K_POINT)
  assert(validSkiJumpScore(result.score))
})

test('wind affects flight length and weak takeoff gives a shorter jump', () => {
  const scores = SKI_WIND.map(wind => land(fly(wind), .72))
  for (let i = 1; i < scores.length; i++) assert(scores[i].distance > scores[i - 1].distance)
  assert(land(fly(0, .82), .72).score < scores[2].score)
  for (const wind of SKI_WIND) {
    for (let p = .72; p < 1; p += .025) assert(validSkiJumpScore(land(fly(wind, p), .72).score))
  }
})

test('too early, missed takeoff and mistimed landings give feedback and no rankable score', () => {
  const early = fly(0, .5)
  assert.equal(early.phase, 'finished')
  assert.match(early.result.reason, /För tidigt upphopp/)
  const missed = createSkiJump()
  skiAction(missed)
  advanceSkiJump(missed, SKI_APPROACH_TIME + .1)
  assert.equal(missed.phase, 'finished')
  assert.match(missed.result.reason, /missade hoppkanten/)
  for (const result of [early.result, missed.result, land(fly(0), .2), land(fly(0), .98)]) assert.equal(result.score, 0)
})


test('short corrections counter gusts and improve the flight and landing window', () => {
  for (const wind of [-3, 3]) {
    const ignored = fly(0, .95, wind)
    const corrected = fly(0, .95, wind)
    for (let tick = 0; tick < 200; tick++) {
      advanceSkiJump(ignored, .01)
      advanceSkiJump(corrected, .01, correct(corrected))
    }
    assert.equal(Math.sign(ignored.bank), Math.sign(wind))
    assert(Math.abs(corrected.bank) < Math.abs(ignored.bank))
    assert(ignored.speed < corrected.speed)
    const [early, late] = skiTiming(ignored).zone
    const [correctedEarly, correctedLate] = skiTiming(corrected).zone
    assert(late - early < correctedLate - correctedEarly)

    const plain = land(ignored, .72)
    const controlled = land(corrected, .72, correct)
    assert(controlled.distance > plain.distance)
    assert(controlled.style > plain.style)
    assert(controlled.score > plain.score)
    assert(validSkiJumpScore(controlled.score))
  }
})

test('holding a direction through the entire flight overcorrects and costs length', () => {
  const oversteered = land(fly(0, .95, 2), .72, () => -1)
  const timed = land(fly(0, .95, 2), .72, correct)
  assert(timed.distance > oversteered.distance)
  assert(timed.style > oversteered.style)
})


test('a well-timed press with the right hold produces a better takeoff and clear landing feedback', () => {
  function jump(hold) {
    const game = createSkiJump()
    skiAction(game)
    advanceSkiJump(game, SKI_APPROACH_TIME * .95)
    skiAction(game, hold)
    return land(game, .72)
  }
  const balanced = jump(.425)
  assert.equal(skiPushAngle(.425), 18)
  assert.equal(balanced.angle, 18)
  assert.equal(balanced.takeoff, 100)
  assert.equal(balanced.landingLabel, 'Telemark')
  assert(balanced.distance > jump(0).distance)
  assert(balanced.distance > jump(2).distance)
  assert.equal(land(fly(0), .1).landingLabel, 'För tidig landning')
  assert.equal(land(fly(0), .98).landingLabel, 'För sen landning')
})
