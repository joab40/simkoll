import test from 'node:test'
import assert from 'node:assert/strict'
import { planningAddDays } from '../shared/weekly-planning.js'

process.env.SUPABASE_URL = 'https://checkin-history.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-only'
process.env.SIMKOLL_SWIMMER_CODE = 'history-test'
const { default: handler } = await import('../api/responses.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const today = stockholmDate()
const date = planningAddDays(today, -5)
const profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const entryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

async function call(method, body, query = {}, cookie = 'simkoll_session=fixture') {
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  await handler({ method, body, query, headers: { cookie, 'x-simkoll-code': 'history-test' } }, response)
  return response
}

test('calendar check-ins are private, backdated and independently editable without doubling up a pass', async t => {
  const entries = [], sessions = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    const params = url.searchParams
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, training_group: 'junior' }])
    if (table === 'personal_training_sessions') {
      sessions.push(JSON.parse(options.body))
      return json([], 201)
    }
    assert.equal(table, 'responses', 'older check-ins leave activity and rewards untouched')
    if (options.method === 'POST') {
      const row = { id: entryId, ...JSON.parse(options.body) }
      assert.equal(row.profile_id, profileId)
      assert.equal(row.activity_date, date)
      assert.equal(row.late_entry, true)
      assert.ok(row.late_entry_key)
      entries.push(row)
      return json([row], 201)
    }
    assert.equal(params.get('profile_id'), `eq.${profileId}`)
    if (options.method === 'PATCH') {
      assert.equal(params.get('activity_date'), `eq.${date}`)
      const index = entries.findIndex(entry => `eq.${entry.id}` === params.get('id'))
      if (index < 0) return json([])
      const changes = JSON.parse(options.body)
      assert.deepEqual(changes, { feeling: 4, comment: 'Tungt men bra' })
      Object.assign(entries[index], changes)
      return json([entries[index]])
    }
    assert.ok(params.getAll('activity_date').length)
    return json(entries)
  })
  const query = { checkinHistory: 'true', start: date, end: planningAddDays(today, -1) }
  assert.equal((await call('GET', null, query, '')).code, 403)
  assert.equal((await call('GET', null, { ...query, end: today })).code, 400)
  assert.equal((await call('GET', null, { ...query, start: planningAddDays(today, -35) })).code, 400)
  assert.deepEqual((await call('GET', null, query)).data.responses, [])

  const body = { historical: true, identified: true, type: 'after', feeling: 3, activityType: 'swim', trainingSlot: 'morning_swim', activityDistanceMeters: 3200, activityMinutes: 60, activityDate: date }
  assert.equal((await call('POST', { ...body, identified: false })).code, 403)
  assert.equal((await call('POST', { ...body, historical: false })).code, 400)
  assert.equal((await call('POST', { ...body, activityDate: today })).code, 400)
  assert.equal((await call('POST', { ...body, type: 'before' })).code, 400)
  assert.equal((await call('POST', body)).code, 201)
  assert.equal((await call('POST', body)).code, 409)
  assert.equal((await call('POST', { ...body, trainingSlot: 'afternoon_swim' })).code, 201)
  assert.notEqual(entries[0].late_entry_key, entries[1].late_entry_key)
  assert.deepEqual(sessions.map(row => [row.session_date, row.session_slot]), [[date, 'morning_swim'], [date, 'afternoon_swim']])

  const edit = { action: 'edit-checkin-answers', id: entryId, date, changes: { feeling: 4, comment: ' Tungt men bra ' } }
  assert.equal((await call('PATCH', { ...edit, changes: { trainingSlot: 'afternoon_swim' } })).code, 400)
  assert.equal((await call('PATCH', { ...edit, id: profileId })).code, 404)
  assert.equal((await call('PATCH', edit)).data.response.feeling, 4)
  assert.equal((await call('GET', null, query)).data.responses[0].comment, 'Tungt men bra')
})
