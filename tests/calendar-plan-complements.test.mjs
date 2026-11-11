import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calendarPlanComplements, sameCalendarTraining } from '../shared/calendar-plan-complements.js'
import { groupSwimOccasions, planningAmountRange, swimWorkoutOptions } from '../shared/swim-workout-options.js'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { buildPeriodization } from '../shared/periodization.js'
import { withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { deduplicatePlannedActivities } from '../server/planned-activities.js'

const date = '2026-11-09', groups = ['junior', 'ungdom_svart', 'ungdom_orange']
const calendar = { mode: 'linked', key: 'junior-event', keys: ['junior-event', 'svart-event'], date, time: '17:00', location: 'Himlabadet' }
const base = (extra = {}) => ({ id: 'base', plan_date: date, activity_type: 'swim', title: 'Återhämtning', focus: 'recovery', distance_meters: 3500, duration_minutes: 120, time_of_day: 'afternoon', target_groups: groups, calendar_link: calendar, alternative_group_id: 'excel-import', ...extra })
const linked = (extra = {}) => ({ ...base(), id: 'linked', title: 'Träningspass Återhämtning', source_workout_id: 'published', alternative_group_id: 'workout-import', ...extra })
const workout = (extra = {}) => ({ id: 'published', workout_date: date, title: 'Träningspass Återhämtning', content: 'Insim och huvudserie', focus: 'recovery', distance_meters: 3500, duration_minutes: 120, time_of_day: 'afternoon', target_groups: groups, alternative_group_id: 'workout-import', ...extra })
const mapped = row => ({ id: row.id, date: row.plan_date || row.workout_date, activityType: row.activity_type || 'swim', title: row.title, focus: row.focus, distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes, timeOfDay: row.time_of_day, targetGroups: row.target_groups, calendarLink: row.calendar_link, sourceWorkoutId: row.source_workout_id, alternativeGroupId: row.alternative_group_id, time: row.calendar_link?.time, location: row.calendar_link?.location })

test('calendar identity joins different titles and import IDs without altering original rows', () => {
  const rows = [base(), linked()], before = structuredClone(rows)
  const result = calendarPlanComplements(rows)
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].id, 'linked')
  assert.equal(result.rows[0].foundationPlans[0].id, 'base')
  assert.deepEqual(rows, before)
  assert.equal(calendarPlanComplements(rows.map(mapped)).rows.length, 1)
  assert.equal(calendarPlanComplements(rows, { workoutIds: new Set() }).rows.length, 2, 'a missing publication cannot suppress the base plan')
})
test('different events, dates, start times, locations, types, absent links and detachment stay separate', () => {
  for (const patch of [
    { plan_date: '2026-11-10' }, { activity_type: 'strength' },
    { calendar_link: { ...calendar, key: 'other', keys: ['other'] } },
    { calendar_link: { ...calendar, time: '19:00' } }, { calendar_link: { ...calendar, location: 'Annat bad' } },
    { calendar_link: { ...calendar, date: '2026-11-08' } },
    { calendar_link: { mode: 'none' } }, { calendar_link: null },
    { calendar_link: { ...calendar, detachedWorkoutId: 'published' } },
  ]) assert.equal(calendarPlanComplements([base(patch), linked()]).rows.length, 2, JSON.stringify(patch))
  assert.equal(sameCalendarTraining(base(), linked({ calendar_link: { ...calendar, location: ' himlabadet ' } })), true)
})
test('partial group publication keeps remaining groups and their editable original, never borrows other groups', () => {
  const result = calendarPlanComplements([base(), linked({ target_groups: ['junior'] })]).rows
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].target_groups, ['ungdom_svart', 'ungdom_orange'])
  assert.deepEqual(result[0].foundationOriginal.target_groups, groups)
  assert.equal(calendarPlanComplements([base({ target_groups: ['ungdom_svart'] }), linked({ target_groups: ['junior'] })]).rows.length, 2)
  assert.equal(calendarPlanComplements([base({ target_groups: [] }), linked({ target_groups: ['junior'] })]).rows.length, 2)
})
test('planning and check-in show only the actual pass and count 3500m once, not 7000m', () => {
  const plans = [base(), linked()].map(mapped), workouts = [mapped(workout())]
  const options = swimWorkoutOptions(workouts, plans)
  assert.equal(options.length, 1); assert.equal(options[0].workoutReference, 'workout:published')
  assert.equal(groupSwimOccasions(options).length, 1)
  assert.deepEqual(planningAmountRange(options, 'distanceMeters'), { min: 3500, max: 3500 })
  assert.deepEqual(planningAmountRange(options, 'durationMinutes'), { min: 120, max: 120 })
  const activities = deduplicatePlannedActivities({ plans: [base(), linked()], workouts: [workout()], from: date, to: '2026-11-10' })
  assert.equal(activities.length, 1)
})
test('a changed publication supplies its own amount, while explicit historical base-plan choice is preserved', () => {
  const w = workout({ distance_meters: 3200, duration_minutes: 100 }), plans = [base(), linked({ distance_meters: 3200, duration_minutes: 100 })]
  const report = { id: 'answer', activity_date: date, created_at: `${date}T19:00Z`, day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim', planned_completion: 'full', rpe: 5 }
  const [entry] = buildDiaryEntries({ responses: [report], workouts: [w], plans, trainingGroup: 'junior', today: date })
  assert.equal(entry.estimatedMeters, 3200); assert.equal(entry.estimatedMinutes, 100)
  assert.equal(buildPeriodization([entry], date).macro.at(-1).meters, 3200)
  const [historical] = buildDiaryEntries({ responses: [{ ...report, workout_reference: 'plan:base' }], workouts: [w], plans, trainingGroup: 'junior', today: date })
  assert.equal(historical.estimatedMeters, 3500); assert.equal(historical.estimatedMinutes, 120)
  const [heart] = withLinkedTrainingAmounts([{ id: 'answer', date, createdAt: `${date}T19:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', plannedCompletion: 'full', rpe: 5 }], { workouts: [w], plans, trainingGroup: 'junior', asOf: date })
  assert.equal(heart.linkedEstimate.minutes, 100)
})
test('real alternatives remain distinct choices in one occasion and never gain an extra base option', () => {
  const workouts = [workout(), workout({ id: 'second', distance_meters: 4000 })]
  const plans = [base(), linked(), linked({ id: 'second-plan', source_workout_id: 'second', distance_meters: 4000 })]
  const options = swimWorkoutOptions(workouts.map(mapped), plans.map(mapped))
  assert.equal(options.length, 2); assert.equal(groupSwimOccasions(options).length, 1)
  assert.deepEqual(planningAmountRange(options, 'distanceMeters'), { min: 3500, max: 4000 })
  const [entry] = buildDiaryEntries({ sessions: [{ session_date: date, session_slot: 'afternoon_swim', activity_type: 'swim' }], workouts, plans, trainingGroup: 'junior', today: date })
  assert.equal(entry.estimatedMeters, null, 'no selection must not invent a sum or pick an alternative')
})
test('two calendar trainings each consume their own foundation even with an old shared alternative ID', () => {
  const evening = { ...calendar, key: 'evening', keys: ['evening'], time: '19:00' }
  const rows = [base(), base({ id: 'evening-base', calendar_link: evening, title: 'Bröstsim–Medley' }),
    linked(), linked({ id: 'evening-plan', source_workout_id: 'evening-workout', calendar_link: evening })]
  const projection = calendarPlanComplements(rows).rows
  assert.equal(projection.length, 2)
  assert.deepEqual(projection.map(row => row.foundationPlans.map(plan => plan.id)), [['base'], ['evening-base']])
  const workouts = [workout(), workout({ id: 'evening-workout' })].map(mapped)
  const options = swimWorkoutOptions(workouts, rows.map(mapped))
  assert.equal(options.length, 2)
  assert.deepEqual(groupSwimOccasions(options).map(occasion => [occasion.time, occasion.items.length]), [['17:00', 1], ['19:00', 1]])
  assert.deepEqual(planningAmountRange(options, 'distanceMeters'), { min: 7000, max: 7000 })
  assert.deepEqual(planningAmountRange(options, 'durationMinutes'), { min: 240, max: 240 })
})
test('all consumers share the same projection, coach can edit original foundation without deleting it', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.equal((main.match(/calendarPlanComplements\(/g) || []).length, 2)
  assert.match(main, /<PlanningFoundation plans=\{plan\?\.foundationPlans\}/)
  const foundation = readFileSync(new URL('../src/planning-foundation.jsx', import.meta.url), 'utf8')
  assert.match(foundation, /Grundplanering · kompletterad med upplagt pass/)
  assert.match(foundation, /renderEditor\?\.\(base\)/)
  assert.match(main, /editingPlan = plan\?\.foundationOriginal \|\| plan/)
  const source = readFileSync(new URL('../shared/calendar-plan-complements.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\(|supabaseRequest|DELETE|PATCH|POST/)
})
