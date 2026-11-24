import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceSkiJump, createSkiJump, skiAction, skiTiming, validSkiJumpScore,
  SKI_APPROACH_TIME, SKI_K_POINT, SKI_LANDING_LEAD, SKI_WIND,
} from '../src/ski-jump-engine.js'

function fly(wind, takeoff = .975) {
  const game = createSkiJump(wind)
  skiAction(game)
  advanceSkiJump(game, SKI_APPROACH_TIME * takeoff)
  skiAction(game)
  return game
}

function land(game, timing) {
  advanceSkiJump(game, game.launch.touchdown - SKI_LANDING_LEAD * (1 - timing))
  skiAction(game)
  advanceSkiJump(game, SKI_LANDING_LEAD)
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
    for (let p = .72; p < 1; p += .002) assert(validSkiJumpScore(land(fly(wind, p), .72).score))
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
