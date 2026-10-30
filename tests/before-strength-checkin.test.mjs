import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BEFORE_TRAINING_CHOICES, selectBeforeTraining, checkinTraining, validCheckinActivity } from '../shared/checkin-activity.js'
import { toDatabase, fromDatabase, checkinPointAwards } from '../api/responses.js'

test('before choices put strength between the two swim sessions', () => {
  assert.deepEqual(BEFORE_TRAINING_CHOICES.map(({ activityType, slot }) => [activityType, slot]), [['swim', 'morning_swim'], ['strength', null], ['swim', 'afternoon_swim']])
})

test('strength intent clears swim data, persists its type and never grants attendance', () => {
  const form = selectBeforeTraining({ type: 'before', feeling: 4, trainingSlot: 'afternoon_swim', workoutReference: 'old', activityDistanceMeters: 5000, activityMinutes: 90, registerTraining: true }, BEFORE_TRAINING_CHOICES[1])
  assert.equal(validCheckinActivity(form), true)
  assert.equal(form.trainingSlot, null)
  assert.equal(form.workoutReference, null)
  assert.equal(form.activityDistanceMeters, null)
  assert.equal(form.activityMinutes, null)
  assert.equal(form.registerTraining, false)
  assert.equal(checkinTraining(form), null)
  assert.equal(checkinTraining({ ...form, registerTraining: true }), null)
  const row = toDatabase(form, 'profile', '2026-10-30')
  assert.equal(row.activity_type, 'strength')
  assert.equal(row.session_slot, null)
  assert.equal(fromDatabase(row, true).activityType, 'strength')
  assert.deepEqual(checkinPointAwards(form, '2026-10-30'), [{ eventType: 'checkin_before', points: 1, sourceKey: '2026-10-30' }])
  assert.equal(checkinTraining({ ...form, type: 'after', registerTraining: true }).activity_type, 'strength')
})

test('switching back to either swim choice restores only its explicit slot', () => {
  const strength = selectBeforeTraining({ type: 'before' }, BEFORE_TRAINING_CHOICES[1])
  for (const choice of [BEFORE_TRAINING_CHOICES[0], BEFORE_TRAINING_CHOICES[2]]) {
    const swim = selectBeforeTraining(strength, choice)
    assert.equal(swim.activityType, 'swim')
    assert.equal(swim.trainingSlot, choice.slot)
    assert.equal(checkinTraining(swim), null)
  }
})

test('before selection keeps a stable question offset when changing activity', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(source, /questionOffset = .*needsPassChoice \? 1 : 0/)
  assert.match(source, /needsPassChoice && step === slotStep && form.type === 'before'/)
})
