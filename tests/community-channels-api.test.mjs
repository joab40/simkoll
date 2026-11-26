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
async function call(query, requestCode = code, cookie = '', body) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method: body ? 'POST' : 'GET', query, body, headers: { 'x-simkoll-code': requestCode, cookie } }, response)
  return response
}

test('real coach info route reads direct previews and skips unrelated feeds', async () => {
  const calls = []
  globalThis.fetch = async url => {
    const table = new URL(url).pathname.split('/').at(-1); calls.push(table)
    assert(['app_settings', 'private_messages', 'profiles', 'open_chat_messages'].includes(table), table)
    if (table === 'private_messages') assert.equal(new URL(url).searchParams.get('reply_to_open_chat_id'), 'is.null')
    return json(rows[table])
  }
  const response = await call({ openChat: 'true' })
  assert.equal(response.code, 200); assert.equal(response.data.openChat.messages[0].content, 'Public info')
  assert.deepEqual(calls, ['app_settings', 'private_messages', 'open_chat_messages']); assert.match(response.headers['Cache-Control'], /no-store/)
  assert.deepEqual(Object.keys(response.data), ['openChat'])
})

test('coach info sends counts up front and returns unseen names only on an authorized detail request', async () => {
  const messageId = '22222222-2222-4222-8222-222222222222'
  const missingMessageId = '33333333-3333-4333-8333-333333333333'
  const unseen = [{ id: '11111111-1111-4111-8111-111111111111', displayName: 'Demo', emoji: '🐬' }]
  const calls = []
  globalThis.fetch = async (raw, options) => {
    const table = new URL(raw).pathname.split('/').at(-1)
    calls.push(table)
    switch (table) {
      case 'app_settings': return json(rows.app_settings)
      case 'private_messages': return json([])
      case 'open_chat_messages': return json([{ ...rows.open_chat_messages[0], id: messageId, visibility: 'group' }])
      case 'open_chat_coach_read_totals':
        assert.deepEqual(JSON.parse(options.body), { p_message_ids: [messageId] })
        return json([{ message_id: messageId, seen_count: 8, recipient_count: 9, like_count: 2 }])
      case 'open_chat_coach_read_details':
        return json(JSON.parse(options.body).p_message_id === messageId ? [{ seen_count: 8, recipient_count: 9, unseen }] : [])
      default: assert.fail(table)
    }
  }
  const channel = await call({ openChat: 'true' })
  assert.equal(channel.code, 200)
  assert.deepEqual(channel.data.openChat.messages[0].engagement, { seenCount: 8, recipientCount: 9, likeCount: 2 })
  assert.deepEqual(calls, ['app_settings', 'private_messages', 'open_chat_messages', 'open_chat_coach_read_totals'])
  const detail = await call({ openChatReadDetails: messageId })
  assert.equal(detail.code, 200)
  assert.deepEqual(detail.data, { seenCount: 8, recipientCount: 9, unseen })
  assert.match(detail.headers['Cache-Control'], /no-store/)
  assert.equal((await call({ openChatReadDetails: missingMessageId })).code, 404)
  assert.equal((await call({ openChatReadDetails: 'invalid' })).code, 404)
  calls.length = 0
  assert.equal((await call({ openChatReadDetails: messageId }, 'swimmer-channel-fixture')).code, 403)
  assert.equal((await call({ openChatReadDetails: messageId }, '')).code, 403)
  assert.deepEqual(calls, [])
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

test('only the authenticated swimmer can record views or likes, and responses contain only totals and own state', async () => {
  const profileId = '11111111-1111-4111-8111-111111111111'
  const messageId = '22222222-2222-4222-8222-222222222222'
  const writes = []
  globalThis.fetch = async (raw, options = {}) => {
    const table = new URL(raw).pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId }])
    assert.equal(table, 'save_open_chat_engagement')
    const payload = JSON.parse(options.body)
    writes.push(payload)
    return json([{ message_id: messageId, seen_count: 12, like_count: 1, seen: true, liked: payload.p_liked === true }])
  }
  const body = { action: 'record-open-chat-views', messageIds: [messageId, messageId], profileId: messageId }
  assert.equal((await call({}, code, '', body)).code, 403)
  assert.equal((await call({}, 'swimmer-channel-fixture', '', body)).code, 403)
  assert.equal(writes.length, 0)
  const swimmer = body => call({}, 'swimmer-channel-fixture', 'simkoll_session=fixture', body)
  const seen = await swimmer(body)
  assert.equal(seen.code, 200)
  assert.deepEqual(writes.at(-1), { p_message_ids: [messageId], p_profile_id: profileId, p_liked: null })
  const liked = await swimmer({ action: 'set-open-chat-like', messageId, liked: true })
  assert.equal(liked.code, 200)
  assert.deepEqual(liked.data.engagement, [{ messageId, seenCount: 12, likeCount: 1, seen: true, liked: true }])
  assert.equal(writes.length, 2)
})
