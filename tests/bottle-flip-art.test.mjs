import test from 'node:test'
import assert from 'node:assert/strict'
import { drawBottle, drawBottleStartingBlock, drawBottleBackstrokeFlags } from '../src/bottle-flip-art.js'
import { createBottleGame, startBottle, pressBottle, advanceBottle, releaseBottle } from '../src/bottle-flip-engine.js'

function surface(width, height) {
  const calls = [], gradient = { addColorStop() {} }
  const ctx = new Proxy({}, { get(object, key) { if (key in object) return object[key]; return (...args) => { assert.ok(args.filter(value => typeof value === 'number').every(Number.isFinite), `${key} must receive finite geometry`); calls.push([key, ...args]); if (key === 'createLinearGradient') return gradient } }, set(object, key, value) { object[key] = value; return true } })
  return { canvas: { width: 0, height: 0, getBoundingClientRect: () => ({ width, height }), getContext: () => ctx }, calls }
}

test('original art renders ready, charged, airborne and landed states at mobile and desktop sizes', () => {
  const original = globalThis.window; globalThis.window = { devicePixelRatio: 3 }
  try {
    for (const [width, height] of [[350, 318], [960, 540]]) {
      const { canvas, calls } = surface(width, height), game = startBottle(createBottleGame())
      drawBottle(canvas, game); pressBottle(game); advanceBottle(game, .25); drawBottle(canvas, game); releaseBottle(game); advanceBottle(game, .1); drawBottle(canvas, game)
      assert.equal(canvas.width, width * 2); assert.equal(canvas.height, height * 2)
      assert.ok(calls.some(call => call[0] === 'fillText' && call[1] === 'NÄSTA'))
      assert.ok(calls.some(call => call[0] === 'rotate'))
    }
  } finally { globalThis.window = original }
})

test('reduced motion removes optional perfect particles without changing the game or hiding the bottle', () => {
  const original = globalThis.window; globalThis.window = { devicePixelRatio: 1 }
  try {
    const game = createBottleGame(); game.feedback = 'Mitt i prick!'; game.feedbackFor = 1
    const normal = surface(960, 540), reduced = surface(960, 540), before = structuredClone(game)
    drawBottle(normal.canvas, game, false); drawBottle(reduced.canvas, game, true)
    assert.equal(normal.calls.filter(call => call[0] === 'fillRect').length - reduced.calls.filter(call => call[0] === 'fillRect').length, 9)
    assert.deepEqual(game, before)
    assert.equal(reduced.calls.filter(call => call[0] === 'rotate').length, 1)
  } finally { globalThis.window = original }
})

test('bottle is visually 16 percent slimmer without changing height, charge deformation or game state', () => {
  const original = globalThis.window; globalThis.window = { devicePixelRatio: 1 }
  try {
    for (const [phase, charge] of [['ready', 0], ['charging', .8], ['airborne', 0]]) {
      const game = createBottleGame(); game.phase = phase; game.charge = charge
      const before = structuredClone(game), { canvas, calls } = surface(960, 540)
      drawBottle(canvas, game)
      const squash = phase === 'charging' ? 1 - charge * .12 : 1
      assert.deepEqual(calls.find(call => call[0] === 'scale'), ['scale', .84 / Math.sqrt(squash), squash])
      assert.deepEqual(game, before)
      assert.ok(calls.some(call => call[0] === 'ellipse' && call[1] === game.x && call[3] === 18 && call[4] === 5))
    }
  } finally { globalThis.window = original }
})

test('every old platform kind becomes the same rear-view starting block with its own continuing number', () => {
  const shapes = []
  for (let kind = 0; kind < 4; kind++) {
    const { canvas, calls } = surface(960, 540), p = { index: kind, kind, x: 100, y: 355, width: 130 }, before = structuredClone(p)
    drawBottleStartingBlock(canvas.getContext('2d'), p)
    assert.deepEqual(p, before, 'drawing must never change the landing surface')
    assert.ok(calls.some(call => call[0] === 'fillText' && call[1] === String(kind + 1)))
    assert.ok(calls.some(call => call[0] === 'roundRect' && call[1] === p.x + p.width * .35 && call[2] === p.y - 3 && call[3] === p.width * .3))
    shapes.push(calls.filter(call => call[0] !== 'fillText'))
  }
  assert.deepEqual(shapes[0], shapes[1]); assert.deepEqual(shapes[1], shapes[2]); assert.deepEqual(shapes[2], shapes[3])
  for (const [width, index] of [[77, 9], [150, 79], [80, 160]]) {
    const { canvas, calls } = surface(390, 355)
    drawBottleStartingBlock(canvas.getContext('2d'), { x: 0, y: 395, width, index })
    assert.ok(calls.some(call => call[0] === 'fillText' && call[1] === String(index + 1)))
  }
})

test('backstroke markers are closed swallow-tail flag shapes along the rope, not round hanging lights', () => {
  for (const width of [540, 960, 1450]) {
    const { canvas, calls } = surface(width, 540)
    drawBottleBackstrokeFlags(canvas.getContext('2d'), width)
    const count = Math.max(6, Math.ceil(width / 70))
    assert.equal(calls.filter(call => call[0] === 'closePath').length, count)
    assert.equal(calls.filter(call => call[0] === 'fill').length, count)
    assert.equal(calls.filter(call => call[0] === 'arc' || call[0] === 'ellipse').length, 0)
    assert.ok(calls.some(call => call[0] === 'quadraticCurveTo'))
  }
})
