import test from 'node:test'
import assert from 'node:assert/strict'
import { guardBalanceTouches } from '../src/balance-touch.js'

function control() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type, handler, options) { listeners.set(type, { handler, options }) },
    removeEventListener(type, handler, options) {
      const listener = listeners.get(type)
      assert.equal(listener.handler, handler)
      assert.equal(listener.options, options)
      listeners.delete(type)
    },
  }
}

test('blocks native long/repeated-touch gestures only on the two playing controls', () => {
  const canvas = control(), hold = control(), pause = control(), fullscreen = control()
  const root = { querySelectorAll(selector) {
    assert.equal(selector, 'canvas, .balance-hold')
    return [canvas, hold]
  } }
  const cleanup = guardBalanceTouches(root)
  for (const target of [canvas, hold]) {
    assert.equal(target.listeners.get('touchstart').options.passive, false)
    assert.equal(target.listeners.has('pointerdown'), false)
    assert.equal(target.listeners.has('pointerup'), false)
    for (const type of ['touchstart', 'contextmenu', 'selectstart']) {
      const event = new Event(type, { cancelable: true })
      target.listeners.get(type).handler(event)
      assert.equal(event.defaultPrevented, true)
      const uncancelable = new Event(type)
      target.listeners.get(type).handler(uncancelable)
      assert.equal(uncancelable.defaultPrevented, false)
    }
  }
  assert.equal(pause.listeners.size, 0)
  assert.equal(fullscreen.listeners.size, 0)
  cleanup()
  assert.equal(canvas.listeners.size, 0)
  assert.equal(hold.listeners.size, 0)
})

test('can clean up when the playing area is absent', () => {
  guardBalanceTouches(null)()
})
