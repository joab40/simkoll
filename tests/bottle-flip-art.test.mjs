import test from 'node:test'
import assert from 'node:assert/strict'
import { drawBottle } from '../src/bottle-flip-art.js'
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
