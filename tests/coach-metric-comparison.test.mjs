import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachMetricComparison } from '../shared/coach-metric-comparison.js'

const profiles = [{ id: 'a', displayName: 'Anna' }, { id: 'b', displayName: 'Bo' }, { id: 'test', displayName: 'Test', isTestProfile: true }]
const after = (activityDate, extra = {}) => ({ profileId: 'a', activityDate, createdAt: `${activityDate}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', rpe: 5, activityMinutes: 60, ...extra })
const period = { start: '2026-11-09', end: '2026-11-11' }
const compare = (responses, options = {}) => buildCoachMetricComparison(profiles, responses, { ...period, ...options })
const threeEach = () => ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11'].map(day => after(day))

test('Wednesday compares Monday through Wednesday only, for all five metrics', () => {
  const responses = [...threeEach(), after('2026-11-05', { rpe: 10, activityMinutes: 300 }), after('2026-11-12'),
    after('2026-11-10', { profileId: 'test' }), after('2026-11-10', { profileId: 'outside' }),
    { profileId: 'b', activityDate: '2026-11-03', type: 'sick' }, { profileId: 'b', activityDate: '2026-11-05', type: 'sick' }]
  const sleepRecords = threeEach().map(row => ({ profile_id: 'a', activity_date: row.activityDate, minutes: 480, quality: 5 }))
  sleepRecords.push({ profile_id: 'a', activity_date: '2026-11-05', minutes: 120, quality: 1 })
  const result = compare(responses, { sleepRecords })
  assert.equal(result.previousStart, '2026-11-02'); assert.equal(result.previousEnd, '2026-11-04')
  assert.equal(result.current.completedPasses, 3); assert.equal(result.previous.completedPasses, 3)
  assert.equal(result.metrics.passes.delta, 0); assert.equal(result.metrics.rpe.delta, 0)
  assert.equal(result.metrics.load.delta, 0); assert.equal(result.current.load, 900)
  assert.equal(result.metrics.illness.delta, -1)
  assert.equal(result.metrics.sleep.delta, 0); assert.equal(result.previous.sleep.nights, 3)
})

test('completed weeks compare complete weeks, including across year and daylight-saving boundaries', () => {
  for (const [start, end, previousStart, previousEnd] of [
    ['2026-11-02', '2026-11-08', '2026-10-26', '2026-11-01'],
    ['2026-12-28', '2026-12-30', '2026-12-21', '2026-12-23'],
    ['2026-10-26', '2026-10-28', '2026-10-19', '2026-10-21'],
    ['2026-03-30', '2026-04-01', '2026-03-23', '2026-03-25'],
  ]) {
    const result = compare([], { start, end })
    assert.equal(result.previousStart, previousStart); assert.equal(result.previousEnd, previousEnd)
  }
})

test('deltas use counts, RPE points and minutes, with latest reports deduplicated', () => {
  const responses = threeEach().map(row => row.activityDate >= period.start ? { ...row, rpe: 6 } : row)
  responses.push(after('2026-11-10', { rpe: 1, createdAt: '2026-11-10T17:00:00Z' }))
  const sleepRecords = threeEach().map(row => ({ profile_id: 'a', activity_date: row.activityDate, minutes: row.activityDate >= period.start ? 498 : 480, quality: 5 }))
  const result = compare(responses, { sleepRecords })
  assert.equal(result.metrics.rpe.delta, 1); assert.equal(result.metrics.load.delta, 180)
  assert.equal(result.metrics.sleep.delta, 18)
  assert.equal(result.current.rpeAnswers, 3)
})

test('low or uneven load coverage suppresses the arrow rather than showing an artificial drop', () => {
  const low = threeEach().map(row => row.activityDate >= period.start ? { ...row, activityMinutes: null } : row)
  assert.equal(compare(low).metrics.load.delta, null)
  assert.match(compare(low).metrics.load.reason, /Otillräckligt/)
  const unequal = [...threeEach(), after('2026-11-10', { trainingSlot: 'morning_swim', activityMinutes: null }), after('2026-11-11', { trainingSlot: 'morning_swim' })]
  const result = compare(unequal)
  assert.equal(result.metrics.load.currentCoverage, .8)
  assert.equal(result.metrics.load.previousCoverage, 1)
  assert.equal(result.metrics.load.delta, null)
  const zero = compare(threeEach().map(row => ({ ...row, rpe: row.activityDate < period.start ? 0 : 5 })))
  assert.equal(zero.metrics.load.delta, 900, 'zero baseline uses an absolute delta, never an infinite percent')
})

test('small samples, missing sources and future periods produce no false trends', () => {
  const few = compare([after('2026-11-10')])
  assert.equal(few.metrics.rpe.delta, null); assert.equal(few.metrics.sleep.delta, null)
  const errors = compare(threeEach(), { illnessError: true, sleepError: true })
  assert.equal(errors.metrics.illness.delta, null); assert.match(errors.metrics.illness.reason, /ofullständigt/)
  assert.equal(errors.metrics.sleep.delta, null)
  const future = compare([], { future: true })
  assert.ok(Object.values(future.metrics).every(metric => metric.delta === null))
})

test('illness compares unique swimmers, deduplicating sick days from both reporting sources', () => {
  const responses = [{ profileId: 'a', activityDate: '2026-11-10', type: 'sick' }, { profileId: 'a', activityDate: '2026-11-11', type: 'sick' }]
  const illnessRecords = [{ profile_id: 'a', activity_date: '2026-11-10', status: 'sick' }, { profile_id: 'b', activity_date: '2026-11-02', status: 'sick' }]
  const result = compare(responses, { illnessRecords })
  assert.equal(result.current.sickDays, 2); assert.equal(result.current.sickSwimmers, 1)
  assert.equal(result.metrics.illness.delta, 0)
})

test('mild symptoms compare unique swimmers over matching weekdays, not symptom days', () => {
  const illnessRecords = [
    { profile_id: 'a', activity_date: '2026-11-02', status: 'mild' },
    { profile_id: 'a', activity_date: '2026-11-09', status: 'mild' },
    { profile_id: 'a', activity_date: '2026-11-10', status: 'mild' },
    { profile_id: 'b', activity_date: '2026-11-11', status: 'mild' },
    { profile_id: 'b', activity_date: '2026-11-05', status: 'mild' },
    { profile_id: 'test', activity_date: '2026-11-10', status: 'mild' },
  ]
  const result = compare([], { illnessRecords })
  assert.equal(result.current.mild.count, 2)
  assert.equal(result.current.mild.days, 3)
  assert.equal(result.previous.mild.count, 1)
  assert.equal(result.metrics.mild.delta, 1)
  assert.equal(compare([], { illnessRecords, illnessError: true }).metrics.mild.delta, null)
  assert.equal(compare([]).metrics.mild.delta, 0)
})
