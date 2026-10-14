import test from 'node:test'
import assert from 'node:assert/strict'
import { attendanceFromCheckins } from '../src/attendance.js'
import { checkinTraining, validCheckinActivity } from '../shared/checkin-activity.js'
import { toDatabase, fromDatabase } from '../api/responses.js'
import { buildSwimmerPasses, individualSignals } from '../server/individual-analysis.js'

const morning = { profileId: 'one', type: 'after', activityType: 'swim', trainingSlot: 'morning_swim', registerTraining: true, createdAt: '2026-10-14T08:00:00Z' }
const evening = { ...morning, trainingSlot: 'afternoon_swim', createdAt: '2026-10-14T18:00:00Z' }
test('morning response cannot mark evening present or override evening absence', () => {
  assert.equal(attendanceFromCheckins([], [morning], 'morning_swim').one, true)
  assert.equal(Boolean(attendanceFromCheckins([], [morning], 'afternoon_swim').one), false)
  const rows = [{ profile_id: 'one', session_slot: 'afternoon_swim', present: false, marked_at: '2026-10-14T07:00:00Z' }]
  assert.equal(attendanceFromCheckins(rows, [morning], 'afternoon_swim').one, false)
})
test('two sessions stay separate; intentions, legacy and competitions do not create attendance', () => {
  assert.equal(attendanceFromCheckins([], [morning, evening], 'morning_swim').one, true)
  assert.equal(attendanceFromCheckins([], [morning, evening], 'afternoon_swim').one, true)
  for (const response of [{ ...morning, type: 'before' }, { ...morning, trainingSlot: null }, { ...morning, competition: true }, { ...morning, activityType: 'strength' }, { ...morning, registerTraining: false }]) {
    assert.equal(Boolean(attendanceFromCheckins([], [response], 'morning_swim').one), false)
  }
  assert.equal(attendanceFromCheckins([], [morning, { ...morning, type: 'before', createdAt: evening.createdAt }], 'morning_swim').one, true)
})
test('newer coach decisions stay authoritative and other slot rows are ignored', () => {
  const row = { profile_id: 'one', session_slot: 'morning_swim', present: false, marked_at: '2026-10-14T09:00:00Z' }
  assert.equal(attendanceFromCheckins([row], [morning], 'morning_swim').one, false)
  assert.equal(attendanceFromCheckins([{ ...row, session_slot: 'afternoon_swim' }], [morning], 'morning_swim').one, true)
})
test('pass choice survives response persistence and training log registration', () => {
  const row = toDatabase({ ...morning, feeling: 4 }, 'one', '2026-10-13')
  assert.equal(row.session_slot, 'morning_swim')
  const response = fromDatabase({ ...row, created_at: morning.createdAt }, true)
  assert.equal(response.trainingSlot, 'morning_swim')
  assert.equal(response.activityDate, '2026-10-13')
  assert.equal(response.registerTraining, true)
  assert.equal(checkinTraining(response).session_slot, 'morning_swim')
  assert.equal(fromDatabase({ ...row }, false).trainingSlot, undefined)
  assert.equal(toDatabase({ ...morning, activityType: 'cycling' }, 'one', '2026-10-14').session_slot, null)
  assert.equal(checkinTraining({ type: 'after', activityType: 'swim' }), null)
  assert.equal(validCheckinActivity({ trainingSlot: 'invalid' }), false)
})
test('AM and PM feedback attach only to the corresponding registered pass', () => {
  const date = '2026-10-14'
  const sessions = ['morning_swim', 'afternoon_swim'].map((session_slot) => ({ activity_type: 'swim', session_date: date, session_slot }))
  const responses = [{ day_type: 'after', activity_date: date, created_at: morning.createdAt, session_slot: 'morning_swim', activity_type: 'swim', rpe: 3 }, { day_type: 'after', activity_date: date, created_at: evening.createdAt, session_slot: 'afternoon_swim', activity_type: 'swim', rpe: 8 }]
  const workouts = ['morning', 'afternoon'].map((time_of_day) => ({ workout_date: date, time_of_day, title: time_of_day, focus: time_of_day }))
  const passes = buildSwimmerPasses({ sessions, responses, workouts })
  assert.equal(passes.find((p) => p.sessionSlot === 'morning_swim').feedback.rpe, 3)
  assert.equal(passes.find((p) => p.sessionSlot === 'afternoon_swim').feedback.rpe, 8)
  assert(passes.every((p) => p.feedbackLink === 'slot'))
  assert.equal(individualSignals({ workouts: passes }).linkage.passesWithComparableFeedback, 2)
  const onlyAM = buildSwimmerPasses({ sessions, responses: [responses[0]], workouts })
  assert.equal(onlyAM.find((p) => p.sessionSlot === 'afternoon_swim').feedback, null)
})
