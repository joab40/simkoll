import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

process.env.SUPABASE_URL = 'https://recovery-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-database-key'
process.env.COACH_SESSION_SECRET = 'test-recovery-secret'
process.env.RESEND_API_KEY = 'test-mail-key'
process.env.APP_PUBLIC_URL = 'https://www.simkoll.app'
const { default: handler } = await import('../api/auth.js')
const { createCoachToken, verifyCoachPassword } = await import('../server/coach-auth.js')
const { guardCoachSession } = await import('../server/coach-session.js')
const { tokenHash, recoveryOrigin } = await import('../server/coach-recovery.js')
const id = '11111111-1111-4111-8111-111111111111'

function fixture({ known = true, active = true, allowed = true, providerStatus = 200, dbStatus = 200 } = {}) {
  const original = globalThis.fetch, calls = [], tasks = []
  let digest = null, version = 0, credentials = null
  const contextKey = Symbol.for('@vercel/request-context'), previousContext = globalThis[contextKey]
  globalThis[contextKey] = { get: () => ({ waitUntil: promise => tasks.push(promise) }) }
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input), body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body, options })
    if (url.hostname === 'api.resend.com') return json({ id: 'test-provider-id', secret: 'provider-private-detail' }, providerStatus)
    if (url.pathname.endsWith('/coach_mail_gate')) return json(allowed)
    if (url.pathname.endsWith('/coach_begin_reset')) { digest = body.p_token_hash; return json({ id, email: 'coach@example.com' }) }
    if (url.pathname.endsWith('/coach_finish_reset')) {
      if (!digest || body.p_token_hash !== digest || !active) return json(null)
      digest = null; version++; credentials = body
      return json(id)
    }
    if (url.pathname.endsWith('/coach_password_resets')) { digest = null; return json(null) }
    if (url.pathname.endsWith('/audit_logs')) return json(null)
    if (url.pathname.endsWith('/coach_accounts')) {
      if (dbStatus !== 200) return json({}, dbStatus)
      if (url.searchParams.has('session_version')) return json(active && url.searchParams.get('session_version') === `eq.${version}` && url.searchParams.get('role') === 'eq.superadmin' ? [{ id }] : [])
      return json(known ? [{ id, email: 'coach@example.com', status: active ? 'active' : 'suspended' }] : [])
    }
    throw new Error(`Unexpected request ${url.pathname}`)
  }
  const request = async (body, headers = {}) => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this }, end(value) { this.body = JSON.parse(value); return this } }
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1', host: 'evil.invalid', ...headers }, body }, response)
    await Promise.all(tasks)
    return response
  }
  return { calls, request, get digest() { return digest }, get credentials() { return credentials }, token: () => createCoachToken({ id, email: 'coach@example.com', role: 'superadmin', session_version: version }), restore() { globalThis.fetch = original; globalThis[contextKey] = previousContext } }
}

test('recovery sends fixed-origin one-use link, stores hash only, and revokes old sessions', async () => {
  const f = fixture()
  try {
    const oldToken = f.token()
    const requested = await f.request({ action: 'coach-forgot-password', email: ' Coach@Example.com ' })
    assert.equal(requested.statusCode, 202)
    const mail = f.calls.find(call => call.url.hostname === 'api.resend.com').body
    assert.deepEqual(mail.to, ['coach@example.com'])
    const token = mail.text.match(/https:\/\/www\.simkoll\.app\/#coach-reset=([a-f0-9]{64})/)[1]
    assert.equal(f.digest, tokenHash(token))
    assert.ok(!JSON.stringify(f.calls.filter(call => call.url.hostname !== 'api.resend.com')).includes(token))
    assert.ok(!JSON.stringify(requested.body).includes(token))
    const done = await f.request({ action: 'coach-reset-password', token, password: 'new-safe-password' })
    assert.equal(done.statusCode, 200)
    assert.ok(await verifyCoachPassword('new-safe-password', f.credentials.p_password_salt, f.credentials.p_password_hash))
    assert.match(done.headers['Set-Cookie'], /Max-Age=0/)
    assert.equal((await f.request({ action: 'coach-reset-password', token, password: 'another-password' })).statusCode, 400)
    assert.equal((await f.request({ action: 'restore' }, { cookie: `simkoll_coach_session=${oldToken}` })).statusCode, 401)
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': oldToken })).statusCode, 401)
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id, to: 'attacker@example.com' }, { 'x-simkoll-code': f.token() })).statusCode, 200)
    assert.deepEqual(f.calls.filter(call => call.url.hostname === 'api.resend.com').at(-1).body.to, ['coach@example.com'])
  } finally { f.restore() }
})

