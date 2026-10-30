import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://talk-preparation-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
process.env.OPENAI_API_KEY = 'fixture-only'
const { loadTalkAgreementContext } = await import('../server/talk-agreement-context.js')
const { generateTalkPreparation } = await import('../server/talk-preparation.js')
const { talkHistoryStart } = await import('../shared/talk-history.js')
const { loadTrainingDiary } = await import('../server/training-diary.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const { default: handler } = await import('../api/goals.js')
const talkId = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222'
const version = '2026-10-30T08:00:00Z'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const talk = { id: talkId, swimmer_id: owner, meeting_date: '2026-10-30', status: 'prepared', swimmer_answers: { teknik: 'Jag vill förbättra kickarna.' }, updated_at: version, coach_notes: { summary: '' }, agreement: { summary: 'Gemensam text' } }
const input = { talkId, period: 'since-last', sources: { preparations: true, history: true, reflections: false, sleep: false } }
const data = { warnings: [], current: { sessions: 2, activeDays: 2, byType: { swim: 2 }, rpe: 5, feeling: 4, days: [{ date: '2026-02-01', sessions: 1, rpe: 4 }, { date: '2026-10-29', sessions: 1, rpe: 6 }] }, entries: [{ date: '2026-02-01', type: 'swim', state: 'completed' }, { date: '2026-10-29', type: 'swim', state: 'completed' }], goals: [], raceResults: [{ date: '2026-01-01', event: '100 m frisim', pool: '25 m', time: '1:10.00', resultTime: 7000, source: 'manual' }, { date: '2026-10-29', event: '100 m frisim', pool: '25 m', time: '1:05.00', resultTime: 6500, source: 'manual' }] }
const time = { result_date: '2026-02-01', distance_meters: 100, stroke: 'freestyle', pool_length: 25, start_type: 'push', exercise: 'full', equipment: [], timing_method: 'hand', kind: 'test', result_time: 7000, conditions: '', note: 'PRIVATE TIME NOTE' }
function deps({ previous = null, status = 'prepared' } = {}) {
  return { purpose: 'preparation', today: () => '2026-10-30', read: async (query) => {
    if (query.startsWith('profiles?')) { assert.match(query, new RegExp(`id=eq.${owner}`)); return json([{ id: owner, display_name: 'Simmaren', training_group: 'junior' }]) }
    if (query.includes('id=neq.')) { assert.match(query, /status=eq.completed/); assert.match(query, new RegExp(`swimmer_id=eq.${owner}`)); return json(previous ? [previous] : []) }
    return json([{ ...talk, status }])
  }, diary: async (profile, start, end, options) => {
    assert.equal(profile.id, owner); assert.equal(end, '2026-10-30'); assert.deepEqual(options, { includeReflections: false, includeComparison: false }); return data
  }, swimTimes: async (profileId) => {
    assert.equal(profileId, owner)
    return { limited: false, times: [time, { ...time, result_date: '2026-10-29', result_time: 6500 }, { ...time, equipment: ['fins'], result_time: 6000 }] }
  } }
}

test('annual context needs no notes, uses saved preparations and keeps test/race conditions and sources separate', async () => {
  const result = await loadTalkAgreementContext({ ...input, profileId: 'another', swimmerAnswers: { teknik: 'UNSAVED OR OTHER SWIMMER' }, notes: 'UNSELECTED COACH NOTE' }, deps())
  assert.deepEqual(result.context.period, { start: '2025-10-31', end: '2026-10-30' })
  const text = JSON.stringify(result.context)
  assert.match(text, /Månad för månad/)
  assert.match(text, /Senaste åtta veckorna/)
  assert.match(text, /Jag vill förbättra kickarna/)
  assert.match(text, /2 jämförbara serier/)
  assert.match(text, /Fenor/)
  assert.match(text, /Första 2026-02-01: 1:10,00/)
  assert.match(text, /Senaste 2026-10-29: 1:05,00/)
  assert.match(text, /manuellt registrerat/)
  assert.match(text, /1:10.00/)
  assert.doesNotMatch(text, /PRIVATE TIME NOTE|UNSELECTED|UNSAVED|coach_notes|22222222/)
})

test('since-last period clamps at a year, follows the completed meeting, and includes its dated agreement', async () => {
  const recent = await loadTalkAgreementContext(input, deps({ previous: { meeting_date: '2026-05-20', agreement: { summary: 'Vi mäter vändningen.' } } }))
  assert.equal(recent.context.period.start, '2026-05-21')
  assert.match(recent.context.sections[0].title, /2026-05-20/)
  assert.match(recent.context.sections[0].text, /Vi mäter/)
  const old = await loadTalkAgreementContext(input, deps({ previous: { meeting_date: '2024-01-01', agreement: {} } }))
  assert.equal(old.context.period.start, '2025-10-31')
  const explicit = await loadTalkAgreementContext({ ...input, period: '3' }, deps({ previous: { meeting_date: '2026-09-01', agreement: {} } }))
  assert.equal(explicit.context.period.start, '2026-07-31')
  assert.equal(talkHistoryStart('2024-02-29', 12), '2023-03-01')
  assert.equal(talkHistoryStart('2026-05-31', 3), '2026-03-01')
})

test('not-ready, invalid periods, missing core sources and failed result reads cannot produce a partial analysis', async () => {
  await assert.rejects(loadTalkAgreementContext(input, deps({ status: 'draft' })), /Redo för samtal/)
  await assert.rejects(loadTalkAgreementContext({ ...input, period: '24' }, deps()), /historikperiod/)
  await assert.rejects(loadTalkAgreementContext({ ...input, sources: { ...input.sources, history: false } }, deps()), /både/)
  await assert.rejects(loadTalkAgreementContext(input, { ...deps(), swimTimes: async () => { throw new Error('Tiderna kunde inte hämtas') } }), /Tiderna/)
})

test('results without a known pool never become a fastest comparable result', async () => {
  const result = await loadTalkAgreementContext(input, { ...deps(), diary: async () => ({ ...data, raceResults: data.raceResults.map((row) => ({ ...row, pool: null })) }) })
  const history = result.context.sections.find((section) => section.key === 'history').text
  assert.match(history, /Förutsättningar saknas; jämför inte tiderna/)
  assert.doesNotMatch(history, /Snabbast registrerat i perioden/)
})

test('annual loading can omit the comparison year and unselected private reflections', async () => {
  const urls = []
  globalThis.fetch = async (url) => { urls.push(String(url)); return json([]) }
  await loadTrainingDiary({ id: owner }, '2025-10-31', '2026-10-30', { includeComparison: false, includeReflections: false })
  assert.ok(urls.some((url) => url.includes('session_date=gte.2025-10-31')))
  assert.ok(urls.every((url) => !url.includes('2024-') && !url.includes('training_diary_reflections')))
})

test('preparation model returns bounded observations/questions and logs usage without input or generated text', async () => {
  const context = (await loadTalkAgreementContext(input, deps())).context, logs = []
  const draft = { summary: 'Träningshistorik att diskutera.', questions: ['Vad vill du utveckla i kickarna?'] }
  const result = await generateTalkPreparation({}, context, { fetch: async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.store, false)
    assert.deepEqual(JSON.parse(body.input[1].content), context)
    assert.match(body.input[0].content, /Saknade registreringar är inte bevis/)
    assert.match(body.input[0].content, /samma serie/)
    return json({ status: 'completed', output_text: JSON.stringify(draft), usage: { input_tokens: 100 } })
  }, log: async (_, entry) => logs.push(entry) })
  assert.deepEqual(result, draft)
  assert.doesNotMatch(JSON.stringify(logs), /kickarna|Träningshistorik|2026-10-29/)
  await assert.rejects(generateTalkPreparation({}, context, { fetch: async () => json({ status: 'completed', output_text: JSON.stringify({ summary: 'x'.repeat(6501), questions: [] }) }), log: async () => {} }), /ofullständigt/)
})

