import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceBalance, BALANCE_DURATION, BALANCE_IMPACT_TIME, BALANCE_LAUNCH_TIME, BALANCE_MAX_SCORE, BALANCE_SCENE_SCALE, BALANCE_START_SPEED, BALANCE_TOP_SPEED, balanceBump, balanceBumpsBetween, balanceFrontContact, balanceRoadAt, balanceWheelGeometry, createBalanceGame, validBalanceScore } from '../src/balance-engine.js'

function run(lifting, fps = 120, duration = 130) {
  const game = createBalanceGame()
  for (let frame = 0; frame < duration * fps && game.status === 'playing'; frame++) advanceBalance(game, 1 / fps, lifting(game, frame / fps))
  return game
}

test('starts on both wheels; riding without lifting cannot earn points or run forever', () => {
  assert.equal(createBalanceGame().angle, 0)
  const launch = run(() => false, 120, 3)
  assert.equal(launch.status, 'playing')
  assert.equal(launch.angle, 0)
  assert.equal(launch.wheelieStarted, false)
  assert.equal(launch.score, 0)
  assert.equal(launch.wheelieDistance, 0)
  const result = run(() => false)
  assert.equal(result.reason, 'launch')
  assert.ok(Math.abs(result.elapsed - BALANCE_LAUNCH_TIME) < 1e-6)
  assert.equal(result.score, 0)
})

test('holding lifts from the road; holding forever tips and lowering after lift ends the run', () => {
  const lifted = run(() => true, 120, 1)
  assert.equal(lifted.wheelieStarted, true)
  assert.ok(lifted.angle > 8)
  assert.ok(lifted.wheelieDistance > 0 && lifted.wheelieDistance < lifted.distance)
  const tipped = run(() => true)
  assert.equal(tipped.reason, 'tip')
  assert.ok(tipped.elapsed < 3)
  assert.ok(validBalanceScore(tipped.score))
  while (lifted.status === 'playing') advanceBalance(lifted, 1 / 120, false)
  assert.equal(lifted.reason, 'front')
})

test('releasing brings the front wheel down promptly without changing the lift control', () => {
  const initial = { ...createBalanceGame(), elapsed: 5, angle: 50, wheelieStarted: true }
  const released = structuredClone(initial), lifting = structuredClone(initial)
  for (let i = 0; i < 30; i++) {
    advanceBalance(released, 1 / 120, false)
    advanceBalance(lifting, 1 / 120, true)
  }
  assert.ok(released.velocity < -45)
  assert.ok(released.angle < initial.angle)
  assert.ok(lifting.angle > initial.angle)
  while (released.status === 'playing') advanceBalance(released, 1 / 120, false)
  assert.equal(released.reason, 'front')
  assert.ok(released.elapsed - initial.elapsed < .8)
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
  const result = run((game) => game.angle < 48)
  assert.equal(result.reason, 'finish')
  assert.ok(Math.abs(result.elapsed - BALANCE_DURATION) < 1e-6)
  assert.ok(result.bumps > 70)
  assert.equal(result.speed, BALANCE_TOP_SPEED)
  // Clearing terrain can temporarily require leaving the bonus zone.
  assert.ok(result.bonus > result.wheelieDistance * .85)
  assert.ok(result.potholeHits > 20)
  assert.equal(result.score, Math.floor(result.wheelieDistance + result.bonus))
  assert.ok(result.score < BALANCE_MAX_SCORE)
  assert.ok(validBalanceScore(result.score))
})

test('lag cannot fast-forward the round; paused/non-finite/negative time adds nothing', () => {
  const game = createBalanceGame(), initial = structuredClone(game)
  for (const seconds of [0, -1, NaN, Infinity]) advanceBalance(game, seconds, true)
  assert.deepEqual(game, initial)
  advanceBalance(game, 30, true)
  assert.ok(game.elapsed <= .101)
  assert.ok(game.distance < 3.5)
})

test('higher starting speed reaches the new top speed in 25 seconds within the score limit', () => {
  assert.equal(createBalanceGame().speed, 34)
  const result = run((game) => game.angle < 46, 120, 2)
  assert.ok(result.distance > 68)
  assert.ok(result.speed > BALANCE_START_SPEED)
  assert.ok(BALANCE_TOP_SPEED * BALANCE_DURATION * 2 <= BALANCE_MAX_SCORE)
  assert.ok(Math.abs(run((game) => game.angle < 48, 120, 25).speed - BALANCE_TOP_SPEED) < 1e-8)
})

