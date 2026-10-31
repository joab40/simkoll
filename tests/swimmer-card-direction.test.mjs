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

const screenshotNights = () => [420, 525, 360, 660, 420, 330, 405].map((minutes, index) => ({ activity_date: `2026-10-${25 + index}`, minutes, quality: index ? 5 : 3 }))

test('seven nights in the first week yield a clearly preliminary short-term direction', () => {
  // The screenshot has no RPE on two days, increasing quality but shorter sleep.
  const result = sleepDirection(screenshotNights().reverse(), '2026-10-31')
  assert.equal(result.state, 'up')
  assert.equal(result.preliminary, true)
  assert.equal(result.comparison, 'short-term')
  assert.match(result.label, /Preliminär korttidstrend/)
  assert.match(result.detail, /2026-10-29–2026-10-31/)
  assert.match(result.detail, /2026-10-25–2026-10-27/)
  assert.match(result.detail, /Mittennatten ingår inte/)
  assert.equal(result.durationChangeMinutes, -50)
  assert.match(result.durationDetail, /50 minuter kortare/)
  const changedMiddle = screenshotNights().map((row, index) => index === 3 ? { ...row, quality: 1, minutes: 0 } : row)
  assert.equal(sleepDirection(changedMiddle, '2026-10-31').state, result.state)
  assert.equal(sleepDirection(changedMiddle, '2026-10-31').durationChangeMinutes, result.durationChangeMinutes)
})

test('RPE, daily feeling and duration never set the sleep-quality arrow', () => {
  const rows = screenshotNights()
  for (const transform of [
    (row) => row,
    (row, index) => ({ ...row, rpe: index % 2 ? 0 : 10, feeling: 1 }),
    (row, index) => ({ ...row, rpe: null, feeling: 5, minutes: index < 3 ? 840 : 0 }),
    (row, index) => ({ ...row, rpe: 1, feeling: null, minutes: index < 3 ? 0 : 840 }),
  ]) assert.equal(sleepDirection(rows.map(transform), '2026-10-31').state, 'up')
  const steady = sleepDirection(rows.map((row) => ({ ...row, quality: 5 })), '2026-10-31')
  assert.equal(steady.state, 'steady')
  assert.match(steady.label, /liknande sömnkänsla/)
  assert.equal(sleepDirection(rows.map((row, index) => ({ ...row, quality: index < 3 ? 5 : 3 })), '2026-10-31').state, 'down')
})

test('weekly comparisons take precedence, including six total nights and threshold boundaries', () => {
  const previous = ['18', '19', '20', '21', '22'].map((day) => ({ activity_date: `2026-10-${day}`, quality: 3, minutes: 420 }))
  const current = ['25', '26', '27', '30', '31'].map((day, index) => ({ activity_date: `2026-10-${day}`, quality: index ? 3 : 5, minutes: 450 }))
  const result = sleepDirection([...previous, ...current], '2026-10-31')
  assert.equal(result.comparison, 'weekly')
  assert.equal(result.preliminary, false)
  assert.equal(result.state, 'up', 'exactly 0.4 is not lost to floating-point rounding')
  assert.equal(result.durationChangeMinutes, 30)
  assert.match(result.durationDetail, /30 minuter längre/)
  assert.doesNotMatch(result.label, /Preliminär/)
  assert.equal(sleepDirection([...previous.slice(0, 3), ...current.slice(0, 3)], '2026-10-31').comparison, 'weekly')
})

test('short-term direction still requires seven valid distinct recent nights', () => {
  const rows = screenshotNights()
  const unavailable = (records, today = '2026-10-31') => assert.equal(sleepDirection(records, today).state, 'insufficient')
  unavailable([...rows.slice(0, 6), rows[0]])
  unavailable([...rows.slice(0, 6), { ...rows[6], skipped: true }])
  unavailable([...rows.slice(0, 6), { ...rows[6], minutes: null }])
  unavailable([...rows.slice(0, 6), { ...rows[6], minutes: 841 }])
  unavailable([...rows.slice(0, 6), { ...rows[6], quality: 2 }])
  unavailable([...rows.slice(0, 6), { ...rows[6], activity_date: '2026-11-01' }])
  unavailable(rows, '2026-11-07') // Old-only data is not a current short-term trend.
  unavailable([null, ...rows.slice(0, 6)])
  const withGap = rows.map((row, index) => index === 0 ? { ...row, activity_date: '2026-10-20' } : row)
  assert.equal(sleepDirection(withGap, '2026-10-31').comparison, 'short-term', 'reported nights need not be consecutive; missing dates are not zeroes')
  assert.equal(sleepDirection([], '2026-10-31').label, 'Samlar underlag för sömntrend')
})
