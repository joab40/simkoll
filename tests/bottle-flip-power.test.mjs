import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { paintBottlePower } from '../src/bottle-flip-power.js'
import { createBottleGame, startBottle, pressBottle, advanceBottle, releaseBottle } from '../src/bottle-flip-engine.js'

test('visual fill updates every simulation frame, not just on the slower text HUD', () => {
  const game = startBottle(createBottleGame()), fill = { style: {} }, frames = []
  pressBottle(game)
  for (let i = 0; i < 30; i++) { advanceBottle(game, 1 / 60); paintBottlePower(fill, game.charge); frames.push(fill.style.transform) }
  assert.equal(new Set(frames).size, 30)
  assert.ok(Math.abs(game.charge - .5 / 1.2) < 1e-9)
  assert.equal(fill.style.transform, 'scaleX(0.416667)')
  releaseBottle(game); paintBottlePower(fill, game.charge)
  assert.equal(fill.style.transform, 'scaleX(0)')
})

test('fill is bounded, handles an unmounted element, and skips unchanged DOM writes', () => {
  let writes = 0, current
  const fill = { style: { get transform() { return current }, set transform(value) { writes++; current = value } } }
  paintBottlePower(null, .5)
  for (const value of [-1, NaN, Infinity, undefined]) paintBottlePower(fill, value)
  assert.equal(current, 'scaleX(0)'); assert.equal(writes, 1)
  paintBottlePower(fill, 2); assert.equal(current, 'scaleX(1)')
  paintBottlePower(fill, 1); assert.equal(writes, 2)
})

test('game paints power alongside the canvas with a transform, without a delayed width transition', () => {
  const source = readFileSync(new URL('../src/bottle-flip-game.jsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/bottle-flip-game.css', import.meta.url), 'utf8')
  assert.match(source, /drawBottle\(canvas.current, model.current, reducedMotion.current\); paintBottlePower\(powerFill.current, model.current.charge\)/)
  assert.match(source, /<span ref=\{powerFill\} \/>/)
  assert.doesNotMatch(source, /style=\{\{ width: `\$\{view.charge/)
  assert.match(css, /transform: scaleX\(0\); transform-origin: left center/)
  assert.match(source, /1 försök · högst 60 sekunder/)
  assert.doesNotMatch(source, /3 flaskor|Tre missar|högst 2 minuter|av 3 flaskor/)
})
