import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { heartDuration, heartLoadSources } from '../shared/training-heart-display.js'
import { trainingHeartState } from '../shared/training-heart-state.js'

test('sleep presentation uses hours and minutes while retaining missing data', () => {
  assert.equal(heartDuration(465), '7 h 45 min')
  assert.equal(heartDuration(480), '8 h')
  assert.equal(heartDuration(null), 'Saknas')
  assert.equal(heartDuration(0), '0 h')
})
test('unused estimated time is distinct from missing source values', () => {
  const current = heartLoadSources({ reported: 6, estimated: 0, reportedValue: 3195, estimatedValue: null })
  assert.match(current, /Ingen uppskattad tid användes/)
  assert.doesNotMatch(current, /Saknas/)
  const previous = heartLoadSources({ reported: 2, estimated: 2, reportedValue: 1435, estimatedValue: 1670 })
  assert.match(previous, /belastningspoäng från uppskattad tid/)
  assert.match(heartLoadSources({ reported: 1, reportedValue: null, estimated: 0 }), /Saknas/)
})
test('Izza-like displayed inputs retain follow-up state without claiming reduced load', () => {
  const metric = (value, days) => ({ value, days })
  const state = trainingHeartState({ body: metric(3.5, 3), feeling: metric(4.1, 3), speed: metric(3.5, 2), earlierSpeed: metric(3.8, 2),
    load: { ratio: 1.029, estimated: 0, previous: { estimated: 2 } },
    nights: [{ minutes: 465, quality: 3 }, { minutes: 465, quality: 3 }, { minutes: 465, quality: 5 }], warnings: ['Lite känningar · 2026-11-12'] })
  assert.equal(state.state, 'watch')
  assert.equal(state.checks.find(check => check.key === 'load').ok, false)
  assert.doesNotMatch(state.checks.find(check => check.key === 'load').label, /Minskad/)
  assert.match(state.checks.find(check => check.key === 'load').detail, /102,9/)
  assert.match(state.checks.find(check => check.key === 'sleep').detail, /7 h 45 min/)
})
test('heart explanation shows periods and the swimmer trend no longer claims overall decline', () => {
  const heart = readFileSync(new URL('../src/training-energy-details.jsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(heart, /heart.periods.feelingStart/)
  assert.match(heart, /Dessa värden tänder inte dygnseffekten/)
  assert.match(heart, /heartLoadSources\(heart.load\)/)
  assert.doesNotMatch(app, /Träningsläget har sjunkit/)
  assert.match(app, /Lägre rapporterad kropp- och dagskänsla/)
})
