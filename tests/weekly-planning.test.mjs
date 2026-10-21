import test from 'node:test'
import assert from 'node:assert/strict'
import { planningWeekStart, planningDates } from '../shared/weekly-planning.js'

process.env.SUPABASE_URL = 'https://weekly-planning-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'planning-swimmer'
const { default: handler } = await import('../api/training.js')

test('planning window includes next Sunday but excludes past, invalid and later dates', () => {
  const today = '2026-10-21'
  assert.equal(planningWeekStart(today, today), '2026-10-19')
  assert.equal(planningWeekStart('2026-10-25', today), '2026-10-19')
  assert.equal(planningWeekStart('2026-10-26', today), '2026-10-26')
  assert.equal(planningWeekStart('2026-11-01', today), '2026-10-26')
  for (const date of ['2026-10-20', '2026-11-02', '2026-02-30', '2026-10-32', '']) assert.equal(planningWeekStart(date, today), null)
})

test('next-week dates remain correct across New Year and Swedish daylight saving change', () => {
  assert.deepEqual(planningDates('2026-12-31', 1), ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10'])
  assert.equal(planningWeekStart('2027-01-10', '2026-12-31'), '2027-01-04')
  assert.deepEqual(planningDates('2026-10-21', 1), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
})

const profileId = '11111111-1111-4111-8111-111111111111'
const json = (value) => new Response(JSON.stringify(value), { status: 200 })
function fixture() {
  const plans = [], awards = new Set(), requests = []
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), path = parsed.pathname.split('/rest/v1/')[1], query = parsed.searchParams
    requests.push({ path, options, query })
    if (path === 'profile_sessions') return json([{ profile_id: profileId }])
    if (path === 'profiles') return json([{ id: profileId, active: true, approval_status: 'approved' }])
    if (path === 'planned_training_sessions') {
      if (options.method === 'POST') { const row = JSON.parse(options.body); plans.push(row); return json([row]) }
      if (options.method === 'DELETE') { for (let i = plans.length - 1; i >= 0; i--) if (`eq.${plans[i].planned_date}` === query.get('planned_date')) plans.splice(i, 1); return json([]) }
      return json(plans.filter((row) => !query.has('week_start') || `eq.${row.week_start}` === query.get('week_start')))
    }
    if (path === 'point_events') {
      if (options.method === 'POST') { awards.add(JSON.parse(options.body).source_key); return json([]) }
      return json(awards.has(query.get('source_key')?.slice(3)) ? [{ id: 'awarded' }] : [])
    }
    if (path === 'artifact_catalog') return json([])
    if (['season_swim_goals', 'cross_training_goals', 'personal_training_sessions', 'program_assignments', 'training_programs', 'program_goals', 'responses', 'daily_workouts', 'strength_program_logs'].includes(path)) return json([])
    throw new Error(`Unexpected fixture path: ${path}`)
  }
  return { plans, awards, requests }
}
async function call(body, method = 'POST') {
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method, query: {}, body, headers: { 'x-simkoll-code': 'planning-swimmer', cookie: 'simkoll_session=fixture' } }, res)
  return res
}

test('next-week planning saves the correct Monday, reads back and awards once per target week', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-21T10:00:00Z') })
  const data = fixture()
  for (const date of ['2026-10-26', '2026-10-27', '2026-10-28']) {
    const result = await call({ action: 'toggle-plan', date, slot: 'afternoon_swim', planned: true, profileId: 'someone-else' })
    assert.equal(result.code, 200)
  }
  assert.ok(data.plans.every((row) => row.profile_id === profileId && row.week_start === '2026-10-26'))
  assert.deepEqual([...data.awards], [`planning:${profileId}:2026-10-26`])
  const loaded = await call(null, 'GET')
  assert.equal(loaded.code, 200)
  assert.equal(loaded.data.plannedSessions.length, 3)
  const read = data.requests.findLast((item) => item.path === 'planned_training_sessions')
  assert.deepEqual(read.query.getAll('planned_date'), ['gte.2026-10-19', 'lt.2026-11-02'])
  const deleted = await call({ action: 'toggle-plan', date: '2026-10-28', slot: 'afternoon_swim', planned: false })
  assert.equal(deleted.code, 200)
  assert.equal(data.plans.length, 2)
  await call({ action: 'toggle-plan', date: '2026-10-28', slot: 'afternoon_swim', planned: true })
  assert.equal(data.requests.filter((item) => item.path === 'point_events' && item.options.method === 'POST').length, 1)
  // Once the planned week arrives, the existing award still prevents a repeat.
  t.mock.timers.setTime(new Date('2026-10-26T10:00:00Z').getTime())
  await call({ action: 'toggle-plan', date: '2026-10-29', slot: 'morning_swim', planned: true })
  assert.equal(data.requests.filter((item) => item.path === 'point_events' && item.options.method === 'POST').length, 1)
})

test('server rejects future completions and dates outside the planning window before writing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-21T10:00:00Z') })
  const data = fixture()
  for (const date of ['2026-10-20', '2026-11-02', '2026-02-30']) assert.equal((await call({ action: 'toggle-plan', date, slot: 'strength', planned: true })).code, 400)
  assert.equal((await call({ action: 'toggle-session', date: '2026-10-26', slot: 'morning_swim', completed: true })).code, 400)
  assert.equal(data.requests.some((item) => item.options.method === 'POST' || item.options.method === 'DELETE'), false)
})
