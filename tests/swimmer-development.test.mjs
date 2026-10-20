import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSwimmerDevelopment } from '../shared/swimmer-development.js'

const range = { start: '2026-10-01', end: '2026-10-14' }
const time = (id, date, result, extra = {}) => ({ id, result_date: date, result_time: result, distance_meters: 100, pool_length: 25, stroke: 'freestyle', kind: 'test', start_type: 'push', exercise: 'full', equipment: [], timing_method: 'hand', ...extra })
const entry = (date, type, extra = {}) => ({ date, type, state: 'completed', ...extra })

test('whole-picture summary counts only completed work in the selected period', () => {
  const summary = summarizeSwimmerDevelopment({ range, entries: [entry('2026-10-01', 'swim'), entry('2026-10-01', 'strength', { strengthLogs: [{ weights: { squat: '20 kg' } }] }), entry('2026-10-02', 'swim', { state: 'planned' }), entry('2026-10-03', 'competition'), entry('2026-09-30', 'swim'), entry('2026-10-04', 'reflection', { reflection: { whatWorked: 'Vändningarna' } }), entry('2026-10-05', 'rest')], goals: [{ title: 'Aktivt', status: 'active' }, { title: 'Klart', status: 'complete' }], raceResults: [{ date: '2026-09-30' }, { date: '2026-10-03' }] })
  assert.equal(summary.swimSessions, 1); assert.equal(summary.strengthSessions, 1)
  assert.equal(summary.strengthLogCount, 1); assert.equal(summary.trainingDays, 1)
  assert.equal(summary.reflectionCount, 1); assert.equal(summary.activeGoals.length, 1)
  assert.equal(summary.results.length, 1)
})

test('own time evidence compares only identical conditions and distinct dates, not official PBs', () => {
  const times = [time('old', '2026-09-30', 5000), time('a', '2026-10-01', 7000), time('b', '2026-10-01', 6900), time('c', '2026-10-10', 6800), time('d', '2026-10-10', 6850), time('fins', '2026-10-11', 5000, { equipment: ['fins'] }), time('training', '2026-10-12', 6000, { kind: 'training' })]
  const summary = summarizeSwimmerDevelopment({ range, times })
  assert.equal(summary.testCount, 5); assert.equal(summary.ownTimes.length, 6)
  assert.equal(summary.comparisons.length, 1)
  assert.equal(summary.comparisons[0].first, 6900)
  assert.equal(summary.comparisons[0].latest, 6800)
  assert.equal(summary.comparisons[0].difference, -100)
  assert.equal(summary.results.length, 0)
})

test('weekly journey keeps missing RPE and partial weeks explicit and separates races from tests', () => {
  const days = ['2026-10-01', '2026-10-02'].map((date) => ({ date, sessions: 1, rpe: null, speedFeeling: null }))
  const summary = summarizeSwimmerDevelopment({ range, days, entries: [entry('2026-10-01', 'swim'), entry('2026-10-02', 'strength')], times: [time('test', '2026-10-01', 6000)], raceResults: [{ date: '2026-10-02', event: '100 frisim', pool: '25 m', time: '59,00', resultTime: 5900 }] })
  assert.equal(summary.weeks.length, 1)
  const week = summary.weeks[0]
  assert.equal(week.calendarDays, 2); assert.equal(week.rpe, null)
  assert.equal(week.swimSessions, 1); assert.equal(week.strengthSessions, 1)
  assert.equal(week.ownTimes.length, 1); assert.equal(week.results.length, 1)
})
