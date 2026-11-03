import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
process.env.SUPABASE_URL = 'https://illness-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'illness-swimmer'
process.env.SIMKOLL_COACH_CODE = 'illness-coach'
const { default: handler } = await import('../api/responses.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const { coachWeekAddDays } = await import('../shared/coach-week.js')
const { followupSignals } = await import('../shared/followup-signals.js')
const { swimmerTrafficAt, buildSwimmerTraffic } = await import('../shared/swimmer-traffic.js')
const { buildCoachControlPanel } = await import('../shared/coach-control-panel.js')
const { loadSwimmerTraffic } = await import('../server/swimmer-traffic.js')
const { buildTrainingHeart } = await import('../shared/training-heart.js')
const { featureFaqGuide } = await import('../shared/feature-faq.js')
const today = stockholmDate(), before = n => coachWeekAddDays(today, -n)
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status })
const call = async ({ method = 'GET', query = { illness: 'true' }, body, code = 'illness-swimmer', cookie = 'simkoll_session=test' } = {}) => {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, query, body, headers: { 'x-simkoll-code': code, cookie } }, response)
  return response
}
const fixture = read => async (url, options = {}) => {
  const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
  assert.equal(parsed.hostname, 'illness-fixture.invalid')
  if (table === 'profile_sessions') return json([{ profile_id: owner }])
  if (table === 'profiles') return json([{ id: owner }])
  assert.equal(table, 'profile_daily_illness', 'no training, points, response or sleep writes')
  return read(parsed, options)
}
const illness = (status, n = 0, extra = {}) => ({ profile_id: owner, activity_date: before(n), status, ...extra })
const answer = (n, extra = {}) => ({ profileId: owner, date: before(n), activityDate: before(n), type: 'after', body: 4, feeling: 4, ...extra })
const signals = data => followupSignals({ asOf: today, ...data })

test('daily illness uses session owner, never supplied IDs, and requires an authenticated profile', async () => {
  globalThis.fetch = fixture((url, options) => {
    if (options.method === 'POST') assert.equal(JSON.parse(options.body).profile_id, owner)
    else assert.equal(url.searchParams.get('profile_id'), `eq.${owner}`)
    return json([])
  })
  assert.equal((await call({ query: { illness: 'true', profileId: other } })).code, 200)
  assert.equal((await call({ method: 'POST', body: { action: 'save-illness', date: today, status: 'mild', profileId: other } })).code, 200)
  for (const request of [{ cookie: '' }, { code: '' }, { method: 'POST', cookie: '', body: { action: 'save-illness', date: today, status: 'mild' } }, { method: 'POST', code: 'illness-coach', body: { action: 'save-illness', date: today, status: 'sick' } }]) assert.equal((await call(request)).code, 401)
})

test('once per day across devices, skip is not none; only explicit editing replaces the answer', async () => {
  const saved = new Map()
  globalThis.fetch = fixture((url, options) => {
    assert.equal(url.searchParams.get('on_conflict'), 'profile_id,activity_date')
    const row = JSON.parse(options.body)
    if (options.headers.Prefer === 'resolution=merge-duplicates' || !saved.has(row.activity_date)) saved.set(row.activity_date, row)
    else assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates')
    return json([])
  })
  const post = extra => call({ method: 'POST', body: { action: 'save-illness', date: today, status: 'none', ...extra } })
  await post({}); await post({ status: 'mild' }); assert.equal(saved.get(today).status, 'none')
  await post({ status: 'mild', replace: true }); assert.equal(saved.get(today).status, 'mild')
  await post({ skipped: true, replace: true }); assert.equal(saved.get(today).status, null)
  await post({ status: 'sick' }); assert.equal(saved.get(today).skipped, true)
  await post({ status: 'sick', replace: true }); assert.equal(saved.get(today).status, 'sick')
})

test('invalid dates/status/skip/edit flags cause no writes; yesterday is allowed', async () => {
  let writes = 0
  globalThis.fetch = fixture(() => { writes++; return json([]) })
  for (const extra of [{ date: before(2) }, { date: before(-1) }, { date: '2026-02-30' }, { status: 'diagnosis' }, { status: null }, { skipped: 'yes' }, { replace: 'yes' }]) assert.equal((await call({ method: 'POST', body: { action: 'save-illness', date: today, status: 'none', ...extra } })).code, 400)
  assert.equal(writes, 0)
  assert.equal((await call({ method: 'POST', body: { action: 'save-illness', date: before(1), status: 'sick' } })).code, 200)
})

