import test from 'node:test'
import assert from 'node:assert/strict'
import webpush from 'web-push'

process.env.SUPABASE_URL = 'https://simkoll-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
process.env.SIMKOLL_COACH_CODE = 'shared-coach'
const keys = webpush.generateVAPIDKeys()
Object.assign(process.env, { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:fixture@example.org' })

const { trainingReminderToken, trainingReminderUrl, isTrainingReminderAuthorized, isMissingCheckinReminderTime } = await import('../server/training-reminder-schedule.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../server/push-api.js')
const reply = (data, ok = true) => ({ ok, json: async () => data, headers: new Headers() })
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })

function env(t, name, value) {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous })
}

test('reminder authentication works without CRON_SECRET and never allows an unauthenticated call', (t) => {
  env(t, 'CRON_SECRET', undefined)
  const token = trainingReminderToken()
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.notEqual(token, keys.privateKey)
  assert.equal(isTrainingReminderAuthorized(`Bearer ${token}`), true)
  for (const auth of [undefined, '', 'Bearer invalid', `Bearer ${keys.privateKey}`]) assert.equal(isTrainingReminderAuthorized(auth), false)
  env(t, 'WEB_PUSH_PRIVATE_KEY', webpush.generateVAPIDKeys().privateKey)
  assert.notEqual(trainingReminderToken(), token)
  assert.equal(isTrainingReminderAuthorized(`Bearer ${token}`), false)
})

test('missing push configuration fails closed and existing CRON_SECRET still works', (t) => {
  env(t, 'WEB_PUSH_PRIVATE_KEY', '')
  env(t, 'CRON_SECRET', undefined)
  assert.equal(trainingReminderToken(), null)
  assert.equal(isTrainingReminderAuthorized('Bearer null'), false)
  env(t, 'CRON_SECRET', 'legacy-fixture')
  assert.equal(isTrainingReminderAuthorized('Bearer legacy-fixture'), true)
})

test('schedule uses a stable production address and refuses preview/local setup', (t) => {
  env(t, 'VERCEL_ENV', 'production')
  env(t, 'VERCEL_PROJECT_PRODUCTION_URL', 'simkoll.example')
  const req = { headers: { host: 'untrusted.example' } }
  assert.equal(trainingReminderUrl(req), 'https://simkoll.example/api/notifications?push=true&cron=training-reminder&kind=scheduled')
  env(t, 'VERCEL_ENV', 'preview')
  assert.equal(trainingReminderUrl(req), null)
  env(t, 'VERCEL_ENV', 'development')
  assert.equal(trainingReminderUrl(req), null)
})

test('evening reminder window follows Stockholm summer and winter time', () => {
  for (const date of ['2026-07-15T18:00:00Z', '2026-12-15T19:00:00Z', '2026-12-15T19:59:00Z']) assert.equal(isMissingCheckinReminderTime(new Date(date)), true)
  for (const date of ['2026-07-15T17:59:00Z', '2026-12-15T20:00:00Z', '2026-12-15T12:00:00Z']) assert.equal(isMissingCheckinReminderTime(new Date(date)), false)
})

async function saveSettings(t, { role = 'head_coach', actualRole = role, shared = false, rpcReady = true, reminders = { afterTraining: true, missingCheckin: true } } = {}) {
  const writes = []
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    if (options.method === 'POST') {
      writes.push({ path, body: JSON.parse(options.body) })
      return reply(null, rpcReady)
    }
    if (path.startsWith('coach_accounts?')) return reply([{ id: 'coach-id', role: actualRole }])
    if (path.startsWith('app_settings?')) return reply([{ setting_value: { enabled: true } }])
    if (path.startsWith('push_subscriptions?')) return reply([])
    throw new Error(`Unexpected path: ${path}`)
  })
  const res = response()
  await handler({ method: 'POST', headers: { host: 'simkoll.example', 'x-simkoll-code': shared ? 'shared-coach' : createCoachToken({ id: 'coach-id', role }) }, body: { action: 'reminder-settings', checkinReminders: reminders } }, res)
  return { ...res, writes }
}

