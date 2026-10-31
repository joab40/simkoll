import test from 'node:test'
import assert from 'node:assert/strict'
import { shortSleepWarning } from '../shared/sleep-warning.js'
import { sleepDirection } from '../shared/swimmer-card-direction.js'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import { groupMenuOffset } from '../src/coach-group-menu-position.js'

const date = '2026-10-31'
const row = (day, minutes, extra = {}) => ({ activity_date: `2026-10-${day}`, minutes, quality: 5, profile_id: 'one', ...extra })
const screenshot = () => [420, 525, 360, 660, 420, 330, 405].map((minutes, index) => row(25 + index, minutes, { quality: index ? 5 : 3 }))

test('the screenshot has five short nights and warns red despite its higher whole-week average and improving quality', () => {
  const records = screenshot(), warning = shortSleepWarning(records, date)
  assert.equal(warning.level, 'red')
  assert.equal(warning.averageMinutes, 387)
  assert.deepEqual(warning.dates, ['2026-10-25', '2026-10-27', '2026-10-29', '2026-10-30', '2026-10-31'])
  assert.match(warning.label, /6 h 27 min/)
  assert.equal(sleepDirection(records, date).state, 'up')
  assert.equal(sleepDirection(records, date).warning.level, 'red')
  assert.equal(shortSleepWarning(records.map((item) => ({ ...item, rpe: 10, feeling: 1, quality: null })), date).level, 'red')
  const threeOnly = records.map((item, index) => index === 0 || index === 2 ? { ...item, minutes: 480 } : item)
  assert.equal(shortSleepWarning(threeOnly, date).level, 'amber')
  assert.equal(shortSleepWarning(threeOnly, date).averageMinutes, 385)
})
test('five short nights in the week produce red even if a recent longer night breaks the three-night run', () => {
  const records = [row(25, 420), row(26, 390), row(27, 390), row(28, 420), row(29, 420), row(30, 600), row(31, 480)]
  const warning = shortSleepWarning(records, date)
  assert.equal(warning.level, 'red')
  assert.equal(warning.count, 5)
  assert.match(warning.label, /5 nätter senaste veckan/)
  assert.equal(shortSleepWarning(records.slice(0, 4), date).level, 'amber')
})
test('missing, invalid, skipped, duplicate, old and future reports never become extra short nights', () => {
  const pair = [row(30, 420), row(31, 420)]
  for (const extra of [row(31, 420), row(29, 420, { skipped: true }), row(29, null), row(29, -1), row(29, 841), row(24, 420), row(32, 420), null]) assert.equal(shortSleepWarning([...pair, extra], date), null)
  assert.equal(shortSleepWarning([row(29, 421), ...pair], date), null, 'inclusive threshold is 420, not rounded hours')
  assert.equal(shortSleepWarning(pair, '2026-99-99'), null)
  assert.equal(shortSleepWarning(pair, '2026-02-31'), null)
  assert.equal(shortSleepWarning([row(27, 420), row(29, 420), row(31, 420)], date).level, 'amber', 'gaps are allowed only within the seven-day window')
  const insufficient = sleepDirection([row(29, 420), ...pair], date)
  assert.equal(insufficient.state, 'insufficient')
  assert.equal(insufficient.warning.level, 'amber', 'a warning does not require enough nights for an arrow')
})
test('same duration warning reaches individual follow-up with no RPE and no cross-profile data', () => {
  const profiles = [{ id: 'one', displayName: 'Simmare' }, { id: 'other', displayName: 'Annan' }]
  const report = buildCoachControlPanel(profiles, [], date, screenshot())
  assert.equal(report.followUps.length, 1)
  assert.equal(report.followUps[0].sleepWarning.level, 'red')
  assert.ok(report.followUps[0].reasons.includes(shortSleepWarning(screenshot(), date).label))
  assert.equal(report.swimmers[1].sleepWarning, null)
  assert.equal(report.swimmers[1].reasons.length, 0)
})
test('group dropdown anchors to its own button and only shifts to stay inside the viewport', () => {
  assert.equal(groupMenuOffset(300, 210, 1000), 0)
  assert.equal(groupMenuOffset(150, 210, 375), -1)
  assert.equal(groupMenuOffset(250, 210, 320), -156)
  assert.equal(groupMenuOffset(2, 210, 320), 14)
})