test('unknown, inactive and throttled accounts receive the same generic response without mail', async () => {
  let expected
  for (const settings of [{}, { known: false }, { active: false }, { allowed: false }]) {
    const f = fixture(settings)
    try {
      const response = await f.request({ action: 'coach-forgot-password', email: 'coach@example.com' })
      assert.equal(response.statusCode, 202)
      expected ||= response.body
      assert.deepEqual(response.body, expected)
      if (Object.keys(settings).length) assert.ok(!f.calls.some(call => call.url.hostname === 'api.resend.com'))
    } finally { f.restore() }
  }
})

test('invalid inputs, expired tokens and unauthorized test requests do not send mail', async () => {
  const f = fixture()
  try {
    for (const email of ['not-an-email', 'bad address@example.com']) assert.equal((await f.request({ action: 'coach-forgot-password', email })).statusCode, 400)
    assert.equal((await f.request({ action: 'coach-reset-password', token: 'bad', password: 'long-password' })).statusCode, 400)
    assert.equal((await f.request({ action: 'coach-reset-password', token: 'a'.repeat(64), password: 'short' })).statusCode, 400)
    assert.equal((await f.request({ action: 'coach-reset-password', token: 'a'.repeat(64), password: 'long-password' })).statusCode, 400)
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id })).statusCode, 403)
    for (const role of ['coach', 'head_coach']) {
      const response = { setHeader() {}, status(code) { this.statusCode = code; return this }, json() {}, end() {} }
      const { handleCoachRecovery } = await import('../server/coach-recovery.js')
      await handleCoachRecovery({ headers: { 'x-simkoll-code': createCoachToken({ id, role }) }, body: { action: 'coach-test-email', accountId: id } }, response)
      assert.equal(response.statusCode, 403)
    }
    assert.ok(!f.calls.some(call => call.url.hostname === 'api.resend.com'))
  } finally { f.restore() }
})

test('provider failure deletes failed recovery token and never exposes provider details', async () => {
  const f = fixture({ providerStatus: 500 })
  try {
    assert.equal((await f.request({ action: 'coach-forgot-password', email: 'coach@example.com' })).statusCode, 202)
    assert.equal(f.digest, null)
    const response = await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': f.token() })
    assert.equal(response.statusCode, 503)
    assert.ok(!JSON.stringify(response.body).includes('provider-private-detail'))
  } finally { f.restore() }
})

test('session guard fails closed on database failure, skips shared-code flows, and rejects unsigned tokens', async () => {
  const f = fixture({ dbStatus: 500 })
  try {
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': f.token() })).statusCode, 503)
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': 'coach.invalid' })).statusCode, 401)
    const count = f.calls.length
    assert.equal(await guardCoachSession({ headers: { 'x-simkoll-code': 'shared-code' } }, {}), true)
    assert.equal(f.calls.length, count)
  } finally { f.restore() }
})

test('reset origin rejects unsafe configuration', () => {
  const previous = process.env.APP_PUBLIC_URL
  try {
    for (const url of ['http://evil.invalid', 'https://user:pass@simkoll.app', 'https://simkoll.app/path', 'https://simkoll.app/?x=1']) {
      process.env.APP_PUBLIC_URL = url
      assert.throws(recoveryOrigin)
    }
  } finally { process.env.APP_PUBLIC_URL = previous }
})

test('suspended accounts are rejected even with a correctly signed session', async () => {
  const f = fixture({ active: false })
  try {
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': f.token() })).statusCode, 401)
    assert.ok(!f.calls.some(call => call.url.hostname === 'api.resend.com'))
  } finally { f.restore() }
})

test('missing mail configuration is reported without attempting a send', async () => {
  const f = fixture(), previous = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    assert.equal((await f.request({ action: 'coach-forgot-password', email: 'coach@example.com' })).statusCode, 503)
    assert.equal((await f.request({ action: 'coach-test-email', accountId: id }, { 'x-simkoll-code': f.token() })).statusCode, 503)
    assert.ok(!f.calls.some(call => call.url.hostname === 'api.resend.com'))
  } finally { process.env.RESEND_API_KEY = previous; f.restore() }
})

test('migration restricts access and consumes tokens atomically; all API routes guard sessions', () => {
  const sql = readFileSync(new URL('../supabase/migrations/119_coach_password_recovery.sql', import.meta.url), 'utf8')
  assert.match(sql, /expires_at > now\(\) for update/)
  assert.match(sql, /session_version = session_version \+ 1/)
  assert.match(sql, /interval '30 minutes'/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /from public, anon, authenticated/)
  assert.match(sql, /enable row level security/)
  for (const route of ['activity', 'analytics', 'auth', 'community', 'goals', 'notifications', 'points', 'profiles', 'responses', 'training', 'weekly-report', 'workouts']) {
    const source = readFileSync(new URL(`../api/${route}.js`, import.meta.url), 'utf8')
    assert.match(source, /if \(!await guardCoachSession\(request, response\)\) return/)
  }
})
