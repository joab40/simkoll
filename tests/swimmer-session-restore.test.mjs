import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://swimmer-restore-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'fixture-club'
const { default: handler } = await import('../api/auth.js')

test('session restore can return the public swimmer profile and audit the login in the same request', async t => {
  const profile = { id: 'swimmer-id', username: 'testprofil', display_name: 'Testprofil', terms_accepted_at: null,
    pin_hash: 'private-pin-hash', pin_salt: 'private-pin-salt' }
  const calls = []
  let sessionExists = true
  t.mock.method(globalThis, 'fetch', async (resource, options) => {
    const url = new URL(resource)
    assert.equal(url.hostname, 'swimmer-restore-fixture.invalid')
    const table = url.pathname.split('/').at(-1)
    calls.push({ table, body: options.body ? JSON.parse(options.body) : null })
    if (table === 'profile_sessions') return Response.json(sessionExists ? [{ profile_id: profile.id }] : [])
    if (table === 'profiles') {
      assert.equal(url.searchParams.get('approval_status'), 'eq.approved')
      assert.equal(url.searchParams.get('active'), 'eq.true')
      return Response.json([profile])
    }
    if (table === 'audit_logs') return new Response(null, { status: 204 })
    assert.fail(`Unexpected table: ${table}`)
  })
  const restore = async includeProfile => {
    const response = {
      headers: {}, setHeader(name, value) { this.headers[name] = value },
      status(code) { this.code = code; return this }, json(body) { this.body = body },
    }
    await handler({ method: 'POST', headers: { cookie: 'simkoll_group_code=fixture-club; simkoll_session=token' },
      body: { action: 'restore', includeProfile } }, response)
    return response
  }
  const result = await restore(true)
  assert.equal(result.code, 200)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal(result.body.profile.id, profile.id)
  assert.equal(result.body.profile.termsAccepted, false)
  assert.doesNotMatch(JSON.stringify(result.body), /private-pin/)
  assert.deepEqual(calls.map(call => call.table), ['profile_sessions', 'profiles', 'audit_logs'])
  assert.equal(calls[2].body.details.login, 'remembered-session')

  calls.length = 0
  assert.deepEqual((await restore(undefined)).body, { role: 'swimmer', code: 'fixture-club' })
  assert.deepEqual(calls.map(call => call.table), ['profile_sessions', 'profiles'])
  sessionExists = false
  assert.deepEqual((await restore(true)).body, { role: null })
})
