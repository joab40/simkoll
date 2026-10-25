import test from 'node:test'
import assert from 'node:assert/strict'
import { drawBalance } from '../src/balance-art.js'
import { BALANCE_IMPACT_TIME, createBalanceGame } from '../src/balance-engine.js'
import { BALANCE_BIKE, balanceRiderPose } from '../src/balance-rider.js'

function drawing() {
  const operations = []
  let depth = 0
  const context = new Proxy({}, {
    get(target, name) {
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} })
      return (...args) => {
        if (name === 'save') depth++
        if (name === 'restore') depth--
        operations.push({ name, args, depth })
      }
    },
    set() { return true },
  })
  return { operations, canvas: { clientWidth: 960, getContext: () => context } }
}

test('initial scene draws a level bicycle with both wheels on the flat road', () => {
  const { canvas, operations } = drawing()
  drawBalance(canvas, createBalanceGame())
  assert.deepEqual(operations.find((op) => op.name === 'translate').args, [290, 341])
  assert.ok(Math.abs(operations.find((op) => op.name === 'rotate').args[0]) < 1e-10)
  const wheels = operations.filter((op) => op.name === 'arc' && op.args[2] === 32)
  assert.deepEqual(wheels.map((wheel) => wheel.args.slice(0, 2)), [[0, 0], [132, 0]])
})

test('pothole shake is confined to the world, with text and gauge outside the camera transform', () => {
  const game = { ...createBalanceGame(), elapsed: 10, impactTimer: BALANCE_IMPACT_TIME, impactStrength: 8 }
  const unchanged = structuredClone(game)
  const { canvas, operations } = drawing()
  drawBalance(canvas, game)
  assert.ok(operations.some((op) => op.name === 'scale' && op.args[0] === 1.03))
  const notice = operations.find((op) => op.name === 'fillText' && op.args[0].includes('GROP!'))
  assert.equal(notice.depth, 0)
  assert.ok(operations.filter((op) => op.name === 'fillText').every((op) => op.depth === 0))
  assert.deepEqual(game, unchanged)
})

test('reduced motion removes camera shake but keeps the pothole warning and game state', () => {
  const game = { ...createBalanceGame(), elapsed: 10, impactTimer: BALANCE_IMPACT_TIME, impactStrength: 8 }
  const { canvas, operations } = drawing()
  drawBalance(canvas, game, { reducedMotion: true })
  assert.ok(operations.every((op) => op.name !== 'scale'))
  assert.ok(operations.some((op) => op.name === 'fillText' && op.args[0].includes('GROP!')))
  assert.equal(game.impactTimer, BALANCE_IMPACT_TIME)
})

test('both knees bend forwards with fixed limb lengths throughout a complete pedal rotation', () => {
  const { hip, thighLength, shinLength } = BALANCE_BIKE
  for (let phase = 0; phase < Math.PI * 2; phase += .04) {
    const pose = balanceRiderPose({ distance: phase / .5, wheelieStarted: false })
    for (const leg of [pose.near, pose.far]) {
      assert.ok(Math.abs(Math.hypot(leg.knee[0] - hip[0], leg.knee[1] - hip[1]) - thighLength) < 1e-8)
      assert.ok(Math.abs(Math.hypot(leg.foot[0] - leg.knee[0], leg.foot[1] - leg.knee[1]) - shinLength) < 1e-8)
      assert.ok(leg.knee[0] > hip[0])
      const dx = leg.foot[0] - hip[0], dy = leg.foot[1] - hip[1]
      assert.ok(dx * (leg.knee[1] - hip[1]) - dy * (leg.knee[0] - hip[0]) < 0)
    }
  }
})

test('feet stay on opposite pedals, both when pedalling and balancing on the rear wheel', () => {
  const { crank, crankLength } = BALANCE_BIKE
  for (const wheelieStarted of [true, false]) for (const distance of [0, 2, 5, 9, 25]) {
    const { near, far } = balanceRiderPose({ distance, wheelieStarted })
    assert.ok(Math.abs(Math.hypot(near.foot[0] - crank[0], near.foot[1] - crank[1]) - crankLength) < 1e-8)
    assert.ok(Math.abs((near.foot[0] + far.foot[0]) / 2 - crank[0]) < 1e-8)
    assert.ok(Math.abs((near.foot[1] + far.foot[1]) / 2 - crank[1]) < 1e-8)
  }
})
