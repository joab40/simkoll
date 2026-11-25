import test from 'node:test'
import assert from 'node:assert/strict'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'

process.env.SUPABASE_URL = 'https://entry-reminder-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-only'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { loadTrainerPrivateMessages } = await import('../server/trainer-private-threads.js')

const competitionId = '11111111-1111-4111-8111-111111111111'
const profileId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const coach = createCoachToken({ id: 'fixture-coach', role: 'coach' })
const activeProfile = { id: profileId, active: true, approval_status: 'approved', is_test_profile: false, training_group: 'junior' }
const body = { action: 'competition-entry-reminder', competitionId, profileId, requestId }
const json = rows => new Response(JSON.stringify(rows))

async function post(input = body, code = coach) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method: 'POST', headers: { 'x-simkoll-code': code }, body: input }, response)
  return response
}

function mockDatabase(t, { entries = [], profiles = [activeProfile], entriesOpen = true, overrides = {}, failEntries = false } = {}) {
  const messages = new Map()
  const writeAttempts = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1), params = url.searchParams
    if (table === 'competition_calendar') {
      assert.equal(params.get('id'), `eq.${competitionId}`)
      return json([{ id: competitionId, title: 'Vinterpokalen', entries_open: entriesOpen, target_groups: ['junior'], participant_overrides: overrides }])
    }
    if (table === 'profiles') {
      assert.equal(params.get('id'), `eq.${profileId}`)
      return json(profiles)
    }
    if (table === 'competition_entries') {
      assert.equal(params.get('competition_id'), `eq.${competitionId}`)
      assert.equal(params.get('profile_id'), `eq.${profileId}`)
      assert.equal(params.get('status'), 'in.(submitted,approved)')
      return failEntries ? new Response(null, { status: 503 }) : json(entries)
    }
    assert.equal(table, 'private_messages')
    if (options.method === 'POST') {
      assert.equal(params.get('on_conflict'), 'id')
      assert.match(options.headers.Prefer, /ignore-duplicates/)
      const payload = JSON.parse(options.body)
      assert.equal(payload.id, requestId)
      assert.equal(payload.recipient_profile_id, profileId)
      assert.equal(payload.recipient_role, 'swimmer')
      assert.equal(payload.sender_role, 'coach')
      assert.equal(payload.reply_to_open_chat_id, undefined)
      writeAttempts.push(payload)
      if (messages.has(payload.id)) return json([])
      const row = { ...payload, created_at: '2026-11-25T12:00:00Z' }
      messages.set(payload.id, row)
      return json([row])
    }
    if (params.has('id')) return json([...messages.values()].filter(row => params.get('id') === `eq.${row.id}`))
    assert.equal(params.get('recipient_profile_id'), `eq.${profileId}`)
    return json([...messages.values()])
  })
  return { messages, writeAttempts }
}

test('a reminder is a private trainer message; retrying the same request writes only one message', async t => {
  const { messages, writeAttempts } = mockDatabase(t, { entries: [{ status: 'draft' }] })
  assert.equal((await post()).code, 201)
  assert.equal((await post()).code, 200)
  assert.equal(writeAttempts.length, 2)
  assert.equal(messages.size, 1)
  const [message] = await loadTrainerPrivateMessages(profileId, 1)
  assert.deepEqual(message.thread, { kind: 'direct', id: profileId })
  assert.match(message.content, /grenval till Vinterpokalen.*Öppna Tävlingsanmälningar/)
})

test('closed registration offers a reply to the coach, and explicit participation overrides still apply', async t => {
  const { messages } = mockDatabase(t, { entriesOpen: false, profiles: [{ ...activeProfile, training_group: 'other' }], overrides: { [profileId]: true } })
  assert.equal((await post()).code, 201)
  const message = messages.get(requestId)
  assert.match(message.content, /stängd just nu.*Svara här/)
})

test('each send rechecks the roster and submitted status before writing a private message', async t => {
  for (const fixture of [
    { options: { entries: [{ status: 'submitted' }] }, status: 409 },
    { options: { entries: [{ status: 'approved' }] }, status: 409 },
    { options: { overrides: { [profileId]: false } }, status: 409 },
    { options: { profiles: [{ ...activeProfile, is_test_profile: true }] }, status: 409 },
    { options: { failEntries: true }, status: 503 },
  ]) {
    await t.test(JSON.stringify(fixture.options), async subtest => {
      const { writeAttempts } = mockDatabase(subtest, fixture.options)
      assert.equal((await post()).code, fixture.status)
      assert.equal(writeAttempts.length, 0)
    })
  }
})

test('non-coaches and invalid ids cannot initiate a reminder', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('no database read for an unauthorized reminder'))
  assert.equal((await post(body, 'swimmer-fixture')).code, 403)
  assert.equal((await post({ ...body, competitionId: 'invalid' })).code, 400)
})
