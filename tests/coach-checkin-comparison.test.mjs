import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCoachCheckinComparison } from '../src/coach-checkin-comparison.js'
import { coachMetricDetails } from '../src/coach-metric-details.js'

const row = (activityDate, patch = {}) => ({ activityDate, createdAt: `${activityDate}T18:00:00Z`, type: 'after', feeling: 4, rpe: 6, pass: 5, setup: 3, ...patch })
const compare = rows => buildCoachCheckinComparison(rows, '2026-11-09', '2026-11-11')
const previous = ['2026-11-02', '2026-11-03', '2026-11-04'].map(day => row(day, { feeling: 3, rpe: 7, pass: 3 }))
const current = ['2026-11-09', '2026-11-10', '2026-11-11'].map(day => row(day))

test('all four cards compare the same elapsed weekdays, using means rather than counts or a whole unfinished week', () => {
  const result = compare([...previous, ...current, row('2026-11-05', { feeling: 1, rpe: 1 }), row('2026-11-12', { feeling: 1, rpe: 1 })])
  assert.equal(result.previousStart, '2026-11-02'); assert.equal(result.previousEnd, '2026-11-04')
  assert.deepEqual(result.current.feeling, { count: 3, average: 4 })
  assert.equal(result.metrics.feeling.delta, 1)
  assert.equal(result.metrics.rpe.delta, -1)
  assert.equal(result.metrics.pass.delta, 2)
  assert.equal(result.metrics.setup.delta, 0)
})

test('comparison uses exactly the response values counted in each card and drilldown, including repeats and anonymous answers', () => {
  const rows = [...current, row('2026-11-11', { type: 'before', feeling: 2, rpe: 10, pass: 1 }), row('2026-11-11', { profileId: null, feeling: 5, rpe: 8, setup: 5 })]
  const result = compare([...previous, ...rows])
  for (const key of ['feeling', 'rpe', 'pass', 'setup']) {
    const details = coachMetricDetails(key, rows)
    assert.equal(result.current[key].count, details.entries.length)
    assert.equal(result.current[key].average.toFixed(1), details.average)
  }
  assert.equal(result.current.feeling.count, 5)
  assert.equal(result.current.rpe.count, 4, 'before-training RPE is not an after-report')
})

test('insufficient and invalid data give a neutral dash per metric, never a fabricated zero or shared sample count', () => {
  const result = compare([...previous, ...current.map(item => ({ ...item, setup: null, pass: '5' }))])
  assert.equal(result.metrics.feeling.delta, 1)
  for (const key of ['setup', 'pass']) { assert.equal(result.current[key].average, null); assert.equal(result.metrics[key].delta, null); assert.match(result.metrics[key].reason, /För få/) }
  const missing = compare([row('2026-11-09', { feeling: 0, rpe: NaN, pass: 6, setup: -1 }), { createdAt: 'bad', feeling: 5 }])
  for (const value of Object.values(missing.metrics)) assert.equal(value.delta, null)
})

test('late entries follow activity day and Stockholm midnight, and full-week comparison crosses a year boundary', () => {
  const result = compare([row('2026-11-04', { createdAt: '2026-11-11T18:00:00Z' }), row('2026-11-08', { activityDate: undefined, createdAt: '2026-11-08T23:30:00Z' })])
  assert.equal(result.previous.feeling.count, 1); assert.equal(result.current.feeling.count, 1)
  const nextYear = buildCoachCheckinComparison([], '2027-01-04', '2027-01-10')
  assert.equal(nextYear.previousStart, '2026-12-28'); assert.equal(nextYear.previousEnd, '2027-01-03')
})

test('all four trends receive the shared selected-week scope, and comparison disclosures remain above the drilldown hit area', () => {
  const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const main = read('main.jsx'), panel = read('coach-control-panel.jsx'), css = read('coach-checkin-trend.css')
  for (const metric of ['feeling', 'rpe', 'pass', 'setup']) assert.match(main, new RegExp(`<CoachCheckinTrend comparison=\\{checkinComparison\\} metric="${metric}"`))
  assert.match(panel, /buildCoachCheckinComparison\(responses.filter\(row => row.profileId \? ids.has\(row.profileId\) : includeAnonymous\), weekStart, observedEnd\)/)
  assert.match(main, /checkinComparison=\{checkinComparison\}/)
  assert.match(css, /position: relative; z-index: 2/)
  assert.match(read('coach-checkin-trend.jsx'), /inte automatiskt bättre eller sämre form/)
})
