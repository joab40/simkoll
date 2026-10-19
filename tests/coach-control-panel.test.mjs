import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'

const profiles = [{ id: 'a', displayName: 'Anna' }, { id: 'b', displayName: 'Bo' }, { id: 'test', displayName: 'Test', isTestProfile: true }]
const after = (profileId, activityDate, extra = {}) => ({ profileId, activityDate, createdAt: `${activityDate}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', ...extra })

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
