import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import webpush from 'web-push'

process.env.SUPABASE_URL = 'https://simkoll-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'shared-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'shared-swimmer'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
const keys = webpush.generateVAPIDKeys()
Object.assign(process.env, { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:fixture@example.org' })
const { cleanPushSubscription, validPushEndpoint, deliverMessagePush, sendDevicePush } = await import('../server/web-push.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: pushHandler } = await import('../server/push-api.js')
const subscription = { endpoint: 'https://web.push.apple.com/fixture', keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 1).toString('base64url') } }
const reply = (body, ok = true) => ({ ok, json: async () => body, headers: new Headers({ 'content-range': '0-0/3' }) })
const row = (id, profile_id = null, coach_id = null) => ({ id, profile_id, coach_id, subscription })

test('subscription validator allows known HTTPS providers and rejects SSRF and malformed keys', () => {
  for (const endpoint of ['https://web.push.apple.com/a', 'https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/a', 'https://wns2.notify.windows.com/a']) assert(validPushEndpoint(endpoint))
  for (const endpoint of ['http://web.push.apple.com/a', 'https://127.0.0.1/a', 'https://web.push.apple.com.evil.invalid/a', 'https://user:pass@web.push.apple.com/a', 'https://web.push.apple.com:444/a', 'https://example.org/a']) assert.equal(validPushEndpoint(endpoint), false)
  assert.deepEqual(cleanPushSubscription({ ...subscription, forged: 'ignored' }), subscription)
  assert.equal(cleanPushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'invalid' } }), null)
  assert.equal(cleanPushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: 'a'.repeat(5000) } }), null)
})

test('private delivery scopes the database query to one recipient and sends no message content', async () => {
  const paths = [], delivered = []
  globalThis.fetch = async (url) => {
    const path = String(url).split('/rest/v1/')[1]; paths.push(path)
    if (path.startsWith('app_settings')) return reply([{ setting_value: { enabled: true } }])
    if (path.startsWith('push_subscriptions')) return reply([row('device-a', 'swimmer-a'), row('unexpected-other-device', 'swimmer-b')])
    if (path.startsWith('profiles')) return reply([{ id: 'swimmer-a' }, { id: 'swimmer-b' }])
    if (path.startsWith('coach_accounts')) return reply([])
    throw new Error(`Unexpected path: ${path}`)
  }
  await deliverMessagePush({ kind: 'private', id: 'message-a', profileId: 'swimmer-a', content: 'PRIVATE CONTENT' }, async (_sub, payload) => delivered.push(JSON.parse(payload)))
  assert(paths.some((path) => path.includes('private_messages=eq.true&profile_id=eq.swimmer-a')))
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].ownerKey, 'swimmer:swimmer-a')
  assert.equal(delivered[0].screen, 'private')
  assert(!JSON.stringify(delivered).includes('PRIVATE CONTENT'))
})

test('trainer info excludes inactive recipients and the sending coach', async () => {
  const delivered = []
  globalThis.fetch = async (url) => {
    const path = String(url).split('/rest/v1/')[1]
    if (path.startsWith('app_settings')) return reply([{ setting_value: { enabled: true } }])
    if (path.startsWith('push_subscriptions')) { assert(path.includes('coach_messages=eq.true')); return reply([row('a', 'active'), row('b', 'blocked'), row('c', null, 'sender'), row('d', null, 'coach'), row('e', null, 'blocked-coach')]) }
    if (path.startsWith('profiles')) { assert(path.includes('active=eq.true&approval_status=eq.approved')); return reply([{ id: 'active' }]) }
    if (path.startsWith('coach_accounts')) return reply([{ id: 'sender' }, { id: 'coach' }])
    throw new Error('Unexpected request')
  }
  await deliverMessagePush({ kind: 'coach-info', id: 'message', senderCoachId: 'sender' }, async (_sub, payload) => delivered.push(JSON.parse(payload)))
  assert.deepEqual(delivered.map((entry) => entry.ownerKey).sort(), ['coach:coach', 'swimmer:active'])
  assert(delivered.every((entry) => entry.screen === 'coach-info'))
})

test('swimmer questions only query coaches, and private events without a recipient never broadcast', async () => {
  let queries = 0
  globalThis.fetch = async (url) => {
    const path = String(url).split('/rest/v1/')[1]
    if (path.startsWith('app_settings')) return reply([{ setting_value: { enabled: true } }])
    assert(path.includes('private_messages=eq.true&coach_id=not.is.null'))
    queries++
    return reply([])
  }
  await deliverMessagePush({ kind: 'question', toCoaches: true })
  await deliverMessagePush({ kind: 'private' })
  assert.equal(queries, 1)
})

test('global and category switches prevent subscription lookup and delivery', async () => {
  for (const setting_value of [{ enabled: false }, { enabled: true, coachMessages: false }]) {
    globalThis.fetch = async (url) => { assert(String(url).includes('app_settings?')); return reply([{ setting_value }]) }
    await deliverMessagePush({ kind: 'coach-info', id: 'no-send' }, async () => assert.fail('Must not send'))
  }
})

