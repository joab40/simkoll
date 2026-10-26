import test from 'node:test'
import assert from 'node:assert/strict'
import { groupSwimOccasions, planningAmountRange, swimWorkoutOptions, validWorkoutOption } from '../shared/swim-workout-options.js'
import { buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'
import { toDatabase, fromDatabase } from '../api/responses.js'
import { validCheckinActivity } from '../shared/checkin-activity.js'
import { sessionSwimMetrics } from '../server/session-swim-metrics.js'

const date = '2026-10-27', a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
const workouts = [
  { id: a, workout_date: date, title: 'F2 Spec Morgon', distance_meters: 4700, duration_minutes: 110, time_of_day: 'morning', target_groups: ['junior'], focus: 'f2_spec' },
  { id: b, workout_date: date, title: 'Spec', distance_meters: 4000, duration_minutes: 120, time_of_day: 'morning', target_groups: ['junior'], focus: 'teknik' },
]
const session = { session_date: date, session_slot: 'morning_swim', activity_type: 'swim' }
const response = { day_type: 'after', activity_date: date, session_slot: 'morning_swim', activity_type: 'swim', created_at: date + 'T10:00:00Z', planned_completion: 'full' }
const diary = (responses = [], extra = {}) => buildDiaryEntries({ sessions: [session], responses, workouts, trainingGroup: 'junior', today: '2026-10-28', ...extra })

test('a chosen alternative contributes one session and only its own planned amount', () => {
  const entries = diary([{ ...response, workout_reference: `workout:${b}` }])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].title, 'Spec')
  assert.equal(entries[0].focus, 'teknik')
  assert.equal(entries[0].estimatedMeters, 4000)
  assert.equal(entries[0].estimatedMinutes, 120)
  assert.equal(summarizeDiary(entries, [], date, date).sessions, 1)
})
test('attendance and old feedback without a choice never add alternatives together', () => {
  for (const responses of [[], [response]]) {
    const entry = diary(responses)[0]
    assert.equal(entry.estimatedMeters, null)
    assert.equal(entry.estimatedMinutes, null)
    assert.equal(entry.workoutChoiceMissing, true)
  }
})
test('manual plans, partial completion and actual amounts keep their meaning', () => {
  const plans = [{ id: a, plan_date: date, activity_type: 'swim', title: 'Manual', time_of_day: 'morning', distance_meters: 3000, duration_minutes: 60 }]
  const [entry] = diary([{ ...response, workout_reference: `plan:${a}`, planned_completion: 'partial', activity_distance_meters: 1800, activity_minutes: 45 }], { plans })
  assert.equal(entry.title, 'Manual')
  assert.equal(entry.reportedMeters, 1800)
  assert.equal(entry.reportedMinutes, 45)
  assert.equal(entry.estimatedMeters, null)
})
test('wrong group, date, slot or removed selection cannot silently select another workout', () => {
  for (const extra of [ { trainingGroup: 'other' }, { workouts: workouts.map((row) => ({ ...row, workout_date: '2026-10-26' })) }, { workouts: workouts.map((row) => ({ ...row, time_of_day: 'afternoon' })) }, { workouts: [workouts[0]] } ]) {
    assert.equal(diary([{ ...response, workout_reference: `workout:${b}` }], extra)[0].estimatedMeters, null)
  }
})
test('same date/time/place forms one occasion; unknown time, other places and afternoons remain separate', () => {
  const options = workouts.map((row) => ({ id: row.id, date, activityType: 'swim', time: '08:00', location: 'Himlabadet', distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes }))
  assert.equal(groupSwimOccasions(options).length, 1)
  assert.deepEqual(planningAmountRange(options, 'distanceMeters'), { min: 4000, max: 4700 })
  assert.deepEqual(planningAmountRange([...options, { ...options[0], time: '18:00', distanceMeters: 3000 }], 'distanceMeters'), { min: 7000, max: 7700 })
  for (const change of [{ time: '' }, { time: '09:00' }, { location: 'Annat bad' }, { date: '2026-10-28' }]) assert.equal(groupSwimOccasions([options[0], { ...options[1], ...change }]).length, 2)
})
test('references round-trip and option checks enforce group, day and slot', () => {
  const choice = `workout:${b}`
  const stored = toDatabase({ type: 'after', activityType: 'swim', trainingSlot: 'morning_swim', workoutReference: choice, feeling: 4 }, 'profile', date)
  assert.equal(fromDatabase(stored, true).workoutReference, choice)
  assert.equal(validCheckinActivity({ workoutReference: choice }), true)
  assert.equal(validCheckinActivity({ workoutReference: 'workout:../../bad' }), false)
  const option = { date, timeOfDay: 'morning', targetGroups: ['junior'] }
  assert.equal(validWorkoutOption(option, { date, slot: 'morning_swim', trainingGroup: 'junior' }), true)
  assert.equal(validWorkoutOption(option, { date, slot: 'afternoon_swim', trainingGroup: 'junior' }), false)
  assert.equal(validWorkoutOption(option, { date, slot: 'morning_swim', trainingGroup: 'other' }), false)
  const options = swimWorkoutOptions([{ id: a }], [{ id: b, activityType: 'swim', sourceWorkoutId: a }])
  assert.equal(options.length, 1)
})

test('weekly metrics use each swimmer’s choice and never fall back to the other slot', () => {
  const sessions = ['one', 'two', 'three'].map((profile_id) => ({ ...session, profile_id }))
  const responses = [
    { ...response, profile_id: 'one', workout_reference: `workout:${a}` },
    { ...response, profile_id: 'two', workout_reference: `workout:${b}`, activity_distance_meters: 3500 },
  ]
  const profiles = ['one', 'two', 'three'].map((id) => ({ id, training_group: 'junior' }))
  const metrics = sessionSwimMetrics({ sessions, responses, workouts, plans: [], profiles })
  assert.equal(metrics.get(`one|${date}|morning_swim`).distanceMeters, 4700)
  assert.equal(metrics.get(`two|${date}|morning_swim`).distanceMeters, 3500)
  assert.equal(metrics.get(`three|${date}|morning_swim`).distanceMeters, null)
  const eveningOnly = sessionSwimMetrics({ sessions, responses: [], workouts: workouts.map((row) => ({ ...row, time_of_day: 'afternoon' })), plans: [], profiles })
  assert.equal(eveningOnly.get(`one|${date}|morning_swim`).distanceMeters, null)
})
