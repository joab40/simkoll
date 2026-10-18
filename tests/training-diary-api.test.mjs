import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://diary-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'diary-swimmer'
process.env.SIMKOLL_COACH_CODE = 'diary-coach'
const { default: handler } = await import('../api/training.js')
const profileId = '11111111-1111-4111-8111-111111111111', date = '2026-01-14'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const call = async (method = 'GET', body = null, code = 'diary-swimmer', query = {}) => {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, query: { diary: 'true', start: date, end: date, ...query }, body }, response)
  return response
}
const fixture = (onWrite = () => {}) => async (url, options = {}) => {
  const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
  assert.equal(parsed.hostname, 'diary-fixture.invalid', 'diary must never call AI or other services')
  if (table === 'profile_sessions') return json([{ profile_id: profileId }])
  if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
  const writing = table === 'training_diary_reflections' && options.method === 'POST'
  assert.equal(options.method || 'GET', writing ? 'POST' : 'GET', 'read must not alter attendance, sessions or rewards')
  if (writing) assert.equal(JSON.parse(options.body).profile_id, profileId)
  else if (!['daily_workouts', 'training_plans'].includes(table)) assert.equal(parsed.searchParams.get('profile_id'), `eq.${profileId}`)
  if (table === 'personal_training_sessions') return json([{ id: 'one', session_date: date, session_slot: 'morning_swim', activity_type: 'swim', source: 'manual' }])
  if (writing) { onWrite(JSON.parse(options.body)); return json([JSON.parse(options.body)]) }
  return json([])
}
test('diary ignores supplied profile ids, scopes private sources and has no read-side mutations', async () => {
  globalThis.fetch = fixture()
  const result = await call('GET', null, 'diary-swimmer', { profileId: 'someone-else' })
  assert.equal(result.code, 200)
  assert.equal(result.data.current.sessions, 1)
})
test('coach and unauthenticated sessions cannot access a swimmer diary', async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch') }
  assert.equal((await call('GET', null, 'diary-coach')).code, 403)
  assert.equal((await call('GET', null, 'invalid')).code, 403)
  globalThis.fetch = async () => json([])
  assert.equal((await call()).code, 403)
})
test('reflection updates only the own diary table and cannot create sessions or points', async () => {
  let saved
  globalThis.fetch = fixture((row) => { saved = row })
  const result = await call('POST', { action: 'diary-reflection', entryKey: `${date}:swim:morning_swim`, date, whatWorked: ' Bra grepp ', nextTime: 'Vändningen', profileId: 'someone-else' })
  assert.equal(result.code, 200)
  assert.equal(saved.profile_id, profileId)
  assert.equal(saved.what_worked, 'Bra grepp')
  assert.equal(saved.entry_key, `${date}:swim:morning_swim`)
  assert.equal((await call('POST', { action: 'diary-reflection', entryKey: 'other-swimmer-entry', date, whatWorked: 'Text' })).code, 404)
})
test('missing reflection migration keeps history available and reports unsaved text honestly', async () => {
  const base = fixture()
  globalThis.fetch = async (url, options) => String(url).includes('/training_diary_reflections?') ? json({ code: 'PGRST205' }, 404) : base(url, options)
  const read = await call()
  assert.equal(read.code, 200)
  assert.equal(read.data.reflectionsAvailable, false)
  const write = await call('POST', { action: 'diary-reflection', entryKey: `${date}:swim:morning_swim`, date, whatWorked: 'Text' })
  assert.equal(write.code, 503)
  assert.match(write.data.error, /095/)
})