for (const role of ['head_coach', 'superadmin']) test(`${role} activates reminders in one server-only transaction without new environment secrets`, async (t) => {
  env(t, 'CRON_SECRET', undefined)
  env(t, 'VERCEL_ENV', 'production')
  env(t, 'VERCEL_PROJECT_PRODUCTION_URL', 'simkoll.example')
  const result = await saveSettings(t, { role })
  assert.equal(result.code, 200)
  assert.equal(result.writes.length, 1)
  assert.equal(result.writes[0].path, 'rpc/configure_training_reminders')
  assert.equal(result.writes[0].body.p_token, trainingReminderToken())
  assert.equal(result.writes[0].body.p_url, 'https://simkoll.example/api/notifications?push=true&cron=training-reminder&kind=scheduled')
  assert.deepEqual(result.data, { checkinReminders: { missingCheckin: true, afterTraining: true } })
  assert(!JSON.stringify(result.data).includes(trainingReminderToken()))
  assert(!JSON.stringify(result.writes).includes(keys.privateKey))
})

for (const options of [{ role: 'coach' }, { role: 'superadmin', actualRole: 'coach' }, { shared: true }]) test(`unauthorized coach cannot configure cron: ${JSON.stringify(options)}`, async (t) => {
  const result = await saveSettings(t, options)
  assert.equal(result.code, 403)
  assert.equal(result.writes.length, 0)
})

test('missing migration produces a visible error without saving misleading enabled settings', async (t) => {
  env(t, 'VERCEL_ENV', 'production')
  env(t, 'VERCEL_PROJECT_PRODUCTION_URL', 'simkoll.example')
  const result = await saveSettings(t, { rpcReady: false })
  assert.equal(result.code, 503)
  assert.match(result.data.error, /097/)
  assert.deepEqual(result.writes.map((item) => item.path), ['rpc/configure_training_reminders'])
})

test('disabling both reminders requests schedule removal without sending credentials', async (t) => {
  env(t, 'VERCEL_ENV', 'production')
  env(t, 'VERCEL_PROJECT_PRODUCTION_URL', 'simkoll.example')
  const result = await saveSettings(t, { reminders: { missingCheckin: false, afterTraining: false } })
  assert.equal(result.code, 200)
  assert.deepEqual(result.writes[0].body, { p_url: null, p_token: null, p_reminders: { missingCheckin: false, afterTraining: false } })
})

test('preview cannot disable the production schedule either', async (t) => {
  env(t, 'VERCEL_ENV', 'preview')
  env(t, 'VERCEL_PROJECT_PRODUCTION_URL', 'simkoll.example')
  const result = await saveSettings(t, { reminders: { missingCheckin: false, afterTraining: false } })
  assert.equal(result.code, 503)
  assert.equal(result.writes.length, 0)
})

test('cron rejects an unauthenticated caller even with a forged Vercel user-agent', async (t) => {
  env(t, 'CRON_SECRET', undefined)
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unauthenticated cron must not access data'))
  const res = response()
  await handler({ method: 'GET', query: { cron: 'training-reminder', kind: 'scheduled' }, headers: { 'user-agent': 'vercel-cron/1.0' } }, res)
  assert.equal(res.code, 401)
})

for (const [date, lookups] of [['2026-07-15T18:00:00Z', 2], ['2026-12-15T12:00:00Z', 1]]) test(`scheduled cron limits evening checks at ${date}`, async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(date).getTime() })
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url) => { assert(String(url).includes('/rest/v1/app_settings?')); calls++; return reply([{ setting_value: { enabled: false } }]) })
  const res = response()
  await handler({ method: 'POST', query: { cron: 'training-reminder', kind: 'scheduled' }, headers: { authorization: `Bearer ${trainingReminderToken()}` } }, res)
  assert.equal(res.code, 200)
  assert.equal(calls, lookups)
})
