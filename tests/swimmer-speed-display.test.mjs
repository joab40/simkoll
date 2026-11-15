import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { swimmerSpeedSignal, refreshSwimmerSpeedSignal, freshLiveAnswer } from '../shared/form-live.js'

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const css = source('swimmer-speed.css')

test('all lightning levels share a fixed footprint; repeated highs pulse subtly without moving layout', () => {
  assert.match(css, /\.swimmer-speed svg \{ width: 28px; height: 32px; \}/)
  assert.match(css, /width: 62px; min-height: 60px; flex: 0 0 62px/)
  assert.match(css, /speed-pulse-max, \.speed-pulse-high\) svg \{ animation:/)
  assert.match(css, /speed-pulse-max \{ --speed-duration: 1\.5s/)
  assert.match(css, /--speed-duration: 3s/)
  assert.match(css, /transform: scale\(1\.12\)/)
  assert.doesNotMatch(css, /@keyframes[^}]+(?:width|height):/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(source('swimmer-speed.jsx'), /signal\.pulse !== 'none'/)
  assert.match(source('swimmer-speed.jsx'), /signal\.refreshAt/)
  assert.match(source('swimmer-speed.jsx'), /signal\.ageLabel/)
})

test('five self-reported speed levels and unknown each have their own color', () => {
  const colors = { max: '#cf9d0d', high: '#287ead', medium: '#277f78', low: '#857399', quiet: '#596c7d', unknown: '#899a97' }
  for (const [level, color] of Object.entries(colors)) assert.match(css, new RegExp(`speed-${level} \\{ --speed-color: ${color}`))
  for (const [value, level] of [[5, 'max'], [4, 'high'], [3, 'medium'], [2, 'low'], [1, 'quiet']]) {
    const signal = swimmerSpeedSignal([{ id: 'one', date: '2026-11-14', createdAt: '2026-11-14T18:00:00Z', type: 'after', activityType: 'swim', speedFeeling: value }], '2026-11-14T20:00:00Z')
    assert.equal(signal.level, level)
    assert.equal(signal.value, value)
  }
  assert.equal(swimmerSpeedSignal([], '2026-11-14T20:00:00Z').level, 'unknown')
})

const now = '2026-11-15T18:00:00Z'
const answer = (date, value, patch = {}) => ({ id: `${date}-${value}`, date, createdAt: `${date}T19:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', speedFeeling: value, ...patch })
const bolt = rows => swimmerSpeedSignal(rows, now)

test('pulse requires two different recent swimming days, never repeated answers on the same day', () => {
  assert.equal(bolt([answer('2026-11-14', 5)]).pulse, 'none')
  assert.equal(bolt([answer('2026-11-14', 4)]).pulse, 'none')
  assert.equal(bolt([answer('2026-11-14', 5), answer('2026-11-14', 5, { id: 'am', trainingSlot: 'morning_swim', createdAt: '2026-11-14T08:00:00Z' })]).pulse, 'none')
  assert.equal(bolt([answer('2026-11-14', 5), answer('2026-11-13', 5)]).pulse, 'max')
  assert.equal(bolt([answer('2026-11-14', 4), answer('2026-11-13', 4)]).pulse, 'high')
  const mixed = bolt([answer('2026-11-14', 5), answer('2026-11-13', 4)])
  assert.equal(mixed.level, 'max'); assert.equal(mixed.pulse, 'high')
  assert.match(mixed.label, /Självskattad, inte uppmätt fart eller bekräftad toppform/)
})

test('new lower answer breaks the pattern; non-swimming and missing days do not invent evidence', () => {
  for (const value of [1, 2, 3]) {
    const signal = bolt([answer('2026-11-15', value, { createdAt: '2026-11-15T08:00:00Z' }), answer('2026-11-14', 5), answer('2026-11-13', 5)])
    assert.equal(signal.value, value); assert.equal(signal.pulse, 'none')
  }
  for (const patch of [{ activityType: 'strength' }, { competition: true }, { plannedCompletion: 'no' }, { type: 'before' }]) {
    assert.equal(bolt([answer('2026-11-14', 5), answer('2026-11-13', 5, patch)]).pulse, 'none')
  }
  assert.equal(bolt([answer('2026-11-14', 5), answer('2026-11-10', 5)]).pulse, 'none')
  // The latest valid answer on an activity day wins, not the highest value.
  const corrections = [answer('2026-11-14', 3), answer('2026-11-14', 5, { id: 'early', createdAt: '2026-11-14T08:00:00Z' }), answer('2026-11-13', 5)]
  assert.equal(bolt(corrections).pulse, 'none')
})

test('value is retained for 72 hours, stops pulsing after 48, then remains visible but neutral', () => {
  const rows = [answer('2026-11-14', 5), answer('2026-11-13', 5)]
  const active = swimmerSpeedSignal(rows, '2026-11-15T18:00:00Z')
  assert.equal(active.pulse, 'max'); assert.equal(active.ageLabel, 'igår')
  const aging = refreshSwimmerSpeedSignal(active, '2026-11-16T19:00:00Z')
  assert.equal(aging.fresh, true); assert.equal(aging.recent, false)
  assert.equal(aging.level, 'max'); assert.equal(aging.pulse, 'none'); assert.equal(aging.ageLabel, '2 dagar sedan')
  const expired = refreshSwimmerSpeedSignal(active, '2026-11-17T19:00:00Z')
  assert.equal(expired.fresh, false); assert.equal(expired.level, 'unknown'); assert.equal(expired.value, 5)
  assert.match(expired.label, /äldre svar/)
  assert.ok(active.refreshAt > Date.parse('2026-11-15T18:00:00Z'))
  assert.ok(active.refreshAt <= Date.parse('2026-11-15T23:00:00Z'), 'activity age captions update at Stockholm midnight')
})

test('late registration does not revive old activity; Formkollen keeps its independent stricter freshness', () => {
  const retro = bolt([answer('2026-11-10', 5, { createdAt: '2026-11-15T08:00:00Z' })])
  assert.equal(retro.fresh, false); assert.equal(retro.pulse, 'none')
  const sample = { date: '2026-11-13', submittedAt: '2026-11-13T19:00:00Z', value: 5 }
  assert.equal(refreshSwimmerSpeedSignal({ samples: [sample] }, now).fresh, true)
  assert.equal(freshLiveAnswer(sample, now), false)
  // The client recalculates from dated samples, not a cached server boolean.
  assert.equal(refreshSwimmerSpeedSignal({ samples: [sample], fresh: false }, now).level, 'max')
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
