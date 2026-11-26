import test from 'node:test'
import assert from 'node:assert/strict'
import { loadInfoChannel, loadCoachInbox } from '../server/community-channels.js'
const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', parent = '33333333-3333-4333-8333-333333333333'
const json = data => ({ ok: true, json: async () => data })
const settings = { openChat: { enabled: true, swimmerPrivate: true } }
const directory = [{ id, display_name: 'Demo', emoji: '🐬' }, { id: other, display_name: 'Other', emoji: '🐢' }]

test('coach information has one direct preview per swimmer and keeps linked replies under their question', async () => {
  const calls = []
  const earlier = '2026-11-15T13:00:00Z', later = '2026-11-16T13:00:00Z'
  const outgoing = { content: 'Private reply', recipient_profile_id: id, recipient_role: 'swimmer', sender_role: 'coach' }
  const incoming = { content: 'Follow-up from the swimmer', sender_profile_id: id, recipient_role: 'coach', sender_role: 'swimmer' }
  const result = await loadInfoChannel(settings, 'coach', null, async query => {
    calls.push(query)
    if (query.startsWith('profiles?')) return json(directory)
    if (query.startsWith('open_chat_messages?')) return json([{ id: parent, sender_profile_id: id, sender_role: 'swimmer', visibility: 'coaches', content: 'Private question', created_at: '2026-11-15T12:00:00Z' }])
    if (query.includes('reply_to_open_chat_id=is.null')) {
      assert.match(query, /sender_role.eq.coach,recipient_role.eq.swimmer/)
      return json([
        { ...outgoing, id: 'reminder', content: 'A private reminder', created_at: later },
        { ...incoming, id: 'direct-in', created_at: earlier },
        { ...outgoing, id: 'foreign', recipient_profile_id: other, sender_role: 'swimmer', content: 'DO NOT SEND', created_at: later },
        { ...outgoing, id: 'linked', reply_to_open_chat_id: parent, created_at: later },
      ])
    }
    assert.match(query, /^private_messages\?reply_to_open_chat_id=in\./)
    return json([
      { ...outgoing, id: 'linked', reply_to_open_chat_id: parent, created_at: earlier },
      { ...incoming, id: 'linked-in', reply_to_open_chat_id: parent, created_at: later },
      { ...incoming, id: 'wrong-swimmer', sender_profile_id: other, content: 'DO NOT SEND', reply_to_open_chat_id: parent, created_at: later },
    ])
  })
  assert.equal(calls.length, 4)
  const question = result.openChat.messages[0]
  assert.equal(question.privateThread.latest.content, 'Follow-up from the swimmer')
  assert.deepEqual(question.privateThread.latest.thread, { kind: 'question', id: parent })
  assert.equal(question.privateThread.latestIncoming.id, 'linked-in')
  assert.equal(result.openChat.privateThreads.length, 1)
  const [direct] = result.openChat.privateThreads
  assert.deepEqual(direct.latest.thread, { kind: 'direct', id })
  assert.equal(direct.latest.content, 'A private reminder')
  assert.equal(direct.latestIncoming.id, 'direct-in', 'a later outgoing message does not hide an unread incoming reply')
  assert.equal(direct.swimmer.displayName, 'Demo')
  assert(!JSON.stringify(result).includes('DO NOT SEND'))
})

test('swimmer chat keeps recipient SQL filters and defensive visibility checks, including private replies', async () => {
  const result = await loadInfoChannel(settings, 'swimmer', directory[0], async query => {
    assert(!query.startsWith('profiles?'), 'the viewer is already available through their authenticated session')
    if (query.startsWith('open_chat_messages?')) {
      assert(query.includes(`sender_profile_id.eq.${id}`))
      return json([
        { id: parent, sender_profile_id: id, sender_role: 'swimmer', visibility: 'coaches', content: 'Own question', created_at: '2026-11-15T12:00:00Z' },
        { id: 'other-question', sender_profile_id: other, sender_role: 'swimmer', visibility: 'coaches', content: 'DO NOT SEND', created_at: '2026-11-15T12:00:00Z' },
        { id: 'coach', sender_profile_id: null, sender_role: 'coach', visibility: 'all', content: 'Public info', created_at: '2026-11-15T13:00:00Z' },
      ])
    }
    assert(query.includes(`recipient_profile_id=eq.${id}`))
    return json([{ id: 'foreign-reply', content: 'DO NOT SEND', reply_to_open_chat_id: parent, recipient_profile_id: other, recipient_role: 'swimmer', sender_role: 'coach' }])
  })
  assert.deepEqual(result.openChat.messages.map(row => row.content), ['Own question', 'Public info'])
  assert(!JSON.stringify(result).includes('DO NOT SEND'))
  assert.equal(result.openChat.messages[0].privateReplies.length, 0)
  assert.equal(Object.hasOwn(result.openChat, 'privateThreads'), false)
})

test('disabled information channel does no reads; bad identities are denied; failed reads are not empty chats', async () => {
  assert.equal((await loadInfoChannel({}, 'coach', null, () => assert.fail('No read'))).openChat.enabled, false)
  await assert.rejects(loadInfoChannel(settings, 'swimmer', '', () => assert.fail('No read')))
  await assert.rejects(loadInfoChannel(settings, 'coach', null, async () => ({ ok: false })))
})

test('coach inbox reads only private messages and display identity, never public feed or swimmer-to-swimmer pepp', async () => {
  const queries = []
  const result = await loadCoachInbox(async query => {
    queries.push(query)
    if (query.startsWith('profiles?')) return json(directory)
    assert(query.includes('recipient_role.eq.coach,sender_role.eq.coach'))
    assert(!query.includes('select=*'))
    return json([
      { id: 'allowed', sender_role: 'coach', recipient_role: 'swimmer', recipient_profile_id: id, content: 'Allowed' },
      { id: 'private-pepp', sender_role: 'swimmer', recipient_role: 'swimmer', sender_profile_id: id, recipient_profile_id: other, content: 'DO NOT SEND' },
    ])
  })
  assert.equal(queries.length, 2); assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].recipient.id, id)
})
