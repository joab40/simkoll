import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { swimmerSpeedSignal } from '../shared/form-live.js'

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const css = source('swimmer-speed.css')

test('all lightning levels share the same compact size and only 4/5 and 5/5 pulse without scaling', () => {
  assert.match(css, /\.swimmer-speed svg \{ width: 28px; height: 32px; \}/)
  assert.doesNotMatch(css, /scale\(|--speed-scale/)
  assert.match(css, /speed-max, \.speed-high\) svg \{ animation:/)
  assert.doesNotMatch(css, /speed-high, \.speed-medium/)
  assert.match(css, /speed-max \{[^}]*--speed-duration: 1\.4s/)
  assert.match(css, /--speed-duration: 2\.8s/)
  assert.match(css, /0%, 100% \{ opacity: \.72; \} 50% \{ opacity: 1; \}/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('five self-reported speed levels and unknown each have their own color; data rules remain unchanged', () => {
  const colors = { max: '#cf9d0d', high: '#287ead', medium: '#277f78', low: '#857399', quiet: '#596c7d', unknown: '#899a97' }
  for (const [level, color] of Object.entries(colors)) assert.match(css, new RegExp(`speed-${level} \\{ --speed-color: ${color}`))
  for (const [value, level] of [[5, 'max'], [4, 'high'], [3, 'medium'], [2, 'low'], [1, 'quiet']]) {
    const signal = swimmerSpeedSignal([{ id: 'one', date: '2026-11-14', createdAt: '2026-11-14T18:00:00Z', type: 'after', activityType: 'swim', speedFeeling: value }], '2026-11-14T20:00:00Z')
    assert.equal(signal.level, level)
    assert.equal(signal.value, value)
  }
  assert.equal(swimmerSpeedSignal([], '2026-11-14T20:00:00Z').level, 'unknown')
})

test('setup remains an independent native control by the username, with a small neutral circle and generous hit area', () => {
  const header = source('swimmer-card-header.jsx'), styles = source('swimmer-card-header.css')
  assert.match(header, /onClick=\{onToggle\} \/>/, 'main header button is closed before the setup control')
  assert.match(header, /<span className="swimmer-username-line"><small>@\{profile\.username\}<\/small>\{!expanded && <SwimmerSetupIndicator/)
  assert.match(styles, /width: 44px; height: 44px/)
  assert.match(styles, /inset: 12px; border: 1px solid #8a9b97/)
  assert.match(styles, /background: transparent; color: #687b78/)
  assert.match(styles, /:focus-visible/)
  const control = source('swimmer-setup.jsx')
  assert.match(control, /if \(!setup.show\) return null/)
  assert.match(control, /aria-label=\{setup.title\} aria-expanded=\{open\} aria-controls=\{controls\}/)
})

test('compact card uses an ordered status grid, a single-line dated illness chip and consistent identity sizing', () => {
  const header = source('swimmer-card-header.css'), focus = source('swimmer-card-focus.css')
  assert.match(header, /grid-template-columns: auto auto minmax\(0, 1fr\) auto/)
  assert.match(header, /@container \(max-width: 430px\)/)
  assert.match(header, /width: 44px; height: 44px; font-size: 25px/)
  assert.match(focus, /swimmer-card-focus-illness \{ display: inline-flex/)
  assert.match(focus, /white-space: nowrap/)
  assert.match(source('swimmer-card-focus.jsx'), /<time dateTime=\{currentIllness.activity_date\} title=\{currentIllness.activity_date\}/)
})
