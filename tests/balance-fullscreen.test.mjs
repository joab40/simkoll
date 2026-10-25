import test from 'node:test'
import assert from 'node:assert/strict'
import { enterBalanceFullscreen, exitBalanceFullscreen } from '../src/balance-fullscreen.js'

test('uses native fullscreen when supported and exits only its own target', async () => {
  const doc = { fullscreenElement: null, async exitFullscreen() { this.fullscreenElement = null } }
  const target = { async requestFullscreen() { doc.fullscreenElement = this } }
  assert.equal(await enterBalanceFullscreen(target, doc), 'native')
  assert.equal(doc.fullscreenElement, target)
  await exitBalanceFullscreen(target, doc)
  assert.equal(doc.fullscreenElement, null)
  const other = {}
  doc.fullscreenElement = other
  await exitBalanceFullscreen(target, doc)
  assert.equal(doc.fullscreenElement, other)
})

test('unsupported, rejected and no-op requests all get a usable immersive fallback', async () => {
  for (const target of [{}, { requestFullscreen() { throw new Error('Denied') } }, { async requestFullscreen() {} }]) {
    assert.equal(await enterBalanceFullscreen(target, {}), 'immersive')
  }
  await exitBalanceFullscreen(null, { fullscreenElement: null })
})

test('supports WebKit element fullscreen and owned exit', async () => {
  const doc = { webkitFullscreenElement: null, webkitExitFullscreen() { this.webkitFullscreenElement = null } }
  const target = { webkitRequestFullscreen() { doc.webkitFullscreenElement = this } }
  assert.equal(await enterBalanceFullscreen(target, doc), 'native')
  await exitBalanceFullscreen(target, doc)
  assert.equal(doc.webkitFullscreenElement, null)
})