test('broad rolling hills appear less often than large bumps and have clear surrounding gaps', () => {
  const features = Array.from({ length: 72 }, (_, index) => balanceBump(index))
  const hills = features.filter((feature) => feature.rolling)
  assert.deepEqual(hills.map((hill) => hill.index), [17, 41, 65])
  for (const hill of hills) {
    assert.equal(hill.large, true)
    assert.ok(hill.width >= 44 && hill.height >= 9)
    assert.equal(balanceRoadAt(hill.center).height, hill.height)
    const previous = features[hill.index - 1], next = features[hill.index + 1]
    assert.ok(previous.center + previous.width / 2 < hill.center - hill.width / 2)
    assert.ok(hill.center + hill.width / 2 < next.center - next.width / 2)
    assert.ok(balanceBumpsBetween(hill.center - hill.width / 2, hill.center - hill.width / 2).some((feature) => feature.index === hill.index))
  }
})

test('front tyre contact with a bump ends the run, while a higher lift clears it', () => {
  const bump = balanceBump(0), angle = 8
  const distance = bump.center - 132 * Math.cos(angle * Math.PI / 180) / BALANCE_SCENE_SCALE
  const low = { ...createBalanceGame(), distance, elapsed: 5, angle, wheelieStarted: true }
  const high = { ...low, angle: 16 }
  assert.equal(balanceFrontContact(low), true)
  assert.equal(balanceFrontContact(high), false)
  advanceBalance(low, 1 / 120, true)
  assert.equal(low.status, 'over')
  assert.equal(low.reason, 'terrain')
  advanceBalance(high, 1 / 120, true)
  assert.equal(high.status, 'playing')
  const finished = structuredClone(low)
  advanceBalance(low, 1, false)
  assert.deepEqual(low, finished)
})

test('the side of the tyre can catch an approaching hillside even with clearance below its centre', () => {
  const hill = balanceBump(5)
  const game = { ...createBalanceGame(), distance: hill.center - 20, angle: 5, wheelieStarted: true }
  const wheel = balanceWheelGeometry(game)
  const roadBelowCentre = balanceRoadAt(game.distance + wheel.frontX / BALANCE_SCENE_SCALE).height * BALANCE_SCENE_SCALE
  assert.ok(wheel.frontHeight - wheel.radius - roadBelowCentre > 1)
  assert.equal(balanceFrontContact(game), true)
})

test('markstart is exempt from tyre collision, and clear air never gives a false terrain hit', () => {
  const start = createBalanceGame()
  assert.equal(balanceFrontContact(start), false)
  const flat = { ...start, wheelieStarted: true, angle: 30 }
  assert.equal(balanceFrontContact(flat), false)
  for (const index of [0, 5, 17]) {
    const hill = balanceBump(index)
    const road = balanceRoadAt(hill.center)
    const onCrest = { ...flat, angle: 48, distance: hill.center, roadHeight: road.height, roadSlope: road.slope }
    assert.equal(balanceFrontContact(onCrest), false)
  }
})

test('large hills occur occasionally, are clearly larger, and stay discoverable at both edges', () => {
  const course = Array.from({ length: 36 }, (_, index) => balanceBump(index))
  const large = course.filter((bump) => bump.large)
  assert.deepEqual(large.map((bump) => bump.index), [5, 17, 29])
  const regularHeight = Math.max(...course.filter((bump) => !bump.large).map((bump) => bump.height))
  for (const hill of large) {
    assert.ok(hill.height > regularHeight * 1.5)
    assert.ok(hill.width > 18)
    const left = hill.center - hill.width / 2, right = hill.center + hill.width / 2
    assert.ok(balanceBumpsBetween(left, left).some((feature) => feature.index === hill.index))
    assert.ok(balanceBumpsBetween(right, right).some((feature) => feature.index === hill.index))
    assert.equal(balanceRoadAt(hill.center).height, hill.height)
  }
  assert.ok(large[1].center - large[0].center > 600)
})

test('limited-precision balancing can no longer coast through the full course', () => {
  const game = createBalanceGame()
  let held = true
  for (let tick = 0; tick < 120 * BALANCE_DURATION && game.status === 'playing'; tick++) {
    // A reasonably responsive but simple 200 ms correction pattern.
    if (tick % 24 === 0) held = game.angle < 46
    advanceBalance(game, 1 / 120, held)
  }
  assert.notEqual(game.reason, 'finish')
  assert.ok(game.elapsed > 10 && game.elapsed < 60)
  assert.ok(validBalanceScore(game.score))
})