test('coach reads are private, scoped and paginated; malformed/future/oversize ranges are rejected', async () => {
  const offsets = []
  globalThis.fetch = fixture((url, options) => {
    assert.equal(options.method, undefined)
    for (const key of ['active', 'approval_status', 'is_test_profile']) assert.ok(url.searchParams.has(`profiles.${key}`))
    offsets.push(url.searchParams.get('offset'))
    return json(offsets.length === 1 ? Array(500).fill(illness('mild')) : [])
  })
  const result = await call({ code: 'illness-coach', cookie: '' })
  assert.equal(result.code, 200); assert.equal(result.data.records.length, 500)
  assert.match(result.headers['Cache-Control'], /no-store/); assert.deepEqual(offsets, ['0', '500'])
  for (const query of [{ start: '2026-02-30' }, { end: before(-1) }, { start: before(368) }, { profileId: 'bad' }]) assert.equal((await call({ code: 'illness-coach', query: { illness: 'true', ...query } })).code, 400)
})

test('missing migration is visibly unavailable, other failures never become empty healthy data', async () => {
  globalThis.fetch = fixture(() => json({ code: '42P01' }, 404))
  const missing = await call()
  assert.equal(missing.code, 200); assert.equal(missing.data.available, false); assert.match(missing.data.warning, /112/)
  assert.equal((await call({ method: 'POST', body: { action: 'save-illness', date: today, status: 'none' } })).code, 503)
  globalThis.fetch = fixture(() => json({ error: 'unavailable' }, 503))
  assert.equal((await call()).code, 503)
  globalThis.fetch = fixture(url => url.searchParams.get('offset') === '0' ? json(Array(500).fill(illness('mild'))) : json({}, 503))
  assert.equal((await call()).code, 503, 'a later page failure must discard partial data')
})

test('heavy training alone and duplicate answers cannot create a red pattern', () => {
  const duplicates = Array(10).fill(answer(0, { body: 1, feeling: 1, rpe: 10 }))
  assert.equal(signals({ responses: duplicates }).color, 'yellow')
  assert.deepEqual(signals({ responses: duplicates }).days.both, [today])
  assert.equal(signals({ responses: [0, 1].map(n => answer(n, { body: 1, feeling: 1 })) }).color, 'yellow')
  assert.equal(signals({ responses: [0, 1, 2].map(n => answer(n, { body: 1 })) }).color, 'yellow')
  assert.equal(signals({ responses: [0, 1, 2].map(n => answer(n, { rpe: 10 })) }).color, 'yellow')
  assert.equal(signals({ responses: [0, 1, 2].map(n => answer(n, { body: 2, feeling: 2 })) }).color, 'green')
  assert.equal(signals({ responses: [2, 3, 4].map(n => answer(n, { body: 1, feeling: 1 })) }).color, 'yellow')
  assert.equal(signals({ responses: [0, 1, 2].map(n => answer(n, { body: 1 })).concat([3, 4, 5].map(n => answer(n, { feeling: 1 }))) }).color, 'yellow')
})

test('illness is explicit, immediate and independent from training load, rest choice or race concern', () => {
  assert.equal(signals({ illness: [illness('sick')], responses: [answer(0, { rpe: 1 })] }).color, 'red')
  assert.equal(signals({ illness: [illness('mild')] }).color, 'yellow')
  assert.equal(signals({ illness: [0, 1, 2].map(n => illness('mild', n)) }).color, 'red')
  assert.equal(signals({ illness: Array(5).fill(illness('mild')) }).color, 'yellow')
  assert.equal(signals({ illness: [illness('sick', 2)] }).color, 'yellow')
  assert.equal(signals({ illness: [illness('sick', 1), illness('none')] }).illness.current, null)
  assert.equal(signals({ illness: [illness('mild', 1), illness('sick', -1)] }).illness.current.status, 'mild')
  assert.equal(signals({ illness: [illness('none', 0, { skipped: true })] }).hasData, false)
  assert.equal(signals({ responses: [answer(0, { raceConcern: 'sick_or_pain' })] }).color, 'green')
  assert.equal(signals({ responses: [answer(0, { type: 'sick' })] }).color, 'red')
})

