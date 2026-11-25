import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTrainerPrivateMessages, loadTrainerThread, sendTrainerThreadMessage } from '../server/trainer-private-threads.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const first = '33333333-3333-4333-8333-333333333333'
const second = '44444444-4444-4444-8444-444444444444'
const date = '2026-11-25T16:00:00Z'
const json = data => new Response(JSON.stringify(data))

test('private thread lists only present for their recipient, and direct and linked messages stay distinct', async () => {
  const row = { sender_role: 'coach', recipient_role: 'swimmer', recipient_profile_id: alice, created_at: date }
  const messages = await loadTrainerPrivateMessages(alice, 100, async query => {
    const { searchParams } = new URL(query, 'http://fixture.invalid')
    assert.equal(searchParams.get('recipient_profile_id'), `eq.${alice}`)
    assert.equal(searchParams.get('recipient_role'), 'eq.swimmer')
    return json([
      { ...row, id: 'direct', content: 'Privat påminnelse' },
      { ...row, id: 'prior', content: 'Tidigare påminnelse' },
      { ...row, id: 'first question', reply_to_open_chat_id: first, content: 'Svar på första' },
      { ...row, id: 'second question', reply_to_open_chat_id: second, content: 'Svar på andra' },
      { ...row, recipient_profile_id: bob, content: 'Får inte synas' },
      { ...row, sender_role: 'swimmer', sender_profile_id: bob, content: 'Privat pepp' },
    ])
  })
  assert.deepEqual(messages.map(item => item.thread.id), [alice, first, second])
  assert(!JSON.stringify(messages).includes('Får inte synas'))
  assert(!JSON.stringify(messages).includes('Privat pepp'))
})

test('swimmer and coach can continue each question, with ownership and link checked on each access', async () => {
  const rows = []
  const db = async (query, options = {}) => {
    const url = new URL(query, 'http://fixture.invalid'), params = url.searchParams
    if (url.pathname === '/open_chat_messages') {
      const id = params.get('id').slice(3)
      return json([{ id, sender_role: 'swimmer', sender_profile_id: alice, content: 'Min fråga', created_at: date }])
    }
    if (url.pathname === '/profiles') return json([{ id: alice }])
    if (options.method === 'POST') {
      const row = { ...JSON.parse(options.body), id: String(rows.length + 1), created_at: date }
      rows.push(row)
      return json([row])
    }
    assert.match(params.get('or'), new RegExp(alice))
    return json([...rows].reverse())
  }
  const question = { kind: 'question', id: first }
  await sendTrainerThreadMessage({ ...question, role: 'coach', content: 'Mitt svar' }, db)
  await sendTrainerThreadMessage({ ...question, role: 'swimmer', profileId: alice, content: 'En följdfråga' }, db)
  await sendTrainerThreadMessage({ ...question, role: 'coach', content: 'Så här gör vi' }, db)
  await sendTrainerThreadMessage({ kind: 'question', id: second, role: 'coach', content: 'Separat ämne' }, db)

  const thread = await loadTrainerThread({ ...question, role: 'swimmer', profileId: alice }, db)
  assert.equal(thread.question.content, 'Min fråga')
  assert.deepEqual(thread.messages.map(item => [item.senderRole, item.content]), [['coach', 'Mitt svar'], ['swimmer', 'En följdfråga'], ['coach', 'Så här gör vi']])
  assert.equal(rows[1].sender_profile_id, alice)
  assert.equal(rows[1].recipient_role, 'coach')
  await assert.rejects(loadTrainerThread({ ...question, role: 'swimmer', profileId: bob }, db), { status: 404 })
  await assert.rejects(sendTrainerThreadMessage({ ...question, role: 'swimmer', profileId: bob, content: 'Försök' }, db), { status: 404 })
  assert.equal(rows.length, 4)
})

test('direct replies prove the swimmer owns the existing dialogue and leave the original question column null', async () => {
  let written
  const db = async (query, options = {}) => {
    if (options.method === 'POST') {
      written = JSON.parse(options.body)
      return json([{ ...written, id: first, created_at: date }])
    }
    const params = new URL(query, 'http://fixture.invalid').searchParams
    assert.equal(params.get('reply_to_open_chat_id'), 'is.null')
    assert.match(params.get('or'), new RegExp(alice))
    return json([{ id: first }])
  }
  const scope = { kind: 'direct', id: alice, role: 'swimmer', profileId: alice, content: 'Jag kommer' }
  await assert.rejects(sendTrainerThreadMessage({ ...scope, profileId: bob }, () => assert.fail('no query for someone else’s DM')), { status: 404 })
  const result = await sendTrainerThreadMessage(scope, db)
  assert.deepEqual(written, { sender_role: 'swimmer', recipient_role: 'coach', sender_profile_id: alice, content: 'Jag kommer' })
  assert.deepEqual(result.message.thread, { kind: 'direct', id: alice })
})
