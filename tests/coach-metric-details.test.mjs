import test from 'node:test'
import assert from 'node:assert/strict'
import { coachMetricDetails } from '../src/coach-metric-details.js'

const profiles = [{ id: 'a', displayName: 'Alfred', emoji: '🏊' }, { id: 'b', displayName: 'Ebba', emoji: '🙂' }]
const responses = [
  { id: 'before', profileId: 'a', type: 'before', feeling: 2, rpe: 10, activityDate: '2026-10-13', createdAt: '2026-10-13T06:00:00Z' },
  { id: 'after', profileId: 'a', type: 'after', feeling: 4, rpe: 6, pass: 5, setup: 3, comment: 'Bra pass', activityDate: '2026-10-13', createdAt: '2026-10-13T17:00:00Z' },
  { id: 'rest', profileId: 'b', type: 'rest', feeling: 3, rpe: null, activityDate: '2026-10-13', createdAt: '2026-10-13T08:00:00Z' },
  { id: 'anonymous', profileId: null, type: 'after', feeling: 1, rpe: 8, pass: null, setup: 1, comment: 'Alfred är ett namn i fritexten', activityDate: '2026-10-13', createdAt: '2026-10-13T18:00:00Z' },
]
test('feeling detail retains every contribution including repeat and anonymous answers', () => {
  const detail = coachMetricDetails('feeling', responses, profiles)
  assert.equal(detail.entries.length, 4)
  assert.equal(detail.average, '2.5')
  assert.equal(detail.profileCount, 2)
  assert.equal(detail.anonymousCount, 1)
  const anonymous = detail.entries.find((entry) => entry.response.id === 'anonymous')
  assert.equal(anonymous.profile, null)
  assert.equal(anonymous.anonymous, true)
  assert.equal(detail.entries.filter((entry) => entry.profile?.id === 'a').length, 2)
})
test('RPE, pass and setup show only actual answers after training', () => {
  const rpe = coachMetricDetails('rpe', responses, profiles)
  assert.deepEqual(rpe.entries.map((entry) => entry.value), [8, 6])
  assert.equal(rpe.average, '7.0')
  const pass = coachMetricDetails('pass', responses, profiles)
  assert.equal(pass.entries.length, 1)
  assert.equal(pass.average, '5.0')
  assert.equal(pass.entries[0].label, 'Bra')
  assert.equal(coachMetricDetails('setup', responses, profiles).average, '2.0')
})
test('activity date stays separate from submission time and unavailable profiles are not relabelled anonymous', () => {
  const entries = coachMetricDetails('feeling', [...responses, { id: 'late', profileId: 'removed', type: 'after', feeling: 5, activityDate: '2026-10-12', lateEntry: true, createdAt: '2026-10-13T20:00:00Z' }], profiles).entries
  assert.equal(entries.at(-1).day, '2026-10-12')
  assert.equal(entries.at(-1).profile, null)
  assert.equal(entries.at(-1).anonymous, false)
})
test('missing values do not become zero ratings or participants', () => {
  const detail = coachMetricDetails('rpe', [{ type: 'after', rpe: null }, { type: 'after', rpe: 0 }, { type: 'after', rpe: NaN }, { type: 'after', rpe: '4' }], profiles)
  assert.equal(detail.entries.length, 0)
  assert.equal(detail.average, '–')
})
