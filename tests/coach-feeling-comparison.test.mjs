import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCoachFeelingComparison } from '../src/coach-feeling-comparison.js'

const row = (activityDate, feeling) => ({ activityDate, feeling })
const compare = rows => buildCoachFeelingComparison(rows, '2026-11-09', '2026-11-12')
test('feeling trend compares matching weekdays and means, not response totals', () => {
  const result = compare([
    row('2026-11-02', 2), row('2026-11-03', 3), row('2026-11-05', 4), row('2026-11-06', 5),
    row('2026-11-09', 4), row('2026-11-10', 4), row('2026-11-11', 4), row('2026-11-12', 4), row('2026-11-13', 1),
  ])
  assert.equal(result.previousStart, '2026-11-02')
  assert.equal(result.previousEnd, '2026-11-05')
  assert.deepEqual(result.current, { count: 4, average: 4 })
  assert.deepEqual(result.previous, { count: 3, average: 3 })
  assert.equal(result.metrics.feeling.delta, 1)
})
test('missing and invalid feelings never count as zero, small samples have no trend', () => {
  const result = compare([row('2026-11-09', 0), row('2026-11-10', null), row('2026-11-11', 6), row('2026-11-12', '4')])
  assert.deepEqual(result.current, { count: 0, average: null })
  assert.equal(result.metrics.feeling.delta, null)
  assert.match(result.metrics.feeling.reason, /För få/)
})
test('late entries use activity date and timestamp fallback uses Stockholm day', () => {
  const result = compare([{ activityDate: '2026-11-05', createdAt: '2026-11-12T08:00:00Z', feeling: 2 }, { createdAt: '2026-11-08T23:30:00Z', feeling: 5 }])
  assert.equal(result.previous.average, 2)
  assert.equal(result.current.average, 5)
})
test('complete week comparison crosses year boundary without shifting weekdays', () => {
  const result = buildCoachFeelingComparison([], '2027-01-04', '2027-01-10')
  assert.equal(result.previousStart, '2026-12-28')
  assert.equal(result.previousEnd, '2027-01-03')
})
test('both overview cards receive trends; activity and comments are hidden only for control panel', () => {
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../src/coach-control-panel.jsx', import.meta.url), 'utf8')
  assert.equal((app.match(/<CoachFeelingTrend comparison=\{feelingComparison\}/g) || []).length, 2)
  assert.match(app, /feelingComparison=\{feelingComparison\} hideActivityComments/)
  assert.match(app, /hideActivityComments = false/)
  assert.match(app, /!hideActivityComments && <div className="coach-columns">/)
  assert.match(panel, /buildCoachFeelingComparison\(responses.filter\(row => row.profileId \? ids.has\(row.profileId\) : includeAnonymous\)/)
})
