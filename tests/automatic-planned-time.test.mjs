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
  for (const planned_completion of [undefined, 'full', 'partial']) {
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

test('own time wins; no, invalid selected source and different or unknown durations cannot acquire common time', () => {
  const alternatives = [workout(), workout({ id: 'w2' })]
  const actual = calculate([response({ activity_minutes: 80, planned_completion: 'partial' })], alternatives)
  assert.equal(actual.entry.estimatedMinutes, null)
  assert.equal(actual.load.value, 400)
  assert.equal(actual.load.reported, 1)
  const partial = calculate([response({ planned_completion: 'partial' })], alternatives)
  assert.equal(partial.load.value, 600)
  assert.equal(partial.entry.estimatedMinutes, 120)
  assert.equal(partial.entry.estimatedMeters, null)
  assert.equal(calculate([response({ planned_completion: 'no' })], alternatives).load.value, null)
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

test('partial content uses coach time across diary, heart and weekly totals, never full distance', () => {
  const workouts = [workout(), workout({ id: 'alternative', duration_minutes: 90, distance_meters: 4000 })]
  const raw = response({ profile_id: 'p', planned_completion: 'partial', workout_reference: 'workout:w' })
  const before = structuredClone(raw)
  const { entry, load } = calculate([raw], workouts)
  assert.equal(entry.partial, true)
  assert.equal(entry.estimatedMinutes, 120)
  assert.equal(entry.reportedMinutes, null)
  assert.equal(entry.estimatedMeters, null)
  assert.equal(diaryEntryLoad(entry).value, 600)
  assert.equal(load.estimatedValue, 600)
  assert.equal(load.missingTime, 0)
  const metrics = rows => sessionSwimMetrics({ sessions: [session], responses: rows, workouts,
    plans: [], profiles: [{ id: 'p', training_group: 'junior' }] }).get(`p|${date}|afternoon_swim`)
  assert.deepEqual(metrics([raw]), { durationMinutes: 120, distanceMeters: null })
  assert.deepEqual(metrics([{ ...raw, activity_minutes: 65, activity_distance_meters: 2000 }]), { durationMinutes: 65, distanceMeters: 2000 })
  assert.deepEqual(raw, before)
  assert.equal(calculate([{ ...raw, rpe: null }], workouts).load.value, null)
  assert.equal(calculate([{ ...raw, rpe: null }], workouts).load.missingTime, 0)
  for (const patch of [{ workout_reference: 'workout:removed' }, { session_slot: 'morning_swim' }]) {
    assert.equal(calculate([{ ...raw, ...patch }], workouts).load.value, null)
  }
})

test('historical partial answers restore comparison coverage without changing the thresholds or raw answers', () => {
  // Synthetic regression for the 4/6-report pattern, not real swimmer data.
  const dates = ['2026-10-28', '2026-10-29', '2026-10-30', date,
    '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25', '2026-10-24']
  const rows = dates.map((activity_date, i) => response({ id: `r${i}`, activity_date,
    created_at: `${activity_date}T18:00:00Z`,
    planned_completion: [1, 2, 6, 8, 9].includes(i) ? 'partial' : 'full' }))
  const workouts = dates.filter(day => day !== '2026-10-21').map((workout_date, i) => workout({id: `w${i}`, workout_date}))
  const before = structuredClone(rows)
  const { load } = calculate(rows, workouts)
  assert.equal(load.known, 4)
  assert.equal(load.total, 4)
  assert.equal(load.previous.known, 5)
  assert.equal(load.previous.total, 6)
  assert.equal(load.previous.missingTime, 1)
  assert.notEqual(load.ring, 'unknown')
  assert.deepEqual(rows, before)
})
