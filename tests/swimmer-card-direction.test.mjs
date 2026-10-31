import test from 'node:test'
import assert from 'node:assert/strict'
import { programActivityDirection, sleepDirection, swimTimesDirection } from '../shared/swimmer-card-direction.js'

test('program continuity uses registered days of the same swimmer and type without duplicate credit', () => {
  const row = (date, extra = {}) => ({ profileId: 'one', type: 'strength', date, ...extra })
  const sessions = [row('2026-10-31'), row('2026-10-31'), row('2026-10-28'), row('2026-10-20'), row('2026-10-29', { profileId: 'other' }), row('2026-10-21', { type: 'dryland' }), row('2026-11-01')]
  const direction = programActivityDirection(sessions, 'one', 'strength', '2026-10-31')
  assert.equal(direction.state, 'up')
  assert.match(direction.label, /2 registrerade pass.*1 föregående/)
  assert.equal(programActivityDirection(sessions, 'one', 'dryland', '2026-10-31').state, 'insufficient')
  assert.equal(programActivityDirection(null, 'one', 'strength', '2026-10-31').state, 'insufficient')
  assert.equal(programActivityDirection([row('2026-10-20'), row('2026-10-21'), row('2026-10-31')], 'one', 'strength', '2026-10-31').state, 'down')
})

test('sleep compares separate nights, needs both periods and follows quality rather than longer duration', () => {
  const nights = (dates, quality, minutes) => dates.map((activity_date) => ({ activity_date, quality, minutes }))
  const previous = nights(['2026-10-18', '2026-10-20', '2026-10-22'], 3, 420)
  const current = nights(['2026-10-25', '2026-10-27', '2026-10-31'], 1, 600)
  assert.equal(sleepDirection([...previous, ...current], '2026-10-31').state, 'down')
  assert.equal(sleepDirection([...previous, ...current.map((row) => ({ ...row, quality: 3 }))], '2026-10-31').state, 'steady')
  assert.equal(sleepDirection([...previous, ...current.slice(0, 2), { ...current[0] }], '2026-10-31').state, 'insufficient')
  assert.equal(sleepDirection([...previous, ...current.map((row) => ({ ...row, skipped: true }))], '2026-10-31').state, 'insufficient')
  assert.equal(sleepDirection([...previous, ...current.map((row) => ({ ...row, minutes: null }))], '2026-10-31').state, 'insufficient')
  assert.equal(sleepDirection([...previous, ...current.map((row) => ({ ...row, quality: 5 }))], '2026-10-31').state, 'up')
})

test('times compare only matching conditions on distinct dates and handle mixed directions', () => {
  const row = (result_date, result_time, extra = {}) => ({ result_date, result_time, distance_meters: 100, stroke: 'freestyle', pool_length: 25, kind: 'test', start_type: 'push', exercise: 'full', equipment: [], timing_method: 'hand', conditions: '', ...extra })
  const old = row('2026-10-10', 6000), recent = row('2026-10-31', 5800)
  assert.equal(swimTimesDirection([old, recent]).state, 'up')
  assert.equal(swimTimesDirection([old, { ...recent, pool_length: 50 }]).state, 'insufficient')
  assert.equal(swimTimesDirection([old, { ...recent, equipment: ['fins'] }]).state, 'insufficient')
  assert.equal(swimTimesDirection([old, { ...recent, kind: 'training' }]).state, 'insufficient')
  assert.equal(swimTimesDirection([old, { ...recent, result_date: old.result_date }]).state, 'insufficient')
  assert.equal(swimTimesDirection([old, { ...recent, result_time: 5990 }]).state, 'steady')
  assert.equal(swimTimesDirection([old, recent, row('2026-10-10', 7000, { stroke: 'backstroke' }), row('2026-10-30', 7200, { stroke: 'backstroke' })]).state, 'mixed')
  // Compare best per date, never interpret repeated attempts on one day as progress.
  assert.equal(swimTimesDirection([old, recent, { ...recent, result_time: 6200 }]).state, 'up')
  assert.equal(swimTimesDirection([old, recent], true).state, 'insufficient')
})
