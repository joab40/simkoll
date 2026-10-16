import assert from 'node:assert/strict'
import { checkinPointAwards } from '../api/responses.js'

const date = '2026-10-16'

assert.deepEqual(checkinPointAwards({ type: 'before', trainingSlot: 'morning_swim' }, date), [
  { eventType: 'checkin_before', points: 1, sourceKey: date },
])
assert.deepEqual(checkinPointAwards({ type: 'before', competition: true }, date), [
  { eventType: 'checkin_before', points: 1, sourceKey: date },
])
assert.deepEqual(checkinPointAwards({ type: 'after', activityType: 'swim', trainingSlot: 'morning_swim' }, date), [
  { eventType: 'training_feedback', points: 3, sourceKey: `${date}:morning_swim` },
])
assert.deepEqual(checkinPointAwards({ type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim' }, date), [
  { eventType: 'training_feedback', points: 3, sourceKey: `${date}:afternoon_swim` },
])
assert.deepEqual(checkinPointAwards({ type: 'after', activityType: 'strength' }, date), [
  { eventType: 'training_feedback', points: 3, sourceKey: `${date}:strength` },
])
assert.deepEqual(checkinPointAwards({ type: 'after', competition: true }, date), [
  { eventType: 'training_feedback', points: 3, sourceKey: `${date}:competition` },
])
assert.deepEqual(checkinPointAwards({ type: 'rest' }, date), [])
assert.deepEqual(checkinPointAwards({ type: 'sick' }, date), [])

console.log('PASS check-in points: before, AM/PM, selected activities, competition, rest and sick')
