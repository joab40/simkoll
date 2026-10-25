import test from 'node:test'
import assert from 'node:assert/strict'
import { drawBalance } from '../src/balance-art.js'
import { BALANCE_IMPACT_TIME, createBalanceGame } from '../src/balance-engine.js'

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
