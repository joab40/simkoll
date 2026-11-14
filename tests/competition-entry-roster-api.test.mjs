import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://competition-roster-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const coach = createCoachToken({ id: 'fixture-coach', role: 'coach' })
const competition = { id: 'competition', target_groups: ['junior'] }
const profile = { id: 'swimmer', display_name: 'Anna', emoji: '🐬', training_group: 'junior', active: true, approval_status: 'approved', is_test_profile: false, email: 'private@example.invalid', pin_hash: 'never-return' }
const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data, text: async () => '' })
async function get({ roster = true, swimmer = false } = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method: 'GET', query: { program: 'true', id: 'competition', ...(roster ? { submissionRoster: 'true' } : {}) }, headers: swimmer ? { cookie: 'simkoll_session=fixture' } : { 'x-simkoll-code': coach } }, response)
  return response
}
function fixture({ profiles = [profile], entries = [], failRoster = false, targetGroups = ['junior'], reads = [] } = {}) {
  globalThis.fetch = async input => {
    const url = new URL(input); reads.push(url)
    if (url.pathname.endsWith('/profile_sessions')) return reply([{ profile_id: profile.id }])
    if (url.pathname.endsWith('/competition_calendar')) return reply([{ ...competition, target_groups: targetGroups }])
    if (url.pathname.endsWith('/competition_events')) return reply([])
    if (url.pathname.endsWith('/competition_entries')) { const offset = Number(url.searchParams.get('offset') || 0); return reply(entries.slice(offset, offset + Number(url.searchParams.get('limit') || entries.length))) }
    if (url.pathname.endsWith('/profiles')) {
      if (url.searchParams.has('active') && !url.searchParams.has('id')) { const offset = Number(url.searchParams.get('offset') || 0); return reply(failRoster ? [] : profiles.slice(offset, offset + 500), !failRoster) }
      return reply([profile])
    }
    throw new Error(`Unexpected read: ${url.pathname}`)
  }
}

test('coach roster is scoped and minimal even if the database mock returns extra fields and groups', async () => {
  const reads = []
  fixture({ reads, profiles: [profile, { ...profile, id: 'other', training_group: 'other' }, { ...profile, id: 'test', is_test_profile: true }], entries: [{ profile_id: profile.id, status: 'submitted' }] })
  const result = await get()
  assert.equal(result.code, 200)
  assert.equal(result.data.rosterAvailable, true)
  assert.deepEqual(result.data.roster, [{ id: 'swimmer', name: 'Anna', emoji: '🐬' }])
  assert.equal(result.data.entries[0].profileName, 'Anna')
  const directory = reads.find(url => url.searchParams.has('active'))
  assert.equal(directory.searchParams.get('approval_status'), 'eq.approved')
  assert.equal(directory.searchParams.get('is_test_profile'), 'eq.false')
  assert.doesNotMatch(directory.searchParams.get('select'), /email|pin/)
})

test('a group-wide competition covers all eligible groups, while no entries still returns the directory', async () => {
  fixture({ targetGroups: [], profiles: [profile, { ...profile, id: 'other', training_group: 'other' }] })
  const result = await get()
  assert.equal(result.data.roster.length, 2)
  assert.deepEqual(result.data.entries, [])
})

test('failed roster read preserves entries and explicitly disables missing-swimmer conclusions', async () => {
  fixture({ failRoster: true, entries: [{ profile_id: profile.id, status: 'draft' }] })
  const result = await get()
  assert.equal(result.code, 200)
  assert.equal(result.data.rosterAvailable, false)
  assert.equal(result.data.roster, null)
  assert.equal(result.data.entries.length, 1)
})

test('directory and entries are paginated to avoid marking swimmers missing due to row limits', async () => {
  const profiles = Array.from({ length: 501 }, (_, index) => ({ ...profile, id: `p-${index}` }))
  const entries = profiles.map(p => ({ id: `e-${p.id}`, profile_id: p.id, status: 'submitted' }))
  fixture({ profiles, entries })
  const result = await get()
  assert.equal(result.data.roster.length, 501)
  assert.equal(result.data.entries.length, 501)
})

test('truncated directory is unavailable, never a partial missing list', async () => {
  fixture({ profiles: Array.from({ length: 10000 }, (_, index) => ({ ...profile, id: `p-${index}` })) })
  const result = await get()
  assert.equal(result.data.rosterAvailable, false)
  assert.equal(result.data.roster, null)
})

test('swimmers cannot opt into the coach roster and ordinary program reads have no new directory query', async () => {
  for (const options of [{ swimmer: true }, { roster: false }]) {
    const reads = []
    fixture({ reads })
    const result = await get(options)
    assert.equal(result.code, 200)
    assert.equal(Object.hasOwn(result.data, 'roster'), false)
    assert.equal(reads.some(url => url.searchParams.has('active') && !url.searchParams.has('id')), false)
    if (options.swimmer) assert(reads.find(url => url.pathname.endsWith('/competition_entries')).searchParams.has('profile_id'))
  }
})

test('truncated entries return an error instead of a misleading progress count', async () => {
  fixture({ entries: Array.from({ length: 10000 }, (_, index) => ({ id: `e-${index}`, profile_id: profile.id, status: 'submitted' })) })
  const result = await get()
  assert.equal(result.code, 503)
  assert.equal(Object.hasOwn(result.data, 'roster'), false)
})
