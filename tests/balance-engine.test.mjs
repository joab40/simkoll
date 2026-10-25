import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceBalance, BALANCE_DURATION, BALANCE_MAX_SCORE, BALANCE_START_SPEED, BALANCE_TOP_SPEED, balanceBump, balanceBumpsBetween, balanceRoadAt, createBalanceGame, validBalanceScore } from '../src/balance-engine.js'

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
  assert.ok(result.bumps > 70)
  assert.equal(result.speed, BALANCE_TOP_SPEED)
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
  assert.ok(game.distance < 1.7)
})

test('starts at twice the original speed and accelerates within the score limit', () => {
  assert.equal(createBalanceGame().speed, 16)
  const result = run((game) => game.angle < 46, 120, 2)
  assert.ok(result.distance > 32)
  assert.ok(result.speed > BALANCE_START_SPEED)
  assert.ok(BALANCE_TOP_SPEED * BALANCE_DURATION * 2 <= BALANCE_MAX_SCORE)
})

test('hills vary in height and width; the same course repeats without discontinuities', () => {
  const hills = Array.from({ length: 12 }, (_, i) => balanceBump(i))
  assert.equal(new Set(hills.slice(0, 6).map((bump) => bump.height)).size, 6)
  assert.equal(new Set(hills.slice(0, 6).map((bump) => bump.width)).size, 6)
  for (const [index, bump] of hills.entries()) {
    assert.ok(bump.height * 12 > 20) // old decorative bumps were only 8 px high
    assert.equal(balanceRoadAt(bump.center).height, bump.height)
    assert.ok(Math.abs(balanceRoadAt(bump.center).slope) < 1e-10)
    assert.equal(balanceRoadAt(bump.center - bump.width / 2).height, 0)
    assert.equal(balanceRoadAt(bump.center + bump.width / 2).height, 0)
    assert.ok(balanceRoadAt(bump.center - bump.width / 4).slope > 0)
    assert.ok(balanceRoadAt(bump.center + bump.width / 4).slope < 0)
    assert.deepEqual(balanceBumpsBetween(bump.center, bump.center), [bump])
    if (index) assert.ok(hills[index - 1].center + hills[index - 1].width / 2 < bump.center - bump.width / 2)
  }
  assert.equal(hills[6].center - hills[0].center, 270)
  assert.equal(hills[6].height, hills[0].height)
})

test('riding over a hill raises the rear wheel and changes balance, not just its drawing', () => {
  const bump = balanceBump(0)
  const hill = { ...createBalanceGame(), elapsed: 5, angle: 46, distance: bump.center - bump.width / 2 }
  const flat = { ...hill, distance: 0 }
  let peak = 0, maxAngleDifference = 0
  for (let i = 0; i < 90; i++) {
    const lifting = i % 2 === 0
    advanceBalance(hill, 1 / 120, lifting); advanceBalance(flat, 1 / 120, lifting)
    peak = Math.max(peak, hill.roadHeight)
    maxAngleDifference = Math.max(maxAngleDifference, Math.abs(hill.angle - flat.angle))
  }
  assert.ok(peak > bump.height * .99)
  assert.ok(maxAngleDifference > 4)
  assert.equal(hill.roadHeight, 0)
  assert.equal(hill.roadSlope, 0)
  assert.equal(flat.roadHeight, 0)
  assert.equal(hill.bumps, 1)
})

test('terrain physics and scores remain frame-rate independent across multiple hills', () => {
  // Each half-second boundary aligns at 30/60/144 Hz. Start at a hill so
  // this tests the terrain, not only the flat introductory section.
  const simulate = (fps) => {
    const game = { ...createBalanceGame(), elapsed: 5, angle: 46, distance: 64 }
    for (let frame = 0; frame < fps * 4 && game.status === 'playing'; frame++) advanceBalance(game, 1 / fps, Math.floor(frame / (fps / 2)) % 2 === 0)
    return game
  }
  const expected = simulate(30)
  assert.ok(expected.bumps >= 2)
  for (const fps of [60, 144]) {
    const actual = simulate(fps)
    for (const field of ['angle', 'velocity', 'distance', 'roadHeight', 'roadSlope']) assert.ok(Math.abs(actual[field] - expected[field]) < 1e-8, field)
    assert.equal(actual.score, expected.score)
  }
})

test('a finished result is immutable and invalid scores cannot be accepted', () => {
  const result = run(() => true), finished = structuredClone(result)
  advanceBalance(result, 1, false)
  assert.deepEqual(result, finished)
  for (const value of [0, -1, 1.5, BALANCE_MAX_SCORE + 1, NaN, Infinity, '100']) assert.equal(validBalanceScore(value), false)
})
