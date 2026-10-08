import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantSwimSlot, buildAssistantSwimCalendar } from '../server/assistant-schedule.js'

test('normalizes published session times to swimmer planning slots', () => {
  assert.equal(assistantSwimSlot('morning'), 'morning_swim')
  assert.equal(assistantSwimSlot('afternoon'), 'afternoon_swim')
  assert.equal(assistantSwimSlot('07:30'), 'morning_swim')
  assert.equal(assistantSwimSlot('17:00'), 'afternoon_swim')
  assert.equal(assistantSwimSlot(''), null)
})

test('shows all published swims and flags only the slots personally planned by swimmer', () => {
  const calendar = buildAssistantSwimCalendar({
    workouts: [
      { id: 'morning', workout_date: '2026-10-12', time_of_day: 'morning', title: 'Morgonpass' },
      { id: 'afternoon', workout_date: '2026-10-12', time_of_day: 'afternoon', title: 'Eftermiddagspass' },
    ],
    plans: [],
    plannedSessions: [{ planned_date: '2026-10-12', session_slot: 'afternoon_swim' }],
  })

  assert.equal(calendar.length, 2)
  assert.deepEqual(calendar.map(({ title, slot, plannedBySwimmer }) => ({ title, slot, plannedBySwimmer })), [
    { title: 'Morgonpass', slot: 'morning_swim', plannedBySwimmer: false },
    { title: 'Eftermiddagspass', slot: 'afternoon_swim', plannedBySwimmer: true },
  ])
})

test('does not double-count a training plan linked to an already listed workout', () => {
  const calendar = buildAssistantSwimCalendar({
    workouts: [{ id: 'workout-1', workout_date: '2026-10-12', time_of_day: 'afternoon', title: 'Eftermiddagspass' }],
    plans: [{ id: 'plan-1', source_workout_id: 'workout-1', plan_date: '2026-10-12', time_of_day: 'afternoon', activity_type: 'swim', title: 'Eftermiddagspass' }],
    plannedSessions: [],
  })

  assert.equal(calendar.length, 1)
})
