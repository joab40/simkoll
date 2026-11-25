import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarActivityKey } from '../shared/planning-calendar.js'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'

process.env.SUPABASE_URL = 'https://coach-planning.invalid'
process.env.SUPABASE_SECRET_KEY = 'planning-test'
process.env.SIMKOLL_SWIMMER_CODE = 'planning-swimmer'
const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')

const week = '2026-11-23'
const day = '2026-11-24'
const end = '2026-11-29'
const coach = createCoachToken({ id: '11111111-1111-4111-8111-111111111111', role: 'coach' }, 600)
const json = data => new Response(JSON.stringify(data))

async function read(query, code = coach) {
  const response = {
    setHeader() {},
    status(status) { this.code = status; return this },
    json(data) { this.data = data; return this },
  }
  await coachSessionFixture(handler)({ method: 'GET', query, headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' } }, response)
  return response
}

test('coach week reads two date-scoped tables without calendar requests or backfilling', async t => {
  const reads = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const { pathname, searchParams } = new URL(raw)
    const table = pathname.split('/').at(-1)
    assert.ok(!options.method || options.method === 'GET')
    reads.push(table)
    if (table === 'profile_sessions') return json([{ profile_id: 'swimmer' }])
    if (table === 'profiles') return json([{ id: 'swimmer', training_group: 'junior' }])
    if (table === 'training_plans') {
      assert.deepEqual(searchParams.getAll('plan_date'), [`gte.${week}`, `lte.${end}`])
      return json([
        { id: 'base', plan_date: day, activity_type: 'swim', title: 'Grundplan', target_groups: ['junior'] },
        { id: 'deleted', plan_date: day, activity_type: 'swim', source_workout_id: 'deleted-workout' },
        { id: 'detached', plan_date: day, activity_type: 'swim', calendar_link: { detachedWorkoutId: 'unlinked' } },
        { id: 'race', plan_date: end, activity_type: 'competition', hidden_from_weekly_planning: true },
      ])
    }
    assert.equal(table, 'daily_workouts')
    assert.deepEqual(searchParams.getAll('workout_date'), [`gte.${week}`, `lte.${end}`])
    return json([{ id: 'unlinked', workout_date: day, title: 'Publicerat pass', content: '4 × 100', note: 'Ta med fenor' }])
  })
  assert.equal((await read({ coachPlanningWeek: week }, 'planning-swimmer')).code, 403)
  reads.length = 0
  assert.equal((await read({ coachPlanningWeek: day })).code, 400)
  assert.deepEqual(reads, [])
  const result = await read({ coachPlanningWeek: week })
  assert.equal(result.code, 200)
  assert.deepEqual(reads.sort(), ['daily_workouts', 'training_plans'])
  assert.deepEqual(result.data.plans.map(plan => plan.id), ['base', 'race'])
  assert.equal(result.data.plans[1].hiddenFromWeeklyPlanning, true)
  assert.deepEqual(result.data.workouts.map(workout => [workout.id, workout.content, workout.note]), [['unlinked', '4 × 100', 'Ta med fenor']])
})

test('coach calendar is scoped by week and keeps visible events when another feed fails', async t => {
  const hidden = { date: day, time: '17:00', title: 'Dold träning', uid: 'hidden', calendarId: 'junior', targetGroups: ['junior'] }
  const icsEvent = (date, title, uid) => ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART:${date.replaceAll('-', '')}T170000`, `SUMMARY:${title}`, 'END:VEVENT']
  t.mock.method(globalThis, 'fetch', async raw => {
    const url = new URL(raw)
    const table = url.pathname.split('/').at(-1)
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [
      { id: 'junior', url: 'https://feed.invalid/junior', groups: ['junior'] },
      { id: 'failed', url: 'https://feed.invalid/failed', groups: ['ungdom_svart'] },
    ] } }])
    if (table === 'sportadmin_hidden_activities') {
      assert.deepEqual(url.searchParams.getAll('event_date'), [`gte.${week}`, `lte.${end}`])
      return json([{ calendar_key: calendarActivityKey(hidden), snapshot: hidden, hidden_at: '2026-11-23T11:00:00Z' }])
    }
    if (table === 'junior') return new Response(['BEGIN:VCALENDAR', ...icsEvent(day, hidden.title, hidden.uid),
      ...icsEvent(end, 'Synlig träning', 'visible'), ...icsEvent('2026-11-30', 'Nästa vecka', 'next'), 'END:VCALENDAR'].join('\n'))
    if (table === 'failed') return new Response(null, { status: 503 })
    assert.fail(`Unexpected read: ${raw}`)
  })
  const result = await read({ planningCalendar: week })
  assert.equal(result.code, 200)
  assert.equal(result.data.incomplete, true)
  assert.deepEqual(result.data.sportAdminActivities.map(item => item.title), ['Synlig träning'])
  assert.deepEqual(result.data.hiddenCalendarActivities.map(item => item.title), ['Dold träning'])
})
