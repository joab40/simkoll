import test from 'node:test'
import assert from 'node:assert/strict'
import { publicWorkout } from '../api/workouts.js'

const workout = {
  id: 'workout-1',
  workout_date: '2026-10-15',
  title: 'Sprint och starter',
  content: '8x25 max\n4x50 starter',
  note: 'Håll full vila mellan loppen.',
  focus: 'sprint',
  distance_meters: 4200,
  duration_minutes: 120,
  time_of_day: 'afternoon',
  target_groups: ['junior'],
  updated_at: '2026-10-15T10:00:00.000Z',
}

test('planning summary keeps useful metadata but omits locked workout details', () => {
  const summary = publicWorkout(workout, { includeDetails: false })
  assert.equal(summary.title, 'Sprint och starter')
  assert.equal(summary.focus, 'sprint')
  assert.equal(summary.distanceMeters, 4200)
  assert.equal(summary.durationMinutes, 120)
  assert.equal('content' in summary, false)
  assert.equal('note' in summary, false)
})

test('unlocked daily workout includes series and coach comment', () => {
  const detailed = publicWorkout(workout)
  assert.equal(detailed.content, '8x25 max\n4x50 starter')
  assert.equal(detailed.note, 'Håll full vila mellan loppen.')
})
