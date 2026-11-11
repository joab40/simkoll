import test from 'node:test'
import assert from 'node:assert/strict'
import { linkedWorkoutForPlan } from '../shared/planning-workout-link.js'

const date = '2026-11-10'
const workouts = [
  { id: 'early', date, timeOfDay: 'afternoon', distanceMeters: 5200, focus: 'f2_spec', targetGroups: ['junior'] },
  { id: 'late', date, timeOfDay: 'afternoon', distanceMeters: 4700, focus: 'f2_spec', targetGroups: ['junior'] },
]
test('calendar edits retain the exact workout even when plan amounts are stale', () => {
  const plan = { sourceWorkoutId: 'late', activityType: 'swim', date, distanceMeters: 5200, timeOfDay: 'afternoon', focus: 'f2_spec' }
  assert.equal(linkedWorkoutForPlan(plan, workouts, date).id, 'late')
  assert.equal(linkedWorkoutForPlan({ ...plan, sourceWorkoutId: 'removed' }, workouts, date), null)
  assert.equal(linkedWorkoutForPlan(plan, workouts, '2026-11-11'), null)
})
test('calendar foundations and ambiguous legacy plans never borrow a workout', () => {
  const plan = { activityType: 'swim', date, timeOfDay: 'afternoon', targetGroups: ['junior'] }
  assert.equal(linkedWorkoutForPlan(plan, workouts, date), null)
  assert.equal(linkedWorkoutForPlan({ ...plan, calendarLink: { mode: 'linked', time: '17:00' } }, [workouts[0]], date), null)
  assert.equal(linkedWorkoutForPlan(plan, [workouts[0]], date).id, 'early')
})