test('card, colour comparison and control panel share daily health rules and isolate profiles', () => {
  const profiles = [{ id: owner, displayName: 'A' }, { id: other, displayName: 'B' }]
  const illnessRecords = [illness('sick')], responses = [answer(0, { body: 1 }), answer(1, { body: 1 })]
  const traffic = buildSwimmerTraffic(profiles, { responses, illness: illnessRecords }, today)
  const panel = buildCoachControlPanel(profiles, responses, today, [], { illnessRecords })
  assert.equal(traffic.profiles[0].current.color, 'red'); assert.equal(panel.followUps[0].profileId, owner)
  assert.equal(panel.sickSwimmers, 1); assert.equal(panel.sickDays, 1)
  assert.deepEqual(traffic.profiles[0].current.reasons, panel.followUps[0].reasons)
  assert.equal(traffic.profiles[1].current.color, 'unknown'); assert.equal(panel.swimmers[1].illness.latest, null)
  const planningOnly = swimmerTrafficAt({ plans: [0, 1, 2].map(n => ({ date: before(n), slot: 'strength' })) }, today)
  assert.equal(planningOnly.color, 'unknown'); assert.equal(planningOnly.reasons.length, 0)
  const deduped = buildCoachControlPanel(profiles, [answer(0, { type: 'sick' })], today, [], { illnessRecords })
  assert.equal(deduped.sickDays, 1)
})

test('new illness answers block positive heart signals without modifying load or misreading skipped/old answers', () => {
  const responses = [0, 1].map(n => answer(n, { body: 5, feeling: 5, speedFeeling: 5, activityType: 'swim', activityMinutes: 30, rpe: 1 }))
  const sleep = [0, 1].map(n => ({ activity_date: before(n), minutes: 540, quality: 5 }))
  const build = illness => buildTrainingHeart({ responses, sleep, illness }, today)
  assert.equal(build([]).readiness.state, 'ready')
  for (const status of ['mild', 'sick']) {
    assert.equal(build([illness(status)]).readiness.state, 'watch')
    assert.equal(build([illness(status)]).load.value, build([]).load.value)
  }
  assert.equal(build([illness('sick', 3)]).readiness.state, 'ready')
  assert.equal(build([illness('mild', 1), illness('none')]).readiness.state, 'ready')
  assert.equal(build([illness('sick', 0, { skipped: true })]).readiness.state, 'ready')
  assert.equal(buildTrainingHeart({ responses, sleep, illnessAvailable: false }, today).readiness.state, 'unknown')
})

test('traffic loader projects bounded illness records; missing table is explicit, failed/partial sources fail', async () => {
  const read = async query => ({ ok: true, json: async () => query.startsWith('profiles?') ? [{ id: owner }] : query.startsWith('profile_daily_illness?') ? [illness('sick')] : [] })
  const report = await loadSwimmerTraffic(today, read)
  assert.equal(report.profiles[0].current.color, 'red'); assert.equal(report.illnessAvailable, true)
  const missing = await loadSwimmerTraffic(today, async query => query.startsWith('profile_daily_illness?') ? { ok: false, json: async () => ({ code: 'PGRST205' }) } : read(query))
  assert.equal(missing.illnessAvailable, false)
  assert.equal(missing.profiles[0].heart.illness.available, false)
  await assert.rejects(loadSwimmerTraffic(today, async query => query.startsWith('profile_daily_illness?') ? { ok: false, json: async () => ({}) } : read(query)), /fullständigt/)
  await assert.rejects(loadSwimmerTraffic(today, async query => query.startsWith('profile_daily_illness?') ? { ok: true, json: async () => Array(500).fill(illness('mild')) } : read(query)), /fullständigt/)
})

test('both FAQs explain the function; private answers do not flow into assistant or talk context loaders', () => {
  for (const role of ['coach', 'swimmer']) assert.match(featureFaqGuide(role), /Känner du dig sjuk eller på väg att bli sjuk/)
  for (const file of ['server/training-diary.js', 'server/talk-agreement-context.js', 'api/workouts.js']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /profile_daily_illness|illnessRecords|dailyIllness/)
  }
  const question = readFileSync(new URL('../src/daily-illness.jsx', import.meta.url), 'utf8')
  for (const text of ['aria-pressed', 'Hoppa över idag', 'Fortsätt utan sjukdomskoll', 'Ta bort mitt svar', 'saving.current']) assert.ok(question.includes(text), text)
  const checkin = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(checkin, /dailyPrompts\?\.illness \?\?/)
  assert.match(checkin, /setIllnessSaved\(true\); next\(\)/)
  assert.match(checkin, /setTimeout\(\(\) => controller.abort\(\), 10000\)/)
})
