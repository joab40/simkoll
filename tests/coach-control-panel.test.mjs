import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'

const profiles = [{ id: 'a', displayName: 'Anna' }, { id: 'b', displayName: 'Bo' }, { id: 'test', displayName: 'Test', isTestProfile: true }]
const after = (profileId, activityDate, extra = {}) => ({ profileId, activityDate, createdAt: `${activityDate}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', ...extra })

test('selected week metrics exclude comparison data, while speed retains last calendar week', () => {
  const report = buildCoachControlPanel(profiles, [
    after('a', '2026-10-20', { rpe: 10, activityMinutes: 120, speedFeeling: 2 }),
    after('a', '2026-10-21', { rpe: 10, activityMinutes: 120, speedFeeling: 3 }),
    after('a', '2026-10-27', { rpe: 4, activityMinutes: 60, speedFeeling: 4 }),
    after('a', '2026-10-28', { rpe: 6, activityMinutes: 60, speedFeeling: 5 }),
    after('a', '2026-10-29', { rpe: 10 }), // Future relative to the selected report day.
    { profileId: 'b', activityDate: '2026-10-20', type: 'sick' },
    { profileId: 'b', activityDate: '2026-10-27', type: 'sick' },
  ], '2026-10-28', [
    { profile_id: 'a', activity_date: '2026-10-20', minutes: 300, quality: 1 },
    { profile_id: 'a', activity_date: '2026-10-27', minutes: 480, quality: 5 },
  ], { periodStart: '2026-10-26' })
  assert.equal(report.completedPasses, 2)
  assert.equal(report.load, 600)
  assert.equal(report.averageRpe, 5)
  assert.equal(report.sickDays, 1)
  assert.equal(report.sleep.nights, 1)
  assert.equal(report.sleep.averageMinutes, 480)
  assert.equal(report.swimmers[0].speedPrevious, 2.5)
  assert.equal(report.swimmers[0].speedCurrent, 4.5)
  assert.equal(report.followUps.length, 0)
  assert.equal(report.start, '2026-10-26')
  assert.equal(report.signalStart, '2026-10-22')
})

test('ongoing week does not erase a repeated sleep signal at the Monday boundary', () => {
  const nights = [420, 525, 360, 660, 420, 330, 405].map((minutes, i) => ({ profile_id: 'a', activity_date: `2026-10-${25 + i}`, minutes, quality: 5 }))
  const report = buildCoachControlPanel(profiles, [], '2026-10-31', nights, { periodStart: '2026-10-26' })
  assert.equal(report.sleep.nights, 6) // Only this calendar week's nights in the metric.
  assert.equal(report.followUps[0].sleepWarning.level, 'red') // Rolling seven-day signal keeps Sunday too.
  assert.equal(report.followUps[0].sleepWarning.count, 5)
})

test('coach overview counts unique after-activities and only known training load', () => {
  const responses = [
    after('a', '2026-10-18', { createdAt: '2026-10-18T18:00:00Z', rpe: 8, activityMinutes: 60, comment: 'Bra pass' }),
    after('a', '2026-10-18', { createdAt: '2026-10-18T17:00:00Z', rpe: 6, activityMinutes: 45 }),
    after('b', '2026-10-17', { rpe: 5 }),
    after('test', '2026-10-18', { rpe: 9, activityMinutes: 100 }),
    after('a', '2026-10-18', { competition: true, rpe: 9, activityMinutes: 120 }),
  ]
  const report = buildCoachControlPanel(profiles, responses, '2026-10-19')
  assert.equal(report.profileCount, 2)
  assert.equal(report.completedPasses, 2)
  assert.equal(report.load, 480)
  assert.equal(report.loadAnswers, 1)
  assert.equal(report.averageRpe, 6.5)
  assert.equal(report.feedbackCount, 1)
})

test('dialog signals require repeated distinct days, not duplicate responses or silence', () => {
  const responses = [
    after('a', '2026-10-17', { rpe: 9, body: 2 }),
    after('a', '2026-10-17', { createdAt: '2026-10-17T19:00:00Z', rpe: 9, body: 2 }),
    after('a', '2026-10-18', { rpe: 8, body: 2 }),
    { profileId: 'b', activityDate: '2026-10-18', type: 'sick' },
  ]
  const report = buildCoachControlPanel(profiles, responses, '2026-10-19')
  assert.equal(report.followUps.length, 1)
  assert.equal(report.followUps[0].profileId, 'a')
  assert.match(report.followUps[0].reasons.join(' '), /kroppskänsla 2 dagar/)
  assert.match(report.followUps[0].reasons.join(' '), /RPE 8–10\) 2 dagar/)
})

test('speed feeling development needs at least two answers in both weeks', () => {
  const responses = [
    after('a', '2026-10-08', { speedFeeling: 2 }),
    after('a', '2026-10-09', { speedFeeling: 3 }),
    after('a', '2026-10-17', { speedFeeling: 4 }),
    after('a', '2026-10-18', { speedFeeling: 5 }),
    after('b', '2026-10-18', { speedFeeling: 5 }),
  ]
  const report = buildCoachControlPanel(profiles, responses, '2026-10-19')
  assert.equal(report.swimmers.find((item) => item.profileId === 'a').speedPrevious, 2.5)
  assert.equal(report.swimmers.find((item) => item.profileId === 'a').speedCurrent, 4.5)
  assert.equal(report.swimmers.find((item) => item.profileId === 'b').speedCurrent, null)
})

test('sickness counts swimmers and distinct days across the full overview period', () => {
  const sick = (profileId, activityDate) => ({ profileId, activityDate, type: 'sick' })
  const report = buildCoachControlPanel(profiles, [
    sick('a', '2026-10-06'), sick('a', '2026-10-06'), sick('a', '2026-10-18'),
    sick('b', '2026-10-18'), sick('test', '2026-10-18'), sick('outside', '2026-10-18'),
    sick('b', '2026-10-05'), sick('b', '2026-10-20'),
  ], '2026-10-19')
  assert.equal(report.sickSwimmers, 2)
  assert.equal(report.sickDays, 3)
  assert.equal(report.swimmers.find((item) => item.profileId === 'a').sickDays, 2)
  assert.equal(report.followUps.length, 0) // Older illness does not trigger the seven-day signal.
})

test('sleep overview excludes skipped, missing, duplicate and out-of-scope nights without treating them as zero', () => {
  const night = (profile_id, activity_date, minutes, quality = 5) => ({ profile_id, activity_date, minutes, quality })
  const report = buildCoachControlPanel(profiles, [], '2026-10-19', [
    night('a', '2026-10-06', 420), night('a', '2026-10-06', 420),
    night('a', '2026-10-18', 480, 1), night('b', '2026-10-19', 450),
    { ...night('b', '2026-10-18', null, null), skipped: true },
    night('b', '2026-10-17', null), night('b', '2026-10-05', 120),
    night('b', '2026-10-20', 120), night('test', '2026-10-19', 120),
    night('outside', '2026-10-19', 120),
  ])
  assert.deepEqual(report.sleep, { nights: 3, swimmers: 2, averageMinutes: 450, poorNights: 1 })
  assert.equal(report.swimmers.find((item) => item.profileId === 'a').sleep.averageMinutes, 450)
  assert.deepEqual(buildCoachControlPanel(profiles, [], '2026-10-19').sleep, { nights: 0, swimmers: 0, averageMinutes: null, poorNights: 0 })
})
