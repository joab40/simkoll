import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://trainer-notices.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-only'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
const { default: handler } = await import('../api/notifications.js')
const { readSeenNotifications, rememberSeenNotifications } = await import('../src/swimmer-notification-state.js')

const ownId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const questionId = '33333333-3333-4333-8333-333333333333'
const json = rows => new Response(JSON.stringify(rows))

test('trainer notices contain a direct route to the dialogue and never expose other swimmers’ messages', async t => {
  t.mock.method(globalThis, 'fetch', async raw => {
    const { pathname, searchParams } = new URL(raw)
    if (pathname.endsWith('/profile_sessions')) return json([{ profile_id: ownId }])
    if (pathname.endsWith('/profiles')) return json([{ id: ownId, display_name: 'Simmaren' }])
    if (pathname.endsWith('/private_messages')) {
      assert.equal(searchParams.get('recipient_profile_id'), `eq.${ownId}`)
      assert.equal(searchParams.get('sender_role'), 'eq.coach')
      const row = { sender_role: 'coach', recipient_role: 'swimmer', recipient_profile_id: ownId, created_at: '2026-11-25T12:00:00Z' }
      return json([
        { ...row, id: 'reminder', content: 'Dina grenval saknas' },
        { ...row, id: 'reply', content: 'Så kan du göra', reply_to_open_chat_id: questionId },
        { ...row, id: 'foreign', content: 'Privat för en annan simmare', recipient_profile_id: otherId },
        { ...row, id: 'kudos', content: 'Pepp', sender_role: 'swimmer' },
      ])
    }
    return json([])
  })
  const response = { setHeader(name, value) { if (name === 'Cache-Control') this.cache = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'GET', headers: { 'x-simkoll-code': 'swimmer-fixture', cookie: 'simkoll_session=fixture' } }, response)
  assert.equal(response.code, 200)
  assert.equal(response.cache, 'no-store')
  const { notifications } = response.data
  assert.deepEqual(notifications.map(item => [item.id, item.type, item.thread]), [
    ['message-reminder', 'message', { kind: 'direct', id: ownId }],
    ['message-reply', 'message', { kind: 'question', id: questionId }],
  ])
})

test('marking notifications as seen preserves per-profile read history', t => {
  const values = new Map()
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, item) => values.set(key, item) } }
  t.after(() => { delete globalThis.window })
  rememberSeenNotifications(ownId, ['message-1'])
  rememberSeenNotifications(ownId, ['message-2', 'message-3'])
  rememberSeenNotifications(otherId, ['message-4'])
  assert.deepEqual([...readSeenNotifications(ownId)], ['message-1', 'message-2', 'message-3'])
  assert.deepEqual([...readSeenNotifications(otherId)], ['message-4'])
})
