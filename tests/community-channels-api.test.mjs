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
async function call(query, requestCode = code, cookie = '') {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method: 'GET', query, headers: { 'x-simkoll-code': requestCode, cookie } }, response)
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
  assert.deepEqual(calls, ['app_settings', 'open_chat_messages']); assert.match(response.headers['Cache-Control'], /no-store/)
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

test('swimmer chat fetches only its active channel and never writes activity as part of polling', async () => {
  const profileId = '11111111-1111-4111-8111-111111111111'
  const otherId = '22222222-2222-4222-8222-222222222222'
  const calls = []
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw)
    const table = url.pathname.split('/').at(-1)
    assert(!options.method, 'polling must be read only')
    calls.push(table)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json(url.searchParams.has('approval_status')
      ? [{ id: profileId, display_name: 'Du', emoji: '🐬' }]
      : [{ id: profileId, display_name: 'Du', emoji: '🐬' }, { id: otherId, display_name: 'Simmare', emoji: '🏊' }])
    if (table === 'community_reactions') {
      assert.equal(url.searchParams.get('message_id'), 'in.(post)')
      return json([{ message_type: 'coach_post', message_id: 'post', emoji: '👍', actor_key: `swimmer:${profileId}` }])
    }
    if (table === 'private_messages') {
      assert.match(url.searchParams.get('or'), new RegExp(profileId))
      return json([
        { id: 'own', recipient_profile_id: profileId, sender_role: 'coach', content: 'Ditt svar' },
        { id: 'other', recipient_profile_id: otherId, sender_role: 'coach', content: 'Uteslut detta' },
      ])
    }
    return json(rows[table] || [])
  }
  const read = query => call(query, 'swimmer-channel-fixture', 'simkoll_session=fixture')
  const group = await read({ channel: 'club' })
  assert.equal(group.code, 200)
  assert.deepEqual(group.data.items[0].reactions, [{ emoji: '👍', count: 1, reacted: true }])
  assert(!calls.some(table => ['app_settings', 'open_chat_messages', 'kudos', 'private_messages'].includes(table)))

  calls.length = 0
  const privateHistory = await read({ channel: 'swimmer-private' })
  assert.equal(privateHistory.code, 200)
  assert.deepEqual(privateHistory.data.messages.map(row => row.content), ['Ditt svar'])
  assert.deepEqual(privateHistory.data.recipients.map(row => row.id), [otherId])
  assert(!calls.some(table => ['app_settings', 'community_reactions', 'community_posts', 'group_pep', 'open_chat_messages'].includes(table)))

  calls.length = 0
  const coachInfo = await read({ openChat: 'true' })
  assert.equal(coachInfo.code, 200)
  assert.deepEqual(calls, ['profile_sessions', 'profiles', 'app_settings', 'open_chat_messages'])
})
