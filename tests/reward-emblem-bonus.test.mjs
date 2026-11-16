import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
process.env.SUPABASE_URL = 'https://emblem-bonus.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'fixture-swimmer'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
const { default: handler } = await import('../api/points.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { validEmblemRequestId, rewardEmblemBonus } = await import('../server/reward-emblem-bonus.js')
const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })
const call = async (options = {}) => { const res = response(); await handler({ method: 'POST', query: {}, headers: { 'x-simkoll-code': 'fixture-swimmer', cookie: 'simkoll_session=fixture' }, body: { action: 'tap-emblem', requestId }, ...options }, res); return res }

test('tap endpoint derives the target from the active session, ignores client points/date/profile, and returns authoritative progress', async () => {
  const calls = []
  globalThis.fetch = async (raw, options) => {
    const table = new URL(raw).pathname.split('/').at(-1); calls.push(table)
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') return json([{ id, is_test_profile: false }])
    if (table === 'reward_levels') return json([{ id: 1, name: 'Brons', emoji: '🥉', min_points: 0 }, { id: 2, name: 'Silver', emoji: '🥈', min_points: 50 }])
    assert.equal(table, 'reward_emblem_bonus')
    assert.deepEqual(JSON.parse(options.body), { p_profile_id: id, p_request_id: requestId })
    return json({ date: '2026-11-17', used: 3, limit: 5, awarded: 1, replayed: false, total: 51 })
  }
  const res = await call({ body: { action: 'tap-emblem', requestId, profileId: other, date: '1900-01-01', points: 99999, limit: 50 } })
  assert.equal(res.code, 200); assert.equal(res.data.total, 51); assert.equal(res.data.current.name, 'Silver')
  assert.equal(res.data.emblemBonus.used, 3); assert.equal(res.data.emblemBonus.awarded, 1)
  assert.deepEqual(calls, ['profile_sessions', 'profiles', 'reward_levels', 'reward_emblem_bonus'])
})

test('tap rejects wrong method/role, anonymous, expired, test profiles and malformed IDs before a bonus write', async () => {
  let writes = 0
  globalThis.fetch = async raw => {
    const table = new URL(raw).pathname.split('/').at(-1)
    if (table === 'coach_accounts') return json([{ id }])
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') return json([{ id, is_test_profile: true }])
    writes++; assert.fail(table)
  }
  assert.equal((await call({ method: 'GET' })).code, 405)
  for (const role of ['coach', 'head_coach', 'superadmin']) assert.equal((await call({ headers: { 'x-simkoll-code': createCoachToken({ id, role }) } })).code, 403)
  assert.equal((await call({ headers: {} })).code, 403)
  assert.equal((await call({ headers: { 'x-simkoll-code': 'fixture-swimmer' } })).code, 403)
  assert.equal((await call()).code, 403)
  globalThis.fetch = async raw => json(new URL(raw).pathname.endsWith('/profiles') ? [{ id }] : [{ profile_id: id }])
  for (const bad of [undefined, '', other + 'x', 123, {}, 'not-a-uuid']) assert.equal((await call({ body: { action: 'tap-emblem', requestId: bad } })).code, 400)
  globalThis.fetch = async () => json([])
  assert.equal((await call()).code, 403)
  assert.equal(writes, 0)
  assert.equal(validEmblemRequestId(requestId), true)
})

test('missing migration fails the bonus clearly, but existing points still load without falsely advertising a bonus', async () => {
  globalThis.fetch = async raw => {
    const table = new URL(raw).pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') return json([{ id }])
    if (table === 'reward_levels') return json([{ id: 1, name: 'Brons', emoji: '🥉', min_points: 0 }])
    if (table === 'reward_emblem_bonus') return json({}, 404)
    if (table === 'reward_point_totals') return json({ [id]: 42 })
    assert.equal(table, 'point_events'); return json([])
  }
  const res = await call(); assert.equal(res.code, 503); assert.match(res.data.error, /SQL 129/)
  const get = await call({ method: 'GET', body: undefined })
  assert.equal(get.code, 200); assert.equal(get.data.total, 42); assert.equal(get.data.emblemBonus.available, false)
})

test('RPC quota, replay and totals are validated rather than trusting corrupt responses', async () => {
  const good = { date: '2026-11-17', used: 5, limit: 5, awarded: 0, replayed: false, total: 883 }
  globalThis.fetch = async () => json(good)
  assert.deepEqual(await rewardEmblemBonus(id, requestId), good)
  globalThis.fetch = async () => json({ ...good, replayed: true })
  assert.equal((await rewardEmblemBonus(id, requestId)).awarded, 0)
  for (const bad of [{ used: 6 }, { used: -1 }, { limit: 50 }, { awarded: 5 }, { total: '883' }, { total: -1 }, { date: '' }, { replayed: undefined }]) {
    globalThis.fetch = async () => json({ ...good, ...bad })
    await assert.rejects(rewardEmblemBonus(id, requestId), /Invalid emblem/)
  }
})

test('real card is keyboard accessible, bounded, reduced-motion aware and only the own-profile home wires up bonus writes', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8')
  const [card, hook, css, main] = await Promise.all(['../src/reward-level-card.jsx', '../src/reward-emblem-tap.js', '../src/reward-level-card.css', '../src/main.jsx'].map(read))
  assert.match(card, /<button type="button" className="reward-emblem-touch"/)
  assert.match(card, /onClick=\{reaction.tap\}/); assert.match(card, /role="status" aria-live="polite"/)
  assert.match(hook, /busy.current/); assert.match(hook, /pendingId.current \|\|= crypto.randomUUID/)
  assert.match(hook, /clearTimeout\(timer.current\)/); assert.doesNotMatch(hook, /setInterval|localStorage|setPoints/)
  assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /reward-emblem-touch:focus-visible/)
  assert.match(main, /onEmblemTap=\{!profile.isTestProfile \? tapEmblem : undefined\}/)
  assert.match(main, /JSON.stringify\(\{ action: 'tap-emblem', requestId \}\)/)
})
