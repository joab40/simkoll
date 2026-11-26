import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { featureFaqFor } from '../shared/feature-faq.js'
import { planningAddDays } from '../shared/weekly-planning.js'

process.env.SUPABASE_URL = 'https://assistant-faq.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'faq-swimmer'
process.env.SIMKOLL_COACH_CODE = 'faq-coach'
process.env.OPENAI_API_KEY = 'fixture-only'
const { default: handler } = await import('../api/workouts.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const profileId = '11111111-1111-4111-8111-111111111111'
const competitionId = '22222222-2222-4222-8222-222222222222'
const eventId = '33333333-3333-4333-8333-333333333333'
const fetchBeforeTest = globalThis.fetch
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => {
  globalThis.fetch = fetchBeforeTest
  delete process.env.OPENAI_SWIMMER_CHAT_MODEL
  delete process.env.OPENAI_COACH_CHAT_MODEL
  delete process.env.OPENAI_MODEL
})

async function ask(role, question, options = {}) {
  const reads = [], writes = [], requests = []
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
    if (parsed.hostname === 'api.openai.com') {
      const body = JSON.parse(init.body)
      assert.equal(parsed.pathname, '/v1/chat/completions')
      requests.push(body)
      if (options.modelStatus && requests.length === 1) return json({ error: { code: 'model_not_found' } }, options.modelStatus)
      return json({ choices: [{ message: { content: JSON.stringify({ text: 'Svar från testmodellen.' }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
    }
    assert.equal(parsed.hostname, 'assistant-faq.invalid', 'no live network or provider calls')
    if (init.method && init.method !== 'GET') {
      assert.equal(table, 'ai_usage_logs')
      writes.push(JSON.parse(init.body))
      return json([])
    }
    reads.push({ table, query: parsed.searchParams })
    if (Object.hasOwn(options.tables || {}, table)) return json(options.tables[table])
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, display_name: 'Exempel', training_group: 'junior', active: true, approval_status: 'approved', flight_record_offer_id: 'fixture-offer', flight_record_choice: 'active' }])
    if (table === 'app_settings') return json([{ setting_key: 'webapp', setting_value: { openChat: { enabled: false } } }])
    return json([])
  }
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', query: {}, headers: { 'x-simkoll-code': `faq-${role}`, cookie: 'simkoll_session=fixture' }, body: { action: 'assistant-chat', question, history: options.history, profileId: 'other' } }, response)
  return {
    response, reads, writes, requests,
    system: requests[0]?.messages[0].content,
    context: requests.length ? JSON.parse(requests[0].messages[1].content).context : null,
  }
}

test('coach help uses current settings and the relevant coach FAQ without any calendar or swimmer reads', async () => {
  const { response, reads, writes, requests, system, context } = await ask('coach', 'Hur skapar jag passförslag med AI?')
  assert.equal(response.code, 200)
  assert.equal(response.data.text, 'Svar från testmodellen.')
  const entry = featureFaqFor('coach').find(item => item.id === 'workout-generation')
  assert.ok(system.includes(entry.question))
  for (const paragraph of entry.answer) assert.ok(system.includes(paragraph))
  assert.doesNotMatch(system, /Hur spelar jag Simkoll Kustrally/)
  assert.match(system, /Simkolls tränarassistent/)
  assert.match(system, /Dold meny och behörighet är olika saker/)
  assert.ok(context.coachFeatureSettings.navigation.length)
  assert.deepEqual(reads.map(row => row.table), ['app_settings', 'app_settings'])
  assert.equal(requests[0].model, 'gpt-6-luna')
  assert.equal(requests[0].reasoning_effort, 'none')
  assert.equal(requests[0].store, false)
  assert.equal(requests[0].max_completion_tokens, 500)
  assert.equal(writes.length, 1)
})

test('swimmer help remains personal and avoids unrelated or private data reads', async () => {
  const { response, reads, writes, system, context } = await ask('swimmer', 'Fan, varför saknas simmeter och hur fungerar sömnpilen?')
  assert.equal(response.code, 200)
  assert.equal(response.data.text, 'Svar från testmodellen.')
  for (const id of ['diary-volume', 'sleep-direction']) {
    assert.ok(system.includes(featureFaqFor('swimmer').find(item => item.id === id).question), id)
  }
  assert.match(system, /Simkolls simmarassistent/)
  assert.doesNotMatch(system, /Skapa passförslag med AI och variationsreglaget/)
  assert.equal(context.swimmerView.flightRecord, 'active')
  assert.equal(context.swimmerView.features.infoFranTranarna, false)
  assert.equal(context.coachFeatureSettings, undefined)
  assert.deepEqual(reads.map(row => row.table), ['app_settings', 'profile_sessions', 'profiles'])
  assert.equal(writes[0].actor_profile_id, profileId)
})

test('swimmer statistics come from their own records, without reading the calendar', async () => {
  const { response, reads, context } = await ask('swimmer', 'Hur många simpass har jag gjort den här veckan?', {
    tables: { personal_training_sessions: [{ activity_type: 'swim', session_slot: 'evening', session_date: stockholmDate() }] },
  })
  assert.equal(response.data.text, 'Svar från testmodellen.')
  assert.equal(context.trainingAndGoals.thisWeekSummary.completedSwim, 1)
  assert.equal(context.upcomingPlans, undefined)
  assert.equal(context.latestCoachMessages, undefined)
  assert.ok(!reads.some(row => row.table === 'development_goals'))
  for (const row of reads.filter(row => row.query.has('profile_id'))) assert.equal(row.query.get('profile_id'), `eq.${profileId}`)
})

test('schedule follow-up keeps the relevant context and removes hidden and other-group plans', async () => {
  const tomorrow = planningAddDays(stockholmDate(), 1)
  const plan = { plan_date: tomorrow, time_of_day: 'morning', title: 'Mitt kommande pass', activity_type: 'swim', target_groups: ['junior'] }
  const { response, context } = await ask('swimmer', 'Och vilken tid?', {
    history: [{ from: 'user', text: 'När är nästa simpass?' }, { from: 'assistant', text: 'Ett äldre svar.' }],
    tables: { training_plans: [plan, { ...plan, title: 'Dolt', hidden_from_weekly_planning: true }, { ...plan, title: 'Annan grupp', target_groups: ['orange'] }] },
  })
  assert.equal(response.data.text, 'Svar från testmodellen.')
  assert.deepEqual(context.upcomingPlans.map(row => row.title), [plan.title])
  assert.equal(context.swimmerSwimCalendar.length, 1)
})

test('swimmer entries are matched to the actual competition and scoped to their profile', async () => {
  const { reads, context } = await ask('swimmer', 'Vilka grenar har jag skickat in?', {
    tables: {
      competition_entries: [{ competition_id: competitionId, event_id: eventId, status: 'submitted' }],
      competition_events: [{ id: eventId, competition_id: competitionId, label: '100 m frisim' }],
      competition_calendar: [{ id: competitionId, title: 'SIM', target_groups: ['junior'] }],
    },
  })
  assert.equal(reads.find(row => row.table === 'competition_entries').query.get('profile_id'), `eq.${profileId}`)
  assert.equal(context.myCompetitionEntriesStatus, 'available')
  assert.equal(context.myCompetitionEntries[0].event, '100 m frisim')
})

test('role-specific model overrides apply independently and the default falls back on missing access', async () => {
  process.env.OPENAI_COACH_CHAT_MODEL = 'gpt-4.1-mini'
  process.env.OPENAI_MODEL = 'gpt-4o-mini'
  const coach = await ask('coach', 'Hur byter jag meny?')
  assert.equal(coach.requests[0].model, 'gpt-4.1-mini')
  assert.equal(coach.requests[0].reasoning_effort, undefined)
  const swimmer = await ask('swimmer', 'Hur byter jag profilbild?', { modelStatus: 404 })
  assert.equal(swimmer.response.data.text, 'Svar från testmodellen.')
  assert.deepEqual(swimmer.requests.map(body => body.model), ['gpt-6-luna', 'gpt-4o-mini'])
  assert.deepEqual(swimmer.writes.map(row => [row.model, row.status]), [['gpt-6-luna', 'failure'], ['gpt-4o-mini', 'success']])
})
