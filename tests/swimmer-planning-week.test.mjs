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
  let unlocked = false, previousStatus = null
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
    if (table === 'responses') {
      assert.equal(params.get('profile_id'), `eq.${profileId}`)
      assert.equal(params.get('activity_date'), `eq.${planningAddDays(today, -1)}`)
      return json(previousStatus ? [{ day_type: previousStatus }] : [])
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
  assert.equal(reads.length, 7)
  unlocked = true
  assert.equal((await call({ planningWeek: monday })).data.plans[0].notes, 'Workout instructions')
  previousStatus = 'before'
  const pending = await call({ planningWeek: monday })
  assert.equal(pending.data.followUpDate, planningAddDays(today, -1))
  assert.equal(pending.data.plans[0].notes, '')
  previousStatus = 'rest'
  assert.equal((await call({ planningWeek: monday })).data.locked, false)
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

test('opening a published workout requires a matching group and the swimmer’s own unlock on that date', async t => {
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const date = planningAddDays(today, -1)
  const workout = { id, workout_date: date, target_groups: ['junior'], content: '4 × 100 m' }
  let unlocked = false, unlockReads = 0
  t.mock.method(globalThis, 'fetch', async raw => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'daily_workouts') {
      assert.equal(url.searchParams.get('id'), `eq.${id}`)
      return json([workout])
    }
    assert.equal(table, 'workout_unlocks')
    assert.equal(url.searchParams.get('workout_date'), `eq.${workout.workout_date}`)
    assert.equal(url.searchParams.get('profile_id'), `eq.${profileId}`)
    unlockReads++
    return json(unlocked ? [{ profile_id: profileId }] : [])
  })
  const query = { planningWorkout: id }
  assert.equal((await call(query, '')).code, 403)
  assert.equal((await call({ planningWorkout: 'bad-id' })).code, 400)
  const locked = await call(query)
  assert.equal(locked.code, 403)
  assert.equal(locked.data.workout, undefined)
  unlocked = true
  assert.equal((await call(query)).data.workout.content, '4 × 100 m')
  workout.workout_date = planningAddDays(today, 1)
  assert.equal((await call(query)).code, 403)
  workout.workout_date = date
  workout.target_groups = ['ungdom_svart']
  assert.equal((await call(query)).code, 404)
  assert.equal(unlockReads, 2)
})

test('both routes to today’s workout withhold details until yesterday is completed', async t => {
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  let previous = 'before', checkedInToday = true
  t.mock.method(globalThis, 'fetch', async raw => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'daily_workouts') return json([{ id, workout_date: today, title: 'Dagens fartpass', distance_meters: 3300, content: 'Secret sets', note: 'Secret note' }])
    if (table === 'responses') {
      assert.equal(url.searchParams.get('activity_date'), `eq.${planningAddDays(today, -1)}`)
      assert.equal(url.searchParams.get('profile_id'), `eq.${profileId}`)
      return json([{ day_type: previous }])
    }
    if (table === 'workout_unlocks') return json(checkedInToday ? [{ profile_id: profileId }] : [])
    assert.ok(['profile_daily_activity', 'point_events'].includes(table), table)
    return json([])
  })
  const gated = await call({})
  assert.equal(gated.data.followUpDate, planningAddDays(today, -1))
  assert.equal(gated.data.workout.title, 'Dagens fartpass')
  assert.equal(gated.data.workout.content, undefined)
  assert.equal(gated.data.workouts[0].note, undefined)
  assert.equal((await call({ planningWorkout: id })).code, 403)
  for (const type of ['after', 'rest', 'sick']) {
    previous = type
    assert.equal((await call({})).data.workout.content, 'Secret sets')
    assert.equal((await call({ planningWorkout: id })).data.workout.note, 'Secret note')
  }
  checkedInToday = false
  assert.equal((await call({})).data.locked, true)
})
