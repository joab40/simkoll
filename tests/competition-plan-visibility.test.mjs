import assert from 'node:assert/strict'
import test from 'node:test'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import { planningAddDays, planningMonday } from '../shared/weekly-planning.js'

process.env.SUPABASE_URL = 'https://competition-visibility.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-only'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'

const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { stockholmDate } = await import('../server/profile-auth.js')

const roleCode = createCoachToken({ id: 'fixture-coach', role: 'coach' })
const profileId = '11111111-1111-4111-8111-111111111111'
const calendarId = '22222222-2222-4222-8222-222222222222'
const linkedId = '33333333-3333-4333-8333-333333333333'
const importedId = '44444444-4444-4444-8444-444444444444'
const today = stockholmDate()
const monday = planningMonday(today)
const json = value => new Response(JSON.stringify(value))

async function call({ method = 'GET', query, body, swimmer = false }) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({
    method, query, body,
    headers: swimmer ? { cookie: 'simkoll_session=fixture', 'x-simkoll-code': 'swimmer-fixture' } : { 'x-simkoll-code': roleCode },
  }, response)
  return response
}

test('hide and restore a selected competition card for both views without changing the calendar or other cards', async t => {
  const competition = { id: calendarId, title: 'USM Region', target_groups: ['junior'], entries_open: true }
  const common = { plan_date: monday, activity_type: 'competition', title: 'USM Region', target_groups: ['junior'] }
  const plans = [
    { ...common, id: linkedId, source_competition_id: calendarId, competition_calendar: competition },
    { ...common, id: importedId, time_of_day: 'afternoon' },
    { ...common, id: 'another-date', plan_date: planningAddDays(monday, 1), source_competition_id: calendarId, competition_calendar: competition },
    { ...common, id: 'swim', activity_type: 'swim' },
  ]
  let writes = 0
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1), params = url.searchParams
    if (options.method === 'PATCH') {
      assert.equal(table, 'training_plans')
      assert.equal(params.get('activity_type'), 'eq.competition')
      assert.equal(params.get('source_workout_id'), 'is.null')
      assert.equal(options.headers.Prefer, 'return=representation')
      const plan = plans.find(item => params.get('id') === `eq.${item.id}`)
      const change = JSON.parse(options.body)
      assert.deepEqual(Object.keys(change), ['hidden_from_weekly_planning'])
      writes += 1
      return json(plan ? [Object.assign(plan, change)] : [])
    }
    assert.ok(!options.method || options.method === 'GET')
    if (table === 'training_plans') return json(plans)
    if (table === 'competition_calendar') return json([competition])
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'app_settings') return json([{ setting_value: {} }])
    assert.ok(['responses', 'sportadmin_hidden_activities', 'daily_workouts', 'training_cycles', 'workout_unlocks', 'planning_week_types'].includes(table), table)
    return json([])
  })

  const visibility = (id, hidden, swimmer = false) => call({ method: 'POST', body: { action: 'set-competition-plan-visibility', id, hidden }, swimmer })
  const coachWeek = () => call({ query: { planning: 'true' } })
  const swimmerWeek = () => call({ query: { planningWeek: monday }, swimmer: true })

  assert.equal((await visibility(linkedId, true, true)).code, 403)
  assert.equal((await visibility('invalid', true)).code, 400)
  assert.equal((await visibility(linkedId, 'true')).code, 400)
  assert.equal(writes, 0)
  assert.equal((await visibility(linkedId, true)).data.plan.hiddenFromWeeklyPlanning, true)
  const coach = await coachWeek()
  assert.deepEqual(coach.data.plans.map(item => item.id), [importedId, 'another-date', 'swim'])
  assert.deepEqual(coach.data.hiddenCompetitionPlans.map(item => item.id), [linkedId])
  const swimmer = await swimmerWeek()
  assert.deepEqual(swimmer.data.plans.map(item => item.id), [importedId, 'another-date', 'swim'])
  assert.equal(swimmer.data.hiddenCompetitionPlans, undefined)

  assert.equal((await visibility(importedId, true)).code, 200)
  assert.deepEqual((await swimmerWeek()).data.plans.map(item => item.id), ['another-date', 'swim'])
  const calendar = await call({ query: { calendar: 'true' }, swimmer: true })
  assert.equal(calendar.data.competitions[0].entriesOpen, true)

  assert.equal((await visibility(linkedId, false)).code, 200)
  assert.deepEqual((await coachWeek()).data.hiddenCompetitionPlans.map(item => item.id), [importedId])
  assert.deepEqual((await swimmerWeek()).data.plans.map(item => item.id), [linkedId, 'another-date', 'swim'])
})
