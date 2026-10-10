import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://simkoll-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'fixture-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'fixture-swimmer'
process.env.OPENAI_API_KEY = 'fixture-only'
let approval = 'approved', aiStatus = 'completed', saved = null, aiCalls = 0, logs = []
const reply = (data) => ({ ok: true, json: async () => data })
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === 'https://api.openai.com/v1/responses') {
    aiCalls += 1
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'gpt-6.1-sol')
    const prompt = body.input[1].content
    assert(prompt.includes('75 m arm')); assert(prompt.includes('2026-10-08'))
    assert(!prompt.includes('Annat simpass'))
    const data = JSON.parse(prompt.split('Data: ')[1])
    assert.equal(data.trend.length, 1); assert.equal(data.trend[0].body, 2)
    assert.equal(data.volume.distanceMeters, 3000)
    const note = data.evidence.find((row) => row.source === 'coach_note')
    return reply({ status: aiStatus, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'En stark dokumenterad prestation nyanserar periodens låga kroppskänsla.', positives: ['Starkt armpass.'], attention: ['Jämför liknande pass.'], limitations: ['En enskild prestation.'], findings: [{ title: 'Stark armfart', observation: 'Tränaren noterade en stark 75 m-prestation.', kind: 'observation', confidence: 'limited', evidenceIds: [note.id], hypothesis: '', alternativeExplanation: 'Passförutsättningarna skiljer sig.', followUp: 'Jämför armpass med samma utrustning.' }] }) }] }], usage: { input_tokens: 1000, output_tokens: 1400, total_tokens: 2400 } })
  }
  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://simkoll-test.invalid')
  const table = parsed.pathname.split('/').pop()
  if (options.method === 'POST' && table === 'ai_insights') { saved = JSON.parse(options.body); return reply([]) }
  if (options.method === 'POST' && table === 'ai_usage_logs') { logs.push(JSON.parse(options.body)); return reply([]) }
  if (table === 'profiles') return reply([{ training_group: 'junior', ai_analysis_status: approval }])
  if (table === 'responses') return reply(parsed.searchParams.get('order')?.endsWith('desc') ? [] : [{ profile_id: 'fixture', created_at: '2026-10-09T08:00:00Z', activity_date: '2026-10-08', late_entry: true, day_type: 'after', body: 2, rpe: 9, speed_feeling: 5, comment: 'Bra armpass.' }])
  if (table === 'personal_training_sessions') return reply([{ profile_id: 'fixture', session_date: '2026-10-08', session_slot: 'afternoon_swim', activity_type: 'swim' }])
  if (table === 'daily_workouts') return reply([{ id: 'arm', workout_date: '2026-10-08', target_groups: ['junior'], time_of_day: 'afternoon', title: '75 m arm', content: 'Dolme och arm.', focus: 'syra', distance_meters: 3000, duration_minutes: 60 }, { id: 'other', workout_date: '2026-10-08', target_groups: ['ungdom_svart'], title: 'Annat simpass', distance_meters: 9000 }])
  if (table === 'coach_swimmer_notes') return reply([{ note_date: '2026-10-08', content: '75 m arm på en stark tid.' }])
  return reply([])
}
const { default: handler } = await import('../api/analytics.js')
const invoke = async (request) => {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ headers: { 'x-simkoll-code': 'fixture-coach' }, ...request }, response)
  return response
}
const get = await invoke({ method: 'GET', query: { profileId: 'fixture', period: '7', start: '2026-10-05T00:00:00Z', end: '2026-10-12T00:00:00Z', previousStart: '2026-09-28T00:00:00Z' } })
assert.equal(get.code, 200)
assert.equal(get.data.workoutAnalysis.summary.volumeMeters, 3000)
assert.equal(get.data.workoutAnalysis.personal, true)
assert.equal(get.data.individualAnalysisData.workouts.length, 1)
assert.equal(get.data.individualAnalysisData.responses[0].date, '2026-10-08')
const body = { action: 'ai-insights', profileId: 'fixture', period: '7', periodLabel: '7 dagar', data: get.data }
let response = await invoke({ method: 'POST', body })
assert.equal(response.code, 200); assert.equal(saved.insight.model, 'gpt-6.1-sol'); assert.equal(saved.insight.findings.length, 1)
assert.equal(logs[0].total_tokens, 2400)
const goodSaved = saved
aiStatus = 'incomplete'
response = await invoke({ method: 'POST', body })
assert.equal(response.code, 502); assert.equal(saved, goodSaved); assert.equal(logs[1].status, 'failure')
approval = 'pending'
const callsBefore = aiCalls
response = await invoke({ method: 'POST', body })
assert.equal(response.code, 403); assert.equal(aiCalls, callsBefore)
response = await invoke({ method: 'POST', headers: { 'x-simkoll-code': 'fixture-swimmer' }, body })
assert.equal(response.code, 403); assert.equal(aiCalls, callsBefore)
console.log('PASS personal analysis endpoint: data extraction, activity dates, restored timeline, dedicated model, persistence, usage, consent and swimmer generation blocked')