async function call(action, extra = {}, code = 'coach-fixture', method = 'POST', query = {}) {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method, query, headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, body: { ...input, ...extra, action } }, response)
  return response
}

function apiFixture({ schemaMissing = false, conflict = false, allowed = true } = {}) {
  const writes = [], today = stockholmDate()
  let row = { ...talk, meeting_date: today }
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    if (path.includes('api.openai.com')) { writes.push({ model: true, body: JSON.parse(options.body) }); return json({ status: 'completed', output_text: JSON.stringify({ summary: 'Samtalsunderlag.', questions: ['Vad vill du följa upp?'] }) }) }
    const table = path.split('/rest/v1/')[1]
    if (table.startsWith('app_settings?')) return json([{ setting_value: { aiEnabled: allowed } }])
    if (table.startsWith('profile_sessions?')) return json([{ profile_id: owner }])
    if (table.startsWith('profiles?')) return json([{ id: owner, active: true, approval_status: 'approved' }])
    if (table.startsWith('development_talks?')) {
      if (table.includes('select=coach_preparation')) return json([], schemaMissing ? 400 : 200)
      if (table.includes('id=neq.')) return json([])
      if (options.method === 'PATCH') { writes.push({ table, body: JSON.parse(options.body) }); if (conflict) return json([]); row = { ...row, ...JSON.parse(options.body) } }
      return json([row])
    }
    if (table.startsWith('ai_usage_logs')) { writes.push({ usage: true, body: JSON.parse(options.body) }); return json([]) }
    if (/^(personal_training_sessions|responses|daily_workouts|training_plans|planned_training_sessions|session_attendance|strength_program_logs|program_assignments|competition_results|development_goals|workout_unlocks|training_swim_times)\?/.test(table)) return json([])
    throw new Error(`Unexpected API read ${table}`)
  }
  return writes
}

