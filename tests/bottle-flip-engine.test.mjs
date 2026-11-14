import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceBottle, BOTTLE_CHARGE_SECONDS, BOTTLE_ROUND_SECONDS, BOTTLE_MAX_LANDINGS, BOTTLE_MAX_SCORE, bottleLandingTime, createBottleGame, startBottle, pressBottle, releaseBottle, cancelBottleCharge, pauseBottle, resumeBottle, validBottleScore } from '../src/bottle-flip-engine.js'

const advance = (game, seconds, step = 1 / 120) => { let left = seconds; while (left > 1e-9) { const dt = Math.min(left, step); advanceBottle(game, dt); left -= dt } }
function throwTo(game, offset = 1, fraction = .5, step = 1 / 120) {
  const p = game.platforms[game.current + offset], x = p.x + p.width * fraction
  const power = ((x - game.x) / bottleLandingTime(game.y, p.y) - 120) / 510
  assert.ok(power >= 0 && power <= 1)
  assert.equal(pressBottle(game), true)
  advance(game, power * BOTTLE_CHARGE_SECONDS, step); assert.equal(releaseBottle(game), true)
  while (game.phase === 'flying' && game.status === 'playing') advanceBottle(game, step)
}

test('ready game is inert, starts with three bottles and has a deterministic fair course', () => {
  const game = createBottleGame(), original = structuredClone(game)
  advanceBottle(game, 1); assert.deepEqual(game, original)
  assert.equal(pressBottle(game), false); assert.equal(releaseBottle(game), false)
  assert.deepEqual(createBottleGame(), original)
  assert.equal(game.lives, 3); assert.equal(game.platforms.length, 6)
})

test('hold/release lands on the next platform, upright, and rewards perfect streaks', () => {
  const game = startBottle(createBottleGame())
  for (const score of [15, 35, 60, 90, 120]) { throwTo(game); assert.equal(game.score, score); assert.equal(game.angle, 0); assert.equal(game.phase, 'resting') }
  assert.equal(game.lives, 3); assert.equal(game.bestStreak, 5)
  throwTo(game, 1, .2)
  assert.equal(game.score, 130); assert.equal(game.streak, 0)
})

test('longer holds travel farther and skipping one platform adds a bonus without double-counting landings', () => {
  const game = startBottle(createBottleGame())
  throwTo(game, 2)
  assert.equal(game.current, 2); assert.equal(game.landings, 1)
  assert.equal(game.score, 25); assert.match(game.feedback, /genväg/)
})

test('three failed throws finish the round and respawn at the last successful platform', () => {
  const game = startBottle(createBottleGame()); throwTo(game)
  for (let lives = 2; lives >= 0; lives--) {
    pressBottle(game); releaseBottle(game)
    while (game.phase === 'flying') advanceBottle(game, 1 / 60)
    assert.equal(game.lives, lives); assert.equal(game.score, 15); assert.equal(game.streak, 0)
    if (lives) { advance(game, .7); assert.equal(game.current, 1); assert.equal(game.phase, 'resting'); assert.equal(game.y, game.platforms[1].y) }
  }
  assert.equal(game.status, 'over')
  const final = structuredClone(game); advanceBottle(game, 100); assert.deepEqual(game, final)
})

test('pause cancels a held charge, freezes flight and time, then resumes the same flight', () => {
  const game = startBottle(createBottleGame()); pressBottle(game); advance(game, .3); pauseBottle(game)
  assert.equal(game.phase, 'resting'); assert.equal(game.charge, 0)
  assert.equal(releaseBottle(game), false)
  const paused = structuredClone(game); advanceBottle(game, .25); assert.deepEqual(game, paused)
  resumeBottle(game); pressBottle(game); advance(game, .3); releaseBottle(game); advance(game, .2); pauseBottle(game)
  const x = game.x, elapsed = game.elapsed; advanceBottle(game, .25); assert.equal(game.x, x); assert.equal(game.elapsed, elapsed)
  resumeBottle(game); advanceBottle(game, .1); assert.ok(game.x > x)
})

test('cancelled input never throws and full charge saturates rather than wrapping', () => {
  const game = startBottle(createBottleGame()); pressBottle(game); advance(game, 2)
  assert.equal(game.charge, 1); assert.equal(pressBottle(game), false)
  cancelBottleCharge(game); assert.equal(game.phase, 'resting'); assert.equal(releaseBottle(game), false)
  assert.equal(game.lives, 3)
})

test('exact collision crossings give equivalent results at 30, 60 and 120 FPS', () => {
  const results = [30, 60, 120].map(fps => { const game = startBottle(createBottleGame()); for (let i = 0; i < 10; i++) throwTo(game, 1, .5, 1 / fps); return { score: game.score, current: game.current, lives: game.lives } })
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2])
})

test('round time and landing count are bounded; generated late platforms stay playable', () => {
  const game = startBottle(createBottleGame())
  while (game.status === 'playing') throwTo(game)
  assert.equal(game.status, 'complete'); assert.ok(game.elapsed <= BOTTLE_ROUND_SECONDS)
  assert.ok(game.landings <= BOTTLE_MAX_LANDINGS); assert.ok(validBottleScore(game.score))
  assert.ok(game.platforms.length <= BOTTLE_MAX_LANDINGS * 2 + 6)
  for (const p of game.platforms) { assert.ok(p.width >= 77); assert.ok(p.y >= 290 && p.y <= 395) }
  const idle = startBottle(createBottleGame()); advance(idle, BOTTLE_ROUND_SECONDS + 1)
  assert.equal(idle.status, 'complete'); assert.equal(idle.elapsed, BOTTLE_ROUND_SECONDS); assert.equal(idle.score, 0)
})

test('score validation rejects empty, fractional, nonfinite and over-limit values', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, '15', null, BOTTLE_MAX_SCORE + 1]) assert.equal(validBottleScore(value), false)
  for (const value of [10, 15, 30, BOTTLE_MAX_SCORE]) assert.equal(validBottleScore(value), true)
})
