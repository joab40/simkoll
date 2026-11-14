import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WINTER_SNOWFLAKES } from '../src/winter-scene.js'

const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
test('winter snowfall is deterministic, bounded and lightweight', () => {
  assert.equal(WINTER_SNOWFLAKES.length, 16)
  assert.ok(Object.isFrozen(WINTER_SNOWFLAKES))
  assert.equal(new Set(WINTER_SNOWFLAKES.map(flake => flake.left)).size, 16)
  for (const flake of WINTER_SNOWFLAKES) {
    assert.ok(Object.isFrozen(flake))
    assert.ok(Object.values(flake).every(Number.isFinite))
    assert.ok(flake.left >= 0 && flake.left <= 100 && flake.top >= 0 && flake.top <= 100)
    assert.ok(flake.size >= 9 && flake.size <= 18)
    assert.ok(flake.duration >= 13 && flake.duration <= 21)
    assert.ok(flake.delay <= 0)
  }
})
test('winter stays on the existing snow setting and respects both theme and effect switches', () => {
  const main = read('main.jsx'), css = read('winter-theme.css')
  assert.match(main, /const winterActive = swimmerThemesEnabled && swimmerTheme === 'snow'/)
  assert.match(main, /winterActive && <WinterHeroDecor animate=\{swimmerEffects\}/)
  assert.match(main, /winter=\{winterActive\}/)
  assert.match(main, /winter && <WinterTrainingBuddy/)
  assert.match(main, /swimmerTheme === 'halloween'/)
  assert.doesNotMatch(css, /theme-halloween|theme-christmas|\.coach-shell/)
  assert.doesNotMatch(read('styles.css'), /\.home\.theme-snow \.mood-hero/)
})
test('winter animations stop offscreen, in hidden tabs and for reduced-motion users; disabled effects stay static', () => {
  const view = read('winter-theme.jsx'), css = read('winter-theme.css')
  assert.match(view, /if \(!animate \|\| typeof IntersectionObserver === 'undefined'\) return undefined/)
  assert.match(view, /visible && !document.hidden/)
  assert.match(view, /observer.disconnect\(\); document.removeEventListener\('visibilitychange', update\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation: none; will-change: auto; top: var\(--snow-top\)/)
  assert.match(css, /winter-snowfall > span:nth-child\(n\+11\) \{ display: none/)
  assert.doesNotMatch(view, /requestAnimationFrame|setInterval|setTimeout|fetch\(|apiRequest|localStorage/)
})
test('decorations are hidden from assistive technology, cannot capture input and reserve their own landscape space', () => {
  const view = read('winter-theme.jsx'), css = read('winter-theme.css')
  assert.match(view, /aria-hidden="true"/)
  assert.match(view, /focusable="false"/)
  assert.match(css, /pointer-events: none; user-select: none/)
  assert.match(css, /padding-bottom: 116px/)
  assert.match(css, /\.winter-landscape \{ position: absolute; inset: auto 0 0; height: 95px/)
  assert.match(view, /className="winter-training-buddy" aria-hidden="true"/)
  assert.match(css, /\.start-card::after \{ content: ''/)
})
test('winter hero text retains readable contrast even against the lightest background color', () => {
  const luminance = hex => {
    const rgb = hex.match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return rgb.reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
  }
  for (const text of ['ffffff', 'deeff4', 'fff3c6']) for (const background of ['153a55', '1d526b', '214e65', '246478']) {
    assert.ok((luminance(text) + .05) / (luminance(background) + .05) >= 4.5)
  }
})
