import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { activityStreak, personalActivityStreak, shiftActivityDay, stockholmActivityDay, validActivityDay } from '../shared/activity-streak.js'
import { handleActivityCorrections } from '../server/activity-corrections.js'
import { loadActivityDates } from '../server/activity-history.js'
process.env.COACH_SESSION_SECRET = 'activity-corrections-test'
const { createCoachToken } = await import('../server/coach-auth.js')
const profileId = '11111111-1111-4111-8111-111111111111', actorId = '22222222-2222-4222-8222-222222222222'
const today = '2026-11-16', profile = { id: profileId, display_name: 'Fiktiv simmare', created_at: '2026-10-01T12:00:00Z' }
const json = data => ({ ok: true, json: async () => data })
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })
async function call({ role = 'superadmin', code, method = 'POST', changes = {}, read, own = false } = {}) {
  const target = own ? actorId : profileId, result = response(), calls = []
  await handleActivityCorrections({ method, headers: { 'x-simkoll-code': code ?? createCoachToken({ id: actorId, role, session_version: 2 }) }, query: { profileId: target }, body: { profileId: target, activityDate: '2026-11-12', reason: 'Saknad dag vid testning.', confirmed: true, ...changes } }, result, { today, read: read || (async (query, options) => {
    calls.push({ query, options })
    if (query.startsWith('profiles?')) return json([{ ...profile, id: target }])
    if (query.startsWith('profile_daily_activity?')) return json([{ activity_date: today }, { activity_date: '2026-11-15' }])
    if (query.startsWith('profile_activity_corrections?')) return json([])
    if (query === 'rpc/correct_profile_activity_day') return json({ added: true })
    assert.fail(`Unexpected query: ${query}`)
  }) })
  return { ...result, calls }
}
test('personal streaks ignore other swimmers, anonymous answers, duplicates, missing days and future records', () => {
  const dates = [today, '2026-11-15', '2026-11-13', '2026-11-12', '2026-11-17']
  const group = [{ profileId: 'other', activityDate: '2026-11-14' }, { activityDate: '2026-11-14' }]
  assert.equal(personalActivityStreak(dates, group, profileId, today), 2)
  assert.equal(personalActivityStreak(dates, [...group, { profileId, activityDate: '2026-11-14' }], profileId, today), 5)
  assert.equal(personalActivityStreak(dates, group, null, today), 0)
  assert.equal(activityStreak([today, today], today), 1)
  assert.equal(activityStreak(['2026-11-15'], today), 0)
  assert.equal(activityStreak([...dates, '2026-11-14'], today), 5)
})
test('calendar arithmetic follows Stockholm days over midnight, DST, leap days and year boundaries', () => {
  assert.equal(stockholmActivityDay(new Date('2026-11-15T23:05:00Z')), '2026-11-16')
  assert.equal(shiftActivityDay('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftActivityDay('2024-03-01', -1), '2024-02-29')
  assert.equal(shiftActivityDay('2026-03-30', -1), '2026-03-29')
  assert.equal(shiftActivityDay('2026-10-26', -1), '2026-10-25')
  assert.equal(validActivityDay('2026-02-29'), false)
  assert.equal(validActivityDay('2026-1-01'), false)
  assert.equal(personalActivityStreak([today], [{ profileId, createdAt: '2026-11-14T23:30:00Z' }], profileId, today), 2)
})
test('swimmers, coaches, head coaches and shared legacy codes cannot read or change correction data', async () => {
  for (const method of ['GET', 'POST']) for (const code of ['', 'legacy-coach', ...['swimmer', 'coach', 'head_coach'].map(role => createCoachToken({ id: actorId, role }))]) {
    const result = await call({ method, code, read: async () => assert.fail('No profile read allowed') })
    assert.equal(result.code, 403)
  }
})
test('superadmin can inspect or correct another swimmer and their own linked swimmer profile identically', async () => {
  for (const own of [false, true]) {
    const get = await call({ method: 'GET', own })
    assert.equal(get.code, 200); assert.equal(get.data.profile.id, own ? actorId : profileId)
    assert.equal(get.data.streak, 2); assert.equal(get.data.createdDay, '2026-10-01')
    const saved = await call({ own })
    assert.equal(saved.code, 200); assert.equal(saved.data.added, true)
    assert.equal(saved.calls.length, 2)
    const command = saved.calls[1]
    assert.equal(command.query, 'rpc/correct_profile_activity_day')
    assert.deepEqual(JSON.parse(command.options.body), { p_actor_id: actorId, p_session_version: 2, p_profile_id: own ? actorId : profileId, p_activity_date: '2026-11-12', p_reason: 'Saknad dag vid testning.' })
    assert(!JSON.stringify(saved.calls).includes('point_events'))
    assert(!JSON.stringify(saved.calls).includes('responses?'))
  }
})
test('date, target, reason and explicit confirmation are validated before the single mutation', async () => {
  for (const changes of [{ profileId: '../profiles' }, { activityDate: '2026-02-30' }, { activityDate: '2026-12-01' }, { activityDate: '2026-09-30' }, { reason: '' }, { reason: '  abc  ' }, { reason: 'x'.repeat(501) }, { reason: {} }, { confirmed: false }]) {
    let writes = 0
    const result = await call({ changes, read: async (_query, options) => { if (options?.method) writes++; return json([profile]) } })
    assert.equal(result.code, 400); assert.equal(writes, 0)
  }
  assert.equal((await call({ method: 'DELETE' })).code, 405)
  assert.equal((await call({ read: async () => json([]) })).code, 404)
})
test('duplicate days, missing migration, revoked DB authorization and read failures are explicit, never an unaudited fallback', async () => {
  for (const [result, status] of [[json({ added: false }), 200], [{ ok: false, status: 403 }, 403], [{ ok: false, status: 404 }, 503]]) {
    const calls = [], saved = await call({ read: async (query, options) => { calls.push({ query, options }); return query.startsWith('profiles?') ? json([profile]) : result } })
    assert.equal(saved.code, status); assert.equal(calls.filter(row => row.options?.method).length, 1)
    if (status === 200) assert.equal(saved.data.added, false)
  }
  const missing = await call({ method: 'GET', read: async query => query.startsWith('profiles?') ? json([profile]) : query.startsWith('profile_daily_activity?') ? json([]) : { ok: false } })
  assert.equal(missing.code, 503); assert.match(missing.data.error, /123/)
  assert.equal((await call({ read: async () => { throw new Error('private backend failure') } })).code, 503)
})
test('activity history is paginated and no longer clips a streak at 120 days', async () => {
  const rows = Array.from({ length: 630 }, (_, index) => ({ activity_date: shiftActivityDay(today, -index) })), calls = []
  const dates = await loadActivityDates(profileId, async query => { calls.push(query); const offset = Number(new URLSearchParams(query.split('?')[1]).get('offset')); return json(rows.slice(offset, offset + 500)) }, today)
  assert.equal(dates.length, 630); assert.equal(activityStreak(dates, today), 630)
  assert.equal(calls.length, 2); assert(calls.every(query => query.includes(`profile_id=eq.${profileId}`)))
  await assert.rejects(loadActivityDates(profileId, async () => ({ ok: false })), /fullständigt/)
  await assert.rejects(loadActivityDates(profileId, async () => json(rows.slice(0, 500))), /fullständigt/)
})
test('migration is service-only, atomic, append-only and duplicate-safe with no reward/training writes', async () => {
  const sql = await readFile(new URL('../supabase/migrations/123_profile_activity_corrections.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]*to service_role/i)
  assert.match(sql, /role = 'superadmin'[\s\S]*session_version = p_session_version/i)
  assert.match(sql, /on conflict \(profile_id, activity_date\) do nothing/i)
  assert.match(sql, /insert into public\.profile_activity_corrections/)
  assert.match(sql, /insert into public\.audit_logs/)
  assert.doesNotMatch(sql, /exception when|insert into public\.(point_events|responses|personal_training_sessions)|delete from/i)
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /accountRole === 'superadmin' && <ActivityCorrection/)
  assert.match(main, /personalActivityStreak\(activityDates, responses, profile\?\.id/)
})
