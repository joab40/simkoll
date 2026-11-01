import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { sessionSwimMetrics } from '../server/session-swim-metrics.js'
import { swimWorkoutOptions } from '../shared/swim-workout-options.js'
import { diaryEntryLoad } from '../shared/training-load.js'
import { plannedSwimTime, commonPlannedSwimTime } from '../shared/planned-swim-time.js'

const date = '2026-11-01'
const workout = (extra = {}) => ({ id: 'w', workout_date: date, time_of_day: 'afternoon', duration_minutes: 120, distance_meters: 5000, target_groups: ['junior'], ...extra })
const response = (extra = {}) => ({ id: 'a', activity_date: date, created_at: `${date}T18:00:00Z`, day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim', rpe: 5, ...extra })
const session = { profile_id: 'p', session_date: date, activity_type: 'swim', session_slot: 'afternoon_swim' }
function calculate(responses = [response()], workouts = [workout()], plans = []) {
  const [entry] = buildDiaryEntries({ responses, workouts, plans, trainingGroup: 'junior', today: date })
  const normalized = responses.map(row => ({ id: row.id, date: row.activity_date, createdAt: row.created_at, type: row.day_type, activityType: row.activity_type, trainingSlot: row.session_slot, rpe: row.rpe, plannedCompletion: row.planned_completion, workoutReference: row.workout_reference, activityMinutes: row.activity_minutes }))
  const heart = buildTrainingHeart({ responses: withLinkedTrainingAmounts(normalized, { workouts, plans, trainingGroup: 'junior', asOf: date }) }, date)
  return { entry, load: heart.load }
}

test('coach 120 minutes automatically supplies time and 600 load without reported time or a minute confirmation', () => {
  for (const planned_completion of [undefined, 'full']) {
    const raw = response({ planned_completion }), before = structuredClone(raw)
    const { entry, load } = calculate([raw])
    assert.equal(entry.reportedMinutes, null)
    assert.equal(entry.estimatedMinutes, 120)
    assert.equal(load.value, 600)
    assert.equal(load.estimated, 1)
    assert.deepEqual(load.gaps, [])
    assert.deepEqual(raw, before)
  }
})

test('time entered in linked planning takes precedence and reaches diary, heart, weekly totals and checkin options', () => {
  const plans = [{ id: 'p', source_workout_id: 'w', plan_date: date, activity_type: 'swim', duration_minutes: 120, target_groups: ['junior'] }]
  for (const duration_minutes of [null, 90]) {
    const workouts = [workout({ duration_minutes })]
    const { entry, load } = calculate([response({ workout_reference: 'workout:w' })], workouts, plans)
    assert.equal(entry.estimatedMinutes, 120)
    assert.equal(load.value, 600)
    const metrics = sessionSwimMetrics({ sessions: [session], responses: [response({ profile_id: 'p' })], workouts, plans, profiles: [{ id: 'p', training_group: 'junior' }] })
    assert.equal(metrics.get(`p|${date}|afternoon_swim`).durationMinutes, 120)
    const [option] = swimWorkoutOptions([{ id: 'w', date, durationMinutes: duration_minutes }], [{ id: 'p', date, activityType: 'swim', sourceWorkoutId: 'w', durationMinutes: 120 }])
    assert.equal(option.durationMinutes, 120)
  }
})

test('two possible 120-minute workouts give 120 once without inventing a choice or adding their distances', () => {
  const workouts = [workout(), workout({ id: 'w2', distance_meters: 4000 })]
  const { entry, load } = calculate([response()], workouts)
  assert.equal(entry.linked, false)
  assert.equal(entry.timeLinked, true)
  assert.equal(entry.workoutChoiceMissing, true)
  assert.equal(entry.estimatedMinutes, 120)
  assert.equal(entry.estimatedMeters, null)
  assert.equal(entry.content, '')
  assert.equal(diaryEntryLoad(entry).value, 600)
  assert.equal(load.value, 600)
  assert.deepEqual(load.gaps, [])
  const metrics = sessionSwimMetrics({ sessions: [session], responses: [], workouts, plans: [], profiles: [{ id: 'p', training_group: 'junior' }] })
  assert.equal(metrics.get(`p|${date}|afternoon_swim`).durationMinutes, 120)
  assert.equal(metrics.get(`p|${date}|afternoon_swim`).distanceMeters, null)
})

test('own time wins; partial/no, invalid selected source and different or unknown durations cannot acquire full common time', () => {
  const alternatives = [workout(), workout({ id: 'w2' })]
  const actual = calculate([response({ activity_minutes: 80, planned_completion: 'partial' })], alternatives)
  assert.equal(actual.entry.estimatedMinutes, null)
  assert.equal(actual.load.value, 400)
  assert.equal(actual.load.reported, 1)
  for (const planned_completion of ['partial', 'no']) assert.equal(calculate([response({ planned_completion })], alternatives).load.value, null)
  assert.equal(calculate([response({ workout_reference: 'workout:removed' })], alternatives).load.value, null)
  for (const duration_minutes of [90, null, 0, 1441]) {
    const result = calculate([response()], [workout(), workout({ id: 'w2', duration_minutes })])
    assert.equal(result.entry.estimatedMinutes, null)
    assert.equal(result.load.value, null)
  }
})

test('linked planning cannot borrow time from a different group/day or a detached or conflicting row', () => {
  const base = { id: 'p', source_workout_id: 'w', plan_date: date, activity_type: 'swim', duration_minutes: 120, target_groups: ['junior'] }
  for (const patch of [{ plan_date: '2026-10-31' }, { target_groups: ['other'] }, { calendar_link: { detachedWorkoutId: 'w' } }]) assert.equal(calculate([response()], [workout({ duration_minutes: null })], [{ ...base, ...patch }]).load.value, null)
  assert.equal(calculate([response()], [workout({ duration_minutes: null })], [base, { ...base, id: 'q', duration_minutes: 90 }]).load.value, null)
  assert.equal(plannedSwimTime(110, [120, 90]), 110)
  assert.equal(commonPlannedSwimTime([120, 120, 120]), 120)
  assert.equal(commonPlannedSwimTime([120]), null)
  const view = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(view, /minuter från tränarens planering räknas automatiskt/)
  assert.match(view, /Du behöver inte fylla i eller bekräfta planerad tid igen/)
})
