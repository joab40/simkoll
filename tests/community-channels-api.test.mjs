import test from 'node:test'
import assert from 'node:assert/strict'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
process.env.SUPABASE_URL = 'https://community-channels.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-channel-fixture'
const { default: handler } = await import('../api/community.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const code = createCoachToken({ id: 'coach-1', role: 'coach' })
const json = data => new Response(JSON.stringify(data), { status: 200 })
const rows = { app_settings: [{ setting_value: { openChat: { enabled: true } } }], profiles: [], open_chat_messages: [{ id: 'info', sender_role: 'coach', content: 'Public info', created_at: '2026-11-15T12:00:00Z' }], community_posts: [{ id: 'post', content: 'Club info', created_at: '2026-11-15T12:00:00Z' }], group_pep: [], community_reactions: [], private_messages: [] }
async function call(query, requestCode = code) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method: 'GET', query, headers: { 'x-simkoll-code': requestCode } }, response)
  return response
}

test('real info route skips unrelated tables and returns no inbox/public-feed payload', async () => {
  const calls = []
  globalThis.fetch = async url => {
    const table = new URL(url).pathname.split('/').at(-1); calls.push(table)
    assert(['app_settings', 'profiles', 'open_chat_messages'].includes(table), table)
    return json(rows[table])
  }
  const response = await call({ openChat: 'true' })
  assert.equal(response.code, 200); assert.equal(response.data.openChat.messages[0].content, 'Public info')
  assert.equal(calls.length, 3); assert.match(response.headers['Cache-Control'], /no-store/)
  assert.deepEqual(Object.keys(response.data), ['openChat'])
})

test('real club route skips private inbox, questions, linked replies and private kudos', async () => {
  const calls = []
  globalThis.fetch = async url => {
    const table = new URL(url).pathname.split('/').at(-1); calls.push(table)
    assert(!['private_messages', 'open_chat_messages', 'kudos'].includes(table))
    return json(rows[table] || [])
  }
  const response = await call({ channel: 'club' })
  assert.equal(response.code, 200); assert.equal(response.data.items[0].content, 'Club info')
  assert.deepEqual(response.data.messages, []); assert.deepEqual(response.data.privateKudos, [])
  assert.deepEqual(response.data.openChat.messages, [])
  assert.equal(calls.length, 5)
})

test('real coach inbox route only reads inbox and identities; unauthenticated callers cannot reach it', async () => {
  const calls = []
  globalThis.fetch = async url => { const table = new URL(url).pathname.split('/').at(-1); calls.push(table); assert(['private_messages', 'profiles'].includes(table)); return json(rows[table]) }
  const response = await call({ channel: 'private' })
  assert.equal(response.code, 200); assert.deepEqual(Object.keys(response.data), ['messages']); assert.equal(calls.length, 2)
  const denied = await call({ channel: 'private' }, '')
  assert.equal(denied.code, 403); assert.equal(calls.length, 2)
})

test('swimmer credentials cannot request the coach inbox, before even a session or message lookup', async () => {
  globalThis.fetch = async () => assert.fail('No database lookup for coach inbox as swimmer')
  const denied = await call({ channel: 'private' }, 'swimmer-channel-fixture')
  assert.equal(denied.code, 403)
})