test('hills and potholes vary in height and width without overlapping or discontinuities', () => {
  const hills = Array.from({ length: 12 }, (_, i) => balanceBump(i))
  assert.equal(new Set(hills.slice(0, 6).map((bump) => bump.height)).size, 6)
  assert.equal(new Set(hills.slice(0, 6).map((bump) => bump.width)).size, 6)
  for (const [index, bump] of hills.entries()) {
    assert.ok(Math.abs(bump.height) * 12 > 20)
    assert.equal(balanceRoadAt(bump.center).height, bump.height)
    assert.ok(Math.abs(balanceRoadAt(bump.center).slope) < 1e-10)
    assert.equal(balanceRoadAt(bump.center - bump.width / 2).height, 0)
    assert.equal(balanceRoadAt(bump.center + bump.width / 2).height, 0)
    assert.ok(balanceRoadAt(bump.center - bump.width / 4).slope * bump.height > 0)
    assert.ok(balanceRoadAt(bump.center + bump.width / 4).slope * bump.height < 0)
    assert.deepEqual(balanceBumpsBetween(bump.center, bump.center), [bump])
    if (index) assert.ok(hills[index - 1].center + hills[index - 1].width / 2 < bump.center - bump.width / 2)
  }
  assert.equal(hills[6].center - hills[0].center, 340)
  assert.equal(hills[6].height, hills[0].height)
  assert.equal(hills.slice(0, 6).filter((feature) => feature.kind === 'pothole').length, 2)
  const launch = run(() => false, 120, BALANCE_LAUNCH_TIME)
  assert.ok(launch.distance < hills[0].center - hills[0].width / 2)
})

test('riding over a hill raises the rear wheel and changes balance, not just its drawing', () => {
  const bump = balanceBump(0)
  const hill = { ...createBalanceGame(), elapsed: 5, angle: 46, wheelieStarted: true, distance: bump.center - bump.width / 2 }
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
  // Sample controls six times a second, aligned at 30/60/144 Hz. Start at
  // a hill so this tests terrain and pothole hits, not only the flat intro.
  const simulate = (fps) => {
    const game = { ...createBalanceGame(), elapsed: 5, angle: 46, wheelieStarted: true, distance: 174 }
    let held = true
    for (let frame = 0; frame < fps * 4 && game.status === 'playing'; frame++) {
      if (frame % (fps / 6) === 0) held = game.angle < 46
      advanceBalance(game, 1 / fps, held)
    }
    return game
  }
  const expected = simulate(30)
  assert.ok(expected.bumps >= 2)
  assert.equal(expected.potholeHits, 1)
  for (const fps of [60, 144]) {
    const actual = simulate(fps)
    for (const field of ['angle', 'velocity', 'distance', 'roadHeight', 'roadSlope']) assert.ok(Math.abs(actual[field] - expected[field]) < 1e-8, field)
    assert.equal(actual.score, expected.score)
    assert.equal(actual.potholeHits, expected.potholeHits)
  }
})

test('pothole entry causes one extra impact and a short-lived shake, not continuous shaking', () => {
  const hole = balanceBump(1)
  const game = { ...createBalanceGame(), elapsed: 10, angle: 46, wheelieStarted: true, distance: hole.center - hole.width / 2 - .1 }
  const flat = { ...game, distance: 0 }
  advanceBalance(game, 1 / 120, true); advanceBalance(flat, 1 / 120, true)
  assert.equal(game.potholeHits, 1)
  assert.equal(game.impactTimer, BALANCE_IMPACT_TIME)
  assert.ok(game.impactStrength >= 6 && game.impactStrength <= 10)
  assert.ok(Math.abs(game.velocity - flat.velocity) > 15)
  assert.ok(game.roadHeight < 0)
  for (let i = 0; i < 60; i++) advanceBalance(game, 1 / 120, game.angle < 46)
  assert.equal(game.potholeHits, 1)
  assert.equal(game.impactTimer, 0)
  const paused = structuredClone(game)
  advanceBalance(game, 0, true)
  assert.deepEqual(game, paused)
})

test('later controls are more demanding at the same angle and input', () => {
  const early = { ...createBalanceGame(), elapsed: 5, angle: 46, wheelieStarted: true }
  const late = { ...early, elapsed: 90 }
  advanceBalance(early, 1 / 120, true); advanceBalance(late, 1 / 120, true)
  assert.ok(late.velocity > early.velocity * 1.4)
  assert.ok(late.speed > early.speed)
})

test('a finished result is immutable and invalid scores cannot be accepted', () => {
  const result = run(() => true), finished = structuredClone(result)
  advanceBalance(result, 1, false)
  assert.deepEqual(result, finished)
  for (const value of [0, -1, 1.5, BALANCE_MAX_SCORE + 1, NaN, Infinity, '100']) assert.equal(validBalanceScore(value), false)
})
