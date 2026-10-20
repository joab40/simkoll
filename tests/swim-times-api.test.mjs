import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://swim-times-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'times-swimmer'
process.env.SIMKOLL_COACH_CODE = 'times-coach'
const { default: handler } = await import('../api/training.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const owner = '11111111-1111-4111-8111-111111111111', recordId = '22222222-2222-4222-8222-222222222222'
const coachId = '33333333-3333-4333-8333-333333333333', target = '44444444-4444-4444-8444-444444444444'
const coachToken = createCoachToken({ id: coachId, role: 'coach', email: 'fixture@example.invalid', display_name: 'Testtränare' })
const day = '2026-01-14'
const body = { action: 'save-swim-time', date: day, distance: 75, poolLength: 25, stroke: 'freestyle', time: '48,21', kind: 'training', startType: 'push', exercise: 'arms', equipment: ['pull_buoy'], timingMethod: 'hand' }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const call = async (method = 'GET', input = null, code = 'times-swimmer', query = {}) => {
  const result = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, query: { swimTimes: 'true', start: day, end: day, ...query }, body: input }, result)
  return result
}
function fixture({ onWrite = () => {}, onAudit = () => {}, missing = false, absent = false, subject = owner, activeCoach = true, accountRole = 'coach', missingProfile = false } = {}) {
  return async (url, options = {}) => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1), method = options.method || 'GET'
    assert.equal(parsed.hostname, 'swim-times-fixture.invalid', 'no AI or other external services')
    if (table === 'coach_accounts') {
      assert.equal(parsed.searchParams.get('id'), `eq.${coachId}`)
      assert.equal(parsed.searchParams.get('status'), 'eq.active')
      return json(activeCoach ? [{ id: coachId, role: accountRole }] : [])
    }
    if (table === 'profile_sessions') return json([{ profile_id: owner }])
    if (table === 'profiles') {
      assert.equal(parsed.searchParams.get('active'), 'eq.true')
      assert.equal(parsed.searchParams.get('approval_status'), 'eq.approved')
      return json(missingProfile ? [] : [{ id: subject, training_group: 'junior' }])
    }
    if (table === 'audit_logs') {
      assert.equal(method, 'POST')
      const entry = JSON.parse(options.body)
      assert.equal(entry.profile_id, subject)
      assert.equal(entry.details.timeId, recordId)
      if (entry.role === 'coach') assert.equal(entry.details.coachAccountId, coachId)
      onAudit(entry)
      return new Response(null, { status: 201 })
    }
    if (table === 'personal_training_sessions') return json([{ session_date: day, session_slot: 'morning_swim', activity_type: 'swim', source: 'manual' }])
    if (method !== 'GET') {
      assert.equal(table, 'training_swim_times', 'must not write attendance, official results, sessions or points')
      if (method !== 'POST') assert.equal(parsed.searchParams.get('profile_id'), `eq.${subject}`)
      if (method === 'PATCH' || method === 'DELETE') assert.equal(parsed.searchParams.get('id'), `eq.${recordId}`)
      const values = options.body ? JSON.parse(options.body) : null
      if (values) assert.equal(values.profile_id, subject)
      onWrite({ method, values })
      return json(absent ? [] : [{ id: recordId, ...(values || {}) }])
    }
    if (table === 'training_swim_times') {
      assert.equal(parsed.searchParams.get('profile_id'), `eq.${subject}`)
      return missing ? json({ code: 'PGRST205' }, 404) : json([])
    }
    return json([])
  }
}
test('own read and write ignore caller-supplied profile IDs and cannot change rewards or official results', async () => {
  let written
  globalThis.fetch = fixture({ onWrite: (row) => { written = row } })
  assert.equal((await call('GET', null, 'times-swimmer', { profileId: recordId })).code, 200)
  const result = await call('POST', { ...body, profileId: recordId })
  assert.equal(result.code, 201)
  assert.equal(written.values.result_time, 4821)
  assert.equal(written.values.profile_id, owner)
})
test('update and delete are scoped to record AND the authenticated profile', async () => {
  globalThis.fetch = fixture()
  assert.equal((await call('POST', { ...body, id: recordId })).code, 200)
  assert.equal((await call('POST', { action: 'delete-swim-time', id: recordId })).code, 200)
  globalThis.fetch = fixture({ absent: true })
  assert.equal((await call('POST', { ...body, id: recordId })).code, 404)
  assert.equal((await call('POST', { action: 'delete-swim-time', id: recordId })).code, 404)
})
test('linked time must use a completed swim entry belonging to the same date and profile', async () => {
  globalThis.fetch = fixture()
  assert.equal((await call('POST', { ...body, entryKey: `${day}:swim:morning_swim` })).code, 201)
  assert.equal((await call('POST', { ...body, entryKey: 'someone-else' })).code, 400)
  assert.equal((await call('POST', { ...body, entryKey: `${day}:swim:morning_swim`, date: '2026-01-15' })).code, 400)
})
test('invalid roles, missing sessions and missing migration fail clearly', async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch') }
  assert.equal((await call('POST', body, 'times-coach')).code, 403)
  assert.equal((await call('GET', null, 'invalid')).code, 403)
  globalThis.fetch = async () => json([])
  assert.equal((await call()).code, 403)
  globalThis.fetch = fixture({ missing: true })
  const result = await call()
  assert.equal(result.code, 503)
  assert.match(result.data.error, /098/)
})
test('active personal coaches can read, create and correct the selected approved swimmer times, with audit attribution', async () => {
  const writes = [], audits = []
  globalThis.fetch = fixture({ subject: target, onWrite: (row) => writes.push(row), onAudit: (row) => audits.push(row) })
  assert.equal((await call('GET', null, coachToken, { profileId: target })).code, 200)
  assert.equal((await call('POST', { ...body, profileId: target }, coachToken)).code, 201)
  assert.equal((await call('POST', { ...body, id: recordId, profileId: target }, coachToken)).code, 200)
  assert.equal(writes[0].values.profile_id, target)
  assert.equal(writes[1].method, 'PATCH')
  assert.deepEqual(audits.map((row) => row.event_type), ['training_time_create', 'training_time_update'])
  assert.equal((await call('POST', { action: 'delete-swim-time', id: recordId, profileId: target }, coachToken)).code, 403)
  assert.equal(writes.length, 2)
})
test('suspended, stale-role and legacy coach sessions cannot read or write times, and unavailable profiles are rejected', async () => {
  for (const options of [{ activeCoach: false }, { accountRole: 'head_coach' }, { missingProfile: true }]) {
    globalThis.fetch = fixture({ ...options, subject: target, onWrite: () => assert.fail('denied coaches must not write') })
    assert.equal((await call('GET', null, coachToken, { profileId: target })).code, 403)
    assert.equal((await call('POST', { ...body, id: recordId, profileId: target }, coachToken)).code, 403)
  }
  globalThis.fetch = fixture({ subject: target })
  assert.equal((await call('GET', null, coachToken, { profileId: 'bad-filter' })).code, 400)
  globalThis.fetch = async () => { throw new Error('legacy coach must not fetch') }
  assert.equal((await call('GET', null, 'times-coach', { profileId: target })).code, 403)
})
