import test from 'node:test'
import assert from 'node:assert/strict'
import { COACH_NAV_ITEMS, COACH_MENU_SECTIONS, COACH_OVERVIEW_FEATURES } from '../shared/coach-navigation.js'
process.env.SUPABASE_URL = 'https://coach-week-responses.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'fixture-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'fixture-swimmer'
const { default: handler } = await import('../api/responses.js')
const call = async (query = { coachWeek: '2026-01-12' }, code = 'fixture-coach') => {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'GET', query, headers: { 'x-simkoll-code': code } }, response)
  return response
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

test('previous-week navigation is consolidated into the control panel, also in configurable menus', () => {
  assert.ok(COACH_NAV_ITEMS.some(({ key }) => key === 'control-panel'))
  assert.ok(!COACH_NAV_ITEMS.some(({ key }) => key === 'week'))
  assert.ok(!COACH_OVERVIEW_FEATURES.some(([key]) => key === 'week'))
  assert.ok(!COACH_MENU_SECTIONS.some(([, keys]) => keys.includes('week')))
})

test('bounded weekly response read paginates beyond 1000 and excludes test profiles', async () => {
  const offsets = []
  globalThis.fetch = async (raw) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'coach-week-responses.invalid')
    if (table === 'profiles') return json([{ id: 'test' }])
    assert.equal(table, 'responses')
    assert.deepEqual(url.searchParams.getAll('activity_date'), ['gte.2026-01-05', 'lte.2026-01-18'])
    assert.equal(url.searchParams.get('order'), 'activity_date.asc,created_at.asc,id.asc')
    const offset = Number(url.searchParams.get('offset'))
    offsets.push(offset)
    return json(Array.from({ length: offset < 1000 ? 500 : 3 }, (_, i) => ({ id: `${offset}-${i}`, profile_id: offset === 1000 && i === 0 ? 'test' : 'one', activity_date: '2026-01-16', day_type: 'after', rpe: 5 })))
  }
  const result = await call()
  assert.equal(result.code, 200)
  assert.equal(result.data.responses.length, 1002)
  assert.equal(result.data.responses.at(-1).rpe, 5)
  assert.ok(result.data.responses.every((row) => row.profileId === 'one'))
  assert.deepEqual(offsets, [0, 500, 1000])
})

test('weekly details deny swimmer/anonymous and invalid weeks before database access', async () => {
  globalThis.fetch = () => assert.fail('must not read storage')
  assert.equal((await call(undefined, 'fixture-swimmer')).code, 403)
  assert.equal((await call(undefined, 'bad')).code, 401)
  for (const week of ['2026-02-30', '2026-01-13', 'invalid']) assert.equal((await call({ coachWeek: week })).code, 400)
})

test('later page failure is an error, not a successful incomplete week', async () => {
  globalThis.fetch = async (raw) => new URL(raw).searchParams.get('offset') === '0' ? json(Array(500).fill({})) : json({ message: 'failed page' }, 503)
  assert.equal((await call()).code, 500)
})

test('safety ceiling fails visibly rather than returning a partial weekly report', async () => {
  globalThis.fetch = async () => json(Array(500).fill({}))
  const result = await call()
  assert.equal(result.code, 422)
  assert.match(result.data.error, /fullständig sammanställning/)
})
