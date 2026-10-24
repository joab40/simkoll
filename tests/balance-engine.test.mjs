import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceBalance, BALANCE_DURATION, BALANCE_MAX_SCORE, createBalanceGame, validBalanceScore } from '../src/balance-engine.js'

function run(lifting, fps = 120, duration = 130) {
  const game = createBalanceGame()
  for (let frame = 0; frame < duration * fps && game.status === 'playing'; frame++) advanceBalance(game, 1 / fps, lifting(game, frame / fps))
  return game
}

test('start is forgiving, but holding forever or never lifting ends the round', () => {
  for (const held of [false, true]) {
    const warmup = run(() => held, 120, 2.8)
    assert.equal(warmup.status, 'playing')
    const result = run(() => held)
    assert.equal(result.status, 'over')
    assert.equal(result.reason, held ? 'tip' : 'front')
    assert.ok(result.elapsed > 3 && result.elapsed < 6)
    assert.ok(validBalanceScore(result.score))
  }
})

test('same input produces exactly the same result at 30, 60 and 144 Hz', () => {
  const results = [30, 60, 144].map((fps) => run((game, seconds) => Math.floor((seconds + 1e-9) * 2) % 2 === 0, fps))
  for (const result of results.slice(1)) {
    assert.equal(result.score, results[0].score)
    assert.equal(result.reason, results[0].reason)
    assert.ok(Math.abs(result.elapsed - results[0].elapsed) < 1e-8)
    assert.ok(Math.abs(result.angle - results[0].angle) < 1e-8)
  }
})

test('deliberate balance earns bonus, bumps and increasing speed; round has a hard finish', () => {
  const result = run((game) => game.angle < 46)
  assert.equal(result.reason, 'finish')
  assert.ok(Math.abs(result.elapsed - BALANCE_DURATION) < 1e-6)
  assert.ok(result.bumps > 20)
  assert.equal(result.speed, 22)
  assert.ok(result.bonus > result.distance * .9)
  assert.equal(result.score, Math.floor(result.distance + result.bonus))
  assert.ok(result.score < BALANCE_MAX_SCORE)
  assert.ok(validBalanceScore(result.score))
})

test('lag cannot fast-forward the round; paused/non-finite/negative time adds nothing', () => {
  const game = createBalanceGame(), initial = structuredClone(game)
  for (const seconds of [0, -1, NaN, Infinity]) advanceBalance(game, seconds, true)
  assert.deepEqual(game, initial)
  advanceBalance(game, 30, true)
  assert.ok(game.elapsed <= .101)
  assert.ok(game.distance < 1)
})

test('a finished result is immutable and invalid scores cannot be accepted', () => {
  const result = run(() => true), finished = structuredClone(result)
  advanceBalance(result, 1, false)
  assert.deepEqual(result, finished)
  for (const value of [0, -1, 1.5, BALANCE_MAX_SCORE + 1, NaN, Infinity, '100']) assert.equal(validBalanceScore(value), false)
})