test('expired subscriptions are removed with an owner guard, transient errors retain the device', async (t) => {
  const deletes = []
  globalThis.fetch = async (url, options) => { assert.equal(options.method, 'DELETE'); deletes.push(String(url)); return reply([]) }
  for (const statusCode of [404, 410]) assert.equal(await sendDevicePush(row('device', 'owner'), {}, async () => { throw { statusCode } }), false)
  assert.equal(deletes.length, 2)
  assert(deletes.every((url) => url.includes('id=eq.device&profile_id=eq.owner')))
  t.mock.method(console, 'error', () => {})
  assert.equal(await sendDevicePush(row('device', 'owner'), {}, async () => { throw { statusCode: 503 } }), false)
  assert.equal(deletes.length, 2)
})

async function request(body, { role = 'superadmin', actualRole = role, shared = false, swimmer = false, cookie = true } = {}) {
  const writes = [], paths = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]; paths.push(path)
    if (options.method === 'POST' || options.method === 'DELETE') { writes.push({ path, options }); return reply([]) }
    if (path.startsWith('coach_accounts')) return reply([{ id: 'coach-id', role: actualRole }])
    if (path.startsWith('profile_sessions')) return reply([{ profile_id: 'own-profile', expires_at: '2099-01-01' }])
    if (path.startsWith('profiles')) return reply([{ id: 'own-profile', active: true, approval_status: 'approved' }])
    if (path.startsWith('app_settings')) return reply([{ setting_value: { enabled: true } }])
    if (path.startsWith('push_subscriptions')) return reply([])
    throw new Error(`Unexpected path: ${path}`)
  }
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  const code = swimmer ? 'shared-swimmer' : shared ? 'shared-coach' : createCoachToken({ id: 'coach-id', role })
  await pushHandler({ method: body ? 'POST' : 'GET', headers: { 'x-simkoll-code': code, ...(cookie ? { cookie: 'simkoll_session=fixture-token' } : {}) }, body }, response)
  return { ...response, writes, paths }
}

test('only current database superadmin can change global settings, not shared coach codes', async () => {
  const body = { action: 'push-settings', settings: { enabled: true } }
  for (const role of ['coach', 'head_coach']) {
    const result = await request(body, { role }); assert.equal(result.code, 403); assert.equal(result.writes.length, 0)
  }
  assert.equal((await request(body, { role: 'superadmin', actualRole: 'coach' })).code, 403)
  assert.equal((await request(body, { shared: true })).code, 403)
  const result = await request(body)
  assert.equal(result.code, 200); assert.equal(result.writes.length, 1)
})

test('swimmer subscription ownership comes from session, not submitted profile identifiers', async () => {
  const body = { action: 'push-subscribe', subscription, profileId: 'victim', coach_id: 'victim', preferences: { privateMessages: false } }
  assert.equal((await request(body, { swimmer: true, cookie: false })).code, 403)
  const result = await request(body, { swimmer: true })
  assert.equal(result.code, 200)
  const stored = JSON.parse(result.writes[0].options.body)
  assert.equal(stored.profile_id, 'own-profile'); assert.equal(stored.coach_id, null)
  assert.equal(stored.private_messages, false)
  for (const action of ['push-status', 'push-unsubscribe']) {
    const scoped = await request({ action, endpoint: subscription.endpoint }, { swimmer: true })
    assert.equal(scoped.code, 200)
    assert(scoped.paths.some((path) => path.includes('endpoint_hash=eq.') && path.includes('&profile_id=eq.own-profile')))
  }
})

test('GET exposes the public VAPID key only and limits device counts to superadmin', async () => {
  const admin = await request()
  assert.equal(admin.data.publicKey, keys.publicKey); assert.equal(admin.data.deviceCount, 3)
  assert(!JSON.stringify(admin.data).includes(keys.privateKey))
  assert.equal((await request(null, { role: 'coach' })).data.deviceCount, undefined)
})

test('service worker displays push and opens or focuses only same-origin Simkoll', async () => {
  const handlers = {}, notifications = [], opened = [], messages = []
  let windows = []
  const self = { addEventListener(name, callback) { handlers[name] = callback }, location: { origin: 'https://simkoll.example' }, registration: { showNotification: async (...args) => notifications.push(args) }, clients: { matchAll: async () => windows, openWindow: async (url) => opened.push(url) } }
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL, URLSearchParams })
  let work
  handlers.push({ data: { json: () => ({ title: 'New', ownerKey: 'swimmer:a', screen: 'private' }) }, waitUntil: (promise) => { work = promise } })
  await work
  assert.equal(notifications[0][1].data.ownerKey, 'swimmer:a')
  const event = { notification: { close() {}, data: { screen: 'private', ownerKey: 'swimmer:a' } }, waitUntil: (promise) => { work = promise } }
  windows = [{ url: 'https://unrelated.example/', postMessage: () => assert.fail('Wrong origin') }]
  handlers.notificationclick(event); await work
  assert.equal(opened[0], 'https://simkoll.example/?push=private&pushOwner=swimmer%3Aa')
  windows = [{ url: 'https://simkoll.example/', postMessage: (message) => messages.push(message), focus: async () => {} }]
  handlers.notificationclick(event); await work
  assert.equal(messages[0].screen, 'private'); assert.equal(opened.length, 1)
  assert.equal(handlers.fetch, undefined, 'Never cache signed-in responses')
})
