import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import { flightWeekAnnotations, suggestPlanningWeekType } from '../shared/planning-week-types.js'

process.env.SUPABASE_URL = 'https://planning-week-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'planning-week-types-fixture'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const coach = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'coach' })
const monday = '2026-11-23'
const action = 'set-planning-week-type'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

async function call({ method = 'GET', query = {}, body, token = coach } = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method, query, body, headers: { 'x-simkoll-code': token } }, response)
  return response
}

test('week type suggestions prefer the overlapping block and handle shared or ambiguous group plans', () => {
  const build = { type: 'block', name: 'Grundblock', phase: 'build', startDate: '2026-11-09', endDate: '2026-11-29', targetGroups: [] }
  const taper = { ...build, name: 'Inför USM', phase: 'taper', targetGroups: ['Junior'] }
  assert.deepEqual(suggestPlanningWeekType([build, taper], monday, 'junior'), { type: 'taper', name: 'Inför USM' })
  assert.equal(suggestPlanningWeekType([build, taper], monday, 'ungdom_svart').type, 'build')
  assert.equal(suggestPlanningWeekType([build, taper, { ...taper, phase: 'recovery' }], monday, 'junior'), null)
  assert.equal(suggestPlanningWeekType([build, { ...taper, startDate: '2026-11-28' }], monday, 'junior').type, 'build')
  assert.equal(suggestPlanningWeekType([{ ...build, type: 'term' }], monday, 'junior'), null)
})

test('Flight Record annotates intersecting weeks and represents different group types on the same date', () => {
  const weekTypes = [
    { weekStart: '2026-11-16', groupName: 'Junior', type: 'pre_taper' },
    { weekStart: monday, groupName: 'Junior', type: 'taper' },
    { weekStart: monday, groupName: 'Ungdom Svart', type: 'high_load' },
    { weekStart: '2026-11-30', groupName: 'Junior', type: 'recovery' },
  ]
  assert.deepEqual(flightWeekAnnotations(weekTypes, '2026-11-22', '2026-11-27'), [
    { weekStart: '2026-11-16', type: 'pre_taper', text: 'Junior · Förtoppning' },
    { weekStart: monday, type: 'mixed', text: 'Junior · Toppning, Ungdom Svart · Högre belastning' },
  ])
})

test('coach API saves and clears one group and week, validates inputs and reads competitions independently', async t => {
  const rows = new Map(), reads = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'planning-week-fixture.invalid')
    reads.push(table)
    if (table === 'training_groups') {
      assert.equal(url.searchParams.get('active'), 'eq.true')
      const group = url.searchParams.get('id').slice(3)
      return json(['junior', 'ungdom_svart'].includes(group) ? [{ id: group }] : [])
    }
    if (table === 'competition_calendar') {
      assert.equal(url.searchParams.get('start_date'), 'lte.2026-11-29')
      assert.equal(url.searchParams.get('end_date'), 'gte.2026-11-23')
      return json([{ id: 'meet', title: 'USM', start_date: '2026-11-27', end_date: '2026-11-29', target_groups: ['junior'] }])
    }
    assert.equal(table, 'planning_week_types')
    if (options.method === 'POST') {
      assert.equal(url.searchParams.get('on_conflict'), 'week_start,group_id')
      const row = JSON.parse(options.body)
      rows.set(`${row.week_start}:${row.group_id}`, row)
      return new Response(null, { status: 204 })
    }
    if (options.method === 'DELETE') {
      rows.delete(`${url.searchParams.get('week_start').slice(3)}:${url.searchParams.get('group_id').slice(3)}`)
      return new Response(null, { status: 204 })
    }
    const [from, to] = url.searchParams.getAll('week_start').map(value => value.slice(4))
    return json([...rows.values()].filter(row => row.week_start >= from && row.week_start <= to))
  })
  const query = { weekTypes: 'true', from: monday, to: '2026-11-29', includeCompetitions: 'true' }
  const write = (type, patch = {}) => call({ method: 'POST', body: { action, weekStart: monday, groupId: 'junior', type, ...patch } })
  assert.equal((await call({ query, token: '' })).code, 403)
  assert.equal((await call({ query: { ...query, to: '2027-03-01' } })).code, 400)
  assert.equal((await write('taper', { weekStart: '2026-11-24' })).code, 400)
  assert.equal((await write('constructor')).code, 400)
  assert.equal((await write('taper', { groupId: 'inactive' })).code, 400)
  assert.equal(rows.size, 0)
  assert.equal((await write('pre_taper')).code, 200)
  assert.equal((await write('taper')).code, 200)
  assert.equal((await write('build', { groupId: 'ungdom_svart' })).code, 200)
  assert.equal((await write('recovery', { weekStart: '2026-11-30' })).code, 200)
  const { data } = await call({ query })
  assert.deepEqual(data.weekTypes, [{ weekStart: monday, groupId: 'junior', type: 'taper' }, { weekStart: monday, groupId: 'ungdom_svart', type: 'build' }])
  assert.equal(data.competitions[0].title, 'USM')
  assert.equal((await write(null)).code, 200)
  reads.length = 0
  assert.deepEqual((await call({ query: { ...query, includeCompetitions: 'false' } })).data.weekTypes, [{ weekStart: monday, groupId: 'ungdom_svart', type: 'build' }])
  assert.deepEqual(reads, ['planning_week_types'])
})

test('SQL 143 enforces one private typed record per Monday and group', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE), db = new PGlite()
  const sql = async filename => readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
  const insert = (week, group, type) => db.query('insert into planning_week_types(week_start,group_id,week_type) values ($1,$2,$3)', [week, group, type])
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(await sql('039_training_groups.sql'))
    const migration = await sql('143_planning_week_types.sql')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from planning_week_types'), /permission denied/)
    await db.exec('set role service_role')
    await insert(monday, 'junior', 'taper')
    await insert(monday, 'ungdom_svart', 'build')
    await assert.rejects(insert(monday, 'junior', 'recovery'), /duplicate key/)
    await assert.rejects(insert('2026-11-24', 'junior', 'taper'), /check constraint/)
    await assert.rejects(insert(monday, 'unknown_group', 'taper'), /foreign key/)
    await assert.rejects(insert(monday, 'ungdom_orange', 'unknown'), /check constraint/)
  } finally { await db.close() }
})
