import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://talk-context-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
process.env.OPENAI_API_KEY = 'fixture-only'
const { loadTalkAgreementContext } = await import('../server/talk-agreement-context.js')
const { proposeTalkAgreement } = await import('../server/talk-agreement.js')
const { loadTrainingDiary } = await import('../server/training-diary.js')
const { default: handler } = await import('../api/goals.js')
const talkId = '11111111-1111-4111-8111-111111111111', swimmerId = '22222222-2222-4222-8222-222222222222'
const notes = 'Vi ska mäta vändningarna och följa upp dem tillsammans.'
const body = { talkId, notes, swimmerAnswers: { teknik: 'Jag vill förbättra kickarna.' }, sources: { preparations: true, history: true, reflections: false, sleep: false } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const talk = { swimmer_id: swimmerId, swimmer_answers: { teknik: 'Äldre svar' }, updated_at: '2026-10-30T08:00:00Z' }
function dataRead(query) {
  if (query.startsWith('development_talks?')) return json([talk])
  if (query.startsWith('profiles?')) { assert.match(query, new RegExp(`id=eq.${swimmerId}`)); return json([{ id: swimmerId, display_name: 'Simmaren', training_group: 'junior' }]) }
  if (query.startsWith('profile_daily_sleep?')) { assert.match(query, new RegExp(`profile_id=eq.${swimmerId}`)); return json([{ minutes: 450, quality: 3 }, { minutes: 480, quality: 5 }, { minutes: null, quality: null, skipped: true }]) }
  throw new Error(`Unexpected read ${query}`)
}
const diaryData = {
  warnings: [],
  current: { sessions: 2, activeDays: 2, byType: { swim: 1, strength: 1 }, swimMeters: 2000, estimatedSwimMeters: 3000, minutes: 45, estimatedMinutes: 90, rpe: 6, feeling: 4, days: [{ date: '2026-10-29', sessions: 1, rpe: 6 }, { date: '2026-10-30', sessions: 1, rpe: null }] },
  entries: [{ date: '2026-10-29', comments: [{ text: 'Unselected private check-in comment' }], reflection: { whatWorked: 'Bra känsla i vändningarna.', nextTime: 'Fokusera på streamline.' } }],
  goals: [{ title: 'Vändning', description: 'Bättre teknik', next_step: 'Mät tillsammans', status: 'active' }],
  raceResults: [{ date: '2026-08-10', event: '50 m fjärilsim', pool: '25 m', time: '29.99', source: 'tempus' }, { date: '2026-10-27', event: '100 m frisim', pool: '50 m', time: '1:02.34', source: 'manual' }],
}
const deps = { read: dataRead, today: () => '2026-10-30', diary: async (profile, start, end, options) => { assert.equal(profile.id, swimmerId); assert.equal(start, '2026-09-05'); assert.equal(end, '2026-10-30'); assert.deepEqual(options, { includeReflections: false }); return diaryData } }

test('reviewed context uses the talk owner, current unsaved answers, and separate reported/estimated history', async () => {
  const result = await loadTalkAgreementContext({ ...body, profileId: 'another-profile' }, deps)
  const serialized = JSON.stringify(result.context)
  assert.deepEqual(result.context.sections.map((row) => row.key), ['notes', 'preparations', 'history'])
  assert.match(serialized, /Jag vill förbättra kickarna/)
  assert.match(serialized, /Min träning/)
  assert.match(serialized, /Ej besvarad/)
  assert.match(serialized, /manuellt registrerat/)
  assert.match(serialized, /uppskattade meter/)
  assert.doesNotMatch(serialized, /Äldre svar|Unselected private|Bra känsla i vändningarna|swimmer_id|22222222|display_name|29.99/)
  assert.equal(result.contextHash.length, 64)
  const changed = await loadTalkAgreementContext({ ...body, swimmerAnswers: { teknik: 'Nytt önskemål' } }, deps)
  assert.notEqual(result.contextHash, changed.contextHash)
  const changedHistory = await loadTalkAgreementContext(body, { ...deps, diary: async () => ({ ...diaryData, current: { ...diaryData.current, sessions: 3 } }) })
  assert.notEqual(result.contextHash, changedHistory.contextHash)
  const changedTalk = await loadTalkAgreementContext(body, { ...deps, read: async (query) => query.startsWith('development_talks?') ? json([{ ...talk, updated_at: '2026-10-30T09:00:00Z' }]) : dataRead(query) })
  assert.notEqual(result.contextHash, changedTalk.contextHash)
})

test('deselected sources are not read or sent, and opted-in private sources are explicitly labelled', async () => {
  let diaryCalls = 0, sleepCalls = 0
  const read = async (query) => { if (query.startsWith('profile_daily_sleep?')) sleepCalls++; return dataRead(query) }
  const minimal = await loadTalkAgreementContext({ ...body, sources: { preparations: false, history: false, reflections: false, sleep: false } }, { ...deps, read, diary: async () => { diaryCalls++; throw new Error('not selected') } })
  assert.equal(diaryCalls, 0); assert.equal(sleepCalls, 0)
  assert.deepEqual(minimal.context.sections.map((row) => row.key), ['notes'])
  const selected = await loadTalkAgreementContext({ ...body, sources: { preparations: false, history: false, reflections: true, sleep: true } }, { ...deps, read, diary: async (_profile, _start, _end, options) => { assert.deepEqual(options, { includeReflections: true }); return diaryData } })
  assert.equal(sleepCalls, 1)
  assert.deepEqual(selected.context.sections.map((row) => row.key), ['notes', 'reflections', 'sleep'])
  assert.match(selected.context.sections[1].text, /Bra känsla i vändningarna/)
  assert.match(selected.context.sections[2].text, /2 besvarade nätter/)
  assert.match(selected.context.sections[2].text, /7,8 timmar/)
})

test('invalid talks, unknown answer keys, identifiable optional text and source failures stop before AI', async () => {
  await assert.rejects(loadTalkAgreementContext({ ...body, talkId: 'invalid' }, deps), /sparat/)
  await assert.rejects(loadTalkAgreementContext(body, { ...deps, read: async () => json([]) }), /inte längre/)
  await assert.rejects(loadTalkAgreementContext({ ...body, swimmerAnswers: { arbitrary: 'not part of form' } }, deps), /format/)
  await assert.rejects(loadTalkAgreementContext({ ...body, swimmerAnswers: { teknik: 'Kontakt person@example.se' } }, deps), /Förberedelser/)
  await assert.rejects(loadTalkAgreementContext({ ...body, sources: { ...body.sources, sleep: true } }, { ...deps, read: async (query) => query.startsWith('profile_daily_sleep?') ? json({}, 500) : dataRead(query) }), /Sömnkollen/)
})

test('history-only diary loading does not query private reflections', async () => {
  const queries = []
  globalThis.fetch = async (url) => { queries.push(String(url)); return json([]) }
  await loadTrainingDiary({ id: swimmerId, training_group: 'junior' }, '2026-10-01', '2026-10-30', { includeReflections: false })
  assert.ok(queries.some((query) => query.includes('personal_training_sessions?')))
  assert.ok(queries.every((query) => !query.includes('training_diary_reflections?')))
})

test('expanded prompt keeps wishes, explicit agreements and observed history separate, without logging source text', async () => {
  const { context } = await loadTalkAgreementContext(body, deps)
  await proposeTalkAgreement({}, notes, { context, fetch: async (_url, options) => {
    const input = JSON.parse(options.body)
    assert.match(input.input[0].content, /ALDRIG på egen hand skapa en överenskommelse/)
    const data = JSON.parse(input.input[1].content)
    assert.equal(data.notes, notes)
    assert.deepEqual(data.sources.map((row) => row.key), ['preparations', 'history'])
    return json({ status: 'completed', output_text: JSON.stringify({ agreement: 'Du vill förbättra kickarna. Ni ska mäta vändningarna tillsammans.', questions: [] }) })
  }, log: async (_request, entry) => { assert.doesNotMatch(JSON.stringify(entry), /kickarna|vändningarna|minutes|22222222/) } })
})

async function call(action, code = 'coach-fixture', extra = {}) {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': code }, body: { ...body, action, ...extra } }, response)
  return response
}

test('context API denies swimmers/anonymous and generation rejects an unreviewed or changed snapshot before model use', async () => {
  globalThis.fetch = async () => { throw new Error('not authorized') }
  assert.equal((await call('talk-agreement-context', 'swimmer-fixture')).code, 403)
  assert.equal((await call('talk-agreement-context', '')).code, 403)
  let modelCalls = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.openai.com')) { modelCalls++; throw new Error('unreviewed') }
    const path = String(url).split('/rest/v1/')[1]
    if (path.startsWith('app_settings?')) return json([{ setting_value: { aiEnabled: true } }])
    return dataRead(path)
  }
  const sources = { preparations: true, history: false, reflections: false, sleep: false }
  const preview = await call('talk-agreement-context', 'coach-fixture', { sources })
  assert.equal(preview.code, 200)
  assert.equal(modelCalls, 0)
  assert.equal((await call('propose-talk-agreement', 'coach-fixture', { sources })).code, 409)
  assert.equal((await call('propose-talk-agreement', 'coach-fixture', { sources, notes: notes + ' Ändrat.', contextHash: preview.data.contextHash })).code, 409)
  assert.equal(modelCalls, 0)
  const writes = []
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('api.openai.com')) {
      modelCalls++
      assert.deepEqual(JSON.parse(JSON.parse(options.body).input[1].content).sources.map((row) => row.key), ['preparations'])
      return json({ status: 'completed', output_text: JSON.stringify({ agreement: 'Du vill förbättra kickarna.', questions: [] }) })
    }
    const path = String(url).split('/rest/v1/')[1]
    if (path.startsWith('ai_usage_logs')) { writes.push(JSON.parse(options.body)); return json([]) }
    if (path.startsWith('app_settings?')) return json([{ setting_value: { aiEnabled: true } }])
    return dataRead(path)
  }
  const generated = await call('propose-talk-agreement', 'coach-fixture', { sources, contextHash: preview.data.contextHash })
  assert.equal(generated.code, 200)
  assert.equal(modelCalls, 1)
  assert.equal(writes.length, 1)
  assert.doesNotMatch(JSON.stringify(writes), /kickarna|vändningarna|22222222/)
})
