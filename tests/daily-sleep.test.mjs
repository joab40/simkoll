import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://sleep-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'sleep-swimmer'
process.env.SIMKOLL_COACH_CODE = 'sleep-coach'
const { default: handler } = await import('../api/responses.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const { buildCoachControlPanel } = await import('../shared/coach-control-panel.js')
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const today = stockholmDate(), previous = (days) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000).toISOString().slice(0,10)
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status })
const call = async ({ method = 'GET', query = { sleep: 'true' }, body, code = 'sleep-swimmer', cookie = 'simkoll_session=test' } = {}) => {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, query, body, headers: { 'x-simkoll-code': code, cookie } }, response)
  return response
}
const fixture = (read) => async (url, options = {}) => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, 'sleep-fixture.invalid')
  const table = parsed.pathname.split('/').at(-1)
  if (table === 'profile_sessions') return json([{ profile_id: owner }])
  if (table === 'profiles') return json([{ id: owner }])
  assert.equal(table, 'profile_daily_sleep', 'must not create training, feedback or point records')
  return read(parsed, options)
}
test('a swimmer reads and writes only their own sleep, ignoring a supplied profile ID', async () => {
  globalThis.fetch = fixture((url, options) => {
    if (options.method === 'POST') assert.equal(JSON.parse(options.body).profile_id, owner)
    else assert.equal(url.searchParams.get('profile_id'), `eq.${owner}`)
    return json([])
  })
  assert.equal((await call({ query: { sleep: 'true', profileId: other } })).code,200)
  assert.equal((await call({ method: 'POST', body: { action: 'save-sleep', date: today, minutes: 450, quality: 3, profileId: other } })).code,200)
  assert.equal((await call({ method: 'POST', cookie: '', body: { action: 'save-sleep', date: today, minutes: 450, quality: 3 } })).code,401)
  assert.equal((await call({ cookie: '' })).code,401)
})
test('a second device cannot overwrite a night or a daily skip', async () => {
  const records = new Map()
  globalThis.fetch = fixture((url, options) => {
    if (options.method === 'POST') {
      assert.equal(url.searchParams.get('on_conflict'),'profile_id,activity_date')
      assert.equal(options.headers.Prefer,'resolution=ignore-duplicates')
      const row = JSON.parse(options.body)
      if (!records.has(row.activity_date)) records.set(row.activity_date,row)
    }
    return json([...records.values()])
  })
  for (const minutes of [420,510]) assert.equal((await call({ method: 'POST', body: { action: 'save-sleep', date: today, minutes, quality: 5 } })).code,200)
  assert.equal(records.get(today).minutes,420)
  await call({ method: 'POST', body: { action: 'save-sleep', date: previous(1), skipped: true, minutes: 420, quality: 5 } })
  assert.equal((await call({ method: 'POST', body: { action: 'save-sleep', date: previous(1), minutes: 510, quality: 3 } })).code,200)
  assert.equal(records.get(previous(1)).minutes,null)
  assert.equal(records.get(previous(1)).quality,null)
  assert.equal(records.get(previous(1)).skipped,true)
})
test('invalid dates, non-quarter duration and invalid quality cause no writes', async () => {
  globalThis.fetch = fixture(() => { assert.fail('invalid payload must not reach sleep storage') })
  for (const extra of [{ date: previous(2) }, { date: '2026-02-30' }, { minutes: 841 }, { minutes: -15 }, { minutes: 421 }, { quality: 2 }, { quality: null }, { skipped: 'yes' }]) {
    assert.equal((await call({ method: 'POST', body: { action: 'save-sleep', date: today, minutes: 420, quality: 5, ...extra } })).code,400)
  }
})
test('coach read is scoped to approved active non-test swimmers and paginates', async () => {
  const offsets = []
  globalThis.fetch = fixture((url, options) => {
    assert.equal(options.method,undefined)
    assert.equal(url.searchParams.get('profiles.active'),'eq.true')
    assert.equal(url.searchParams.get('profiles.approval_status'),'eq.approved')
    assert.equal(url.searchParams.get('profiles.is_test_profile'),'eq.false')
    offsets.push(url.searchParams.get('offset'))
    return json(offsets.length === 1 ? Array.from({length:500},() => ({ profile_id: owner, activity_date: today })) : [])
  })
  const result = await call({ code: 'sleep-coach', cookie: '' })
  assert.equal(result.code,200); assert.equal(result.data.records.length,500)
  assert.deepEqual(offsets,['0','500'])
  assert.equal((await call({ code: 'unknown', cookie: '' })).code,401)
})
test('missing migration gives an explicit error, never a fake empty night', async () => {
  globalThis.fetch = fixture(() => json({ code: '42P01' },404))
  const result = await call()
  assert.equal(result.code,503); assert.match(result.data.error,/100/)
})
test('sleep follow-up requires two distinct poor nights and respects profile and week scope', () => {
  const row = (id,date,extra = {}) => ({ profile_id: id, activity_date: date, minutes: 480, quality: 1, ...extra })
  const profiles = [{ id: owner, displayName: 'A' }]
  assert.equal(buildCoachControlPanel(profiles,[],today,[row(owner,today),row(owner,today)]).followUps.length,0)
  assert.equal(buildCoachControlPanel(profiles,[],today,[row(owner,today),row(other,previous(1)),row(owner,previous(8)),row(owner,previous(1),{skipped:true})]).followUps.length,0)
  const result = buildCoachControlPanel(profiles,[],today,[row(owner,today),row(owner,previous(1))])
  assert.equal(result.followUps.length,1); assert.match(result.followUps[0].reasons[0],/2 nätter/)
})
