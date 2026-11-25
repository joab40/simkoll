import assert from 'node:assert/strict'
import test from 'node:test'
import { planningAddDays, planningMonday } from '../shared/weekly-planning.js'

process.env.SUPABASE_URL = 'https://weekly-planning.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-only'
process.env.SIMKOLL_SWIMMER_CODE = 'planning-fixture'
const { default: handler } = await import('../api/workouts.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const today = stockholmDate()
const monday = planningMonday(today)
const sunday = planningAddDays(monday, 6)
const profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const json = data => new Response(JSON.stringify(data))

async function call(query, cookie = 'simkoll_session=fixture') {
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  await handler({ method: 'GET', query, headers: { cookie, 'x-simkoll-code': 'planning-fixture' } }, response)
  return response
}

test('swimmer week reads only selected-week metadata and its own week type without waiting on calendars', async t => {
  let unlocked = false
  const reads = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    assert.ok(!options.method || options.method === 'GET', 'opening planning must be read-only')
    const url = new URL(raw), table = url.pathname.split('/').at(-1), params = url.searchParams
    reads.push(table)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'training_plans') {
      assert.deepEqual(params.getAll('plan_date'), [`gte.${monday}`, `lte.${sunday}`])
      return json([
        { id: 'own', plan_date: today, activity_type: 'swim', source_workout_id: 'own-pass', target_groups: ['junior'], notes: 'Workout instructions' },
        { id: 'deleted', plan_date: today, activity_type: 'swim', source_workout_id: 'deleted-pass', target_groups: ['junior'] },
        { id: 'other', plan_date: today, activity_type: 'swim', target_groups: ['ungdom_svart'] },
        { id: 'race', plan_date: sunday, activity_type: 'competition', source_competition_id: 'competition', competition_calendar: { target_groups: ['ungdom_svart'], participant_overrides: { [profileId]: true } } },
      ])
    }
    if (table === 'daily_workouts') {
      assert.deepEqual(params.getAll('workout_date'), [`gte.${monday}`, `lte.${sunday}`])
      assert.doesNotMatch(params.get('select'), /\*|content|note/)
      return json([
        { id: 'own-pass', workout_date: today, target_groups: ['junior'], content: 'Private instructions' },
        { id: 'other-pass', workout_date: today, target_groups: ['ungdom_svart'] },
      ])
    }
    if (table === 'workout_unlocks') {
      assert.equal(params.get('profile_id'), `eq.${profileId}`)
      return json(unlocked ? [{ profile_id: profileId }] : [])
    }
    if (table === 'planning_week_types') {
      assert.equal(params.get('week_start'), `eq.${monday}`)
      assert.equal(params.get('group_id'), 'eq.junior')
      return json([{ week_type: 'taper' }])
    }
    assert.fail(`Unexpected read: ${raw}`)
  })
  assert.equal((await call({ planningWeek: monday }, '')).code, 403)
  assert.equal((await call({ planningWeek: planningAddDays(monday, 1) })).code, 400)
  reads.length = 0
  const result = await call({ planningWeek: monday })
  assert.equal(result.code, 200)
  assert.deepEqual(result.data.plans.map(item => item.id), ['own', 'race'])
  assert.deepEqual(result.data.workouts.map(item => item.id), ['own-pass'])
  assert.equal(result.data.workouts[0].content, undefined)
  assert.equal(result.data.locked, true)
  assert.equal(result.data.plans[0].notes, '')
  assert.equal(result.data.weekType, 'taper')
  assert.equal(reads.length, 6)
  unlocked = true
  assert.equal((await call({ planningWeek: monday })).data.plans[0].notes, 'Workout instructions')
})

test('optional calendar keeps visible events for the requested week when another feed fails', async t => {
  const icsDate = date => date.replaceAll('-', '')
  const event = (date, title) => [ 'BEGIN:VEVENT', `UID:${title}`, `DTSTART:${icsDate(date)}T170000`, `SUMMARY:${title}`, 'END:VEVENT' ]
  t.mock.method(globalThis, 'fetch', async raw => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [
      { id: 'one', url: 'https://calendar.invalid/live', groups: ['junior'] },
      { id: 'two', url: 'https://calendar.invalid/failed', groups: ['junior'] },
    ] } }])
    if (table === 'live') return new Response(['BEGIN:VCALENDAR', ...event(monday, 'Junior övning'),
      ...event(sunday, 'Ungdom orange'), ...event(planningAddDays(monday, -1), 'Tidigare vecka'), 'END:VCALENDAR'].join('\n'))
    if (table === 'failed') return new Response(null, { status: 503 })
    if (table === 'sportadmin_hidden_activities') return json([])
    assert.fail(`Unexpected read: ${raw}`)
  })
  const result = await call({ planningCalendar: monday })
  assert.equal(result.code, 200)
  assert.equal(result.data.incomplete, true)
  assert.deepEqual(result.data.sportAdminActivities.map(item => item.title), ['Junior övning'])
})