test('API requires coach/readiness/schema/review/AI availability before generation and leaves existing data intact on conflict', async () => {
  globalThis.fetch = async () => { throw new Error('Unauthorized read') }
  for (const action of ['talk-preparation-context', 'generate-talk-preparation']) assert.equal((await call(action, {}, 'swimmer-fixture')).code, 403)
  let writes = apiFixture({ schemaMissing: true })
  assert.equal((await call('talk-preparation-context')).code, 503); assert.equal(writes.length, 0)
  writes = apiFixture()
  const preview = await call('talk-preparation-context')
  assert.equal(preview.code, 200); assert.equal(writes.length, 0)
  assert.equal((await call('generate-talk-preparation')).code, 409)
  assert.equal((await call('generate-talk-preparation', { period: '3', contextHash: preview.data.contextHash })).code, 409)
  assert.equal(writes.length, 0)
  writes = apiFixture({ allowed: false })
  assert.equal((await call('generate-talk-preparation', { contextHash: preview.data.contextHash })).code, 403); assert.equal(writes.length, 0)
  writes = apiFixture({ conflict: true })
  assert.equal((await call('generate-talk-preparation', { contextHash: preview.data.contextHash })).code, 409)
  assert.equal(writes.filter((row) => row.model).length, 1)
  const save = writes.find((row) => row.table)
  assert.match(save.table, /updated_at=eq.2026-10-30/)
  assert.deepEqual(Object.keys(save.body).sort(), ['coach_preparation', 'updated_at'])
})

test('analysis persists only on the verified talk and is excluded from swimmer reads/save responses', async () => {
  const writes = apiFixture()
  const preview = await call('talk-preparation-context')
  const generated = await call('generate-talk-preparation', { contextHash: preview.data.contextHash, profileId: 'other-swimmer' })
  assert.equal(generated.code, 200)
  assert.equal(generated.data.talk.swimmerId, owner)
  assert.equal(generated.data.talk.coachPreparation.summary, 'Samtalsunderlag.')
  assert.equal(generated.data.talk.agreement.summary, 'Gemensam text')
  assert.equal(generated.data.talk.status, 'prepared')
  const saved = writes.find((row) => row.table)
  assert.match(saved.table, new RegExp(`id=eq.${talkId}`))
  const read = await call(null, {}, 'swimmer-fixture', 'GET', { talks: 'true' })
  assert.equal(read.code, 200)
  assert.doesNotMatch(JSON.stringify(read.data), /coachPreparation|Samtalsunderlag\.|contextHash|sourceVersion|coachNotes/)
  assert.equal(read.data.talks[0].agreement.summary, 'Gemensam text')
  const swimmerSave = await call('save-talk', { id: talkId, status: 'prepared', swimmerAnswers: { teknik: 'Nytt eget svar' } }, 'swimmer-fixture')
  assert.equal(swimmerSave.code, 200)
  assert.doesNotMatch(JSON.stringify(swimmerSave.data), /coachPreparation|Samtalsunderlag\.|coachNotes/)
})
