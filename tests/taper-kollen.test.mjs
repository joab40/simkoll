import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeTaperGoal, buildTaperSummary, latestTaperGoals, taperDays } from '../shared/taper-kollen.js'
import { loadTaperGoals, saveTaperGoal, loadTaperKollen } from '../server/taper-kollen.js'
import { loadSwimmerAssistantContext } from '../server/swimmer-assistant-context.js'
import { validateSwimmerAssistantSelection, SWIMMER_ASSISTANT_DEFAULTS } from '../shared/swimmer-assistant.js'

const id = '11111111-1111-4111-8111-111111111111', competitionId = '22222222-2222-4222-8222-222222222222'
const competition = { id: competitionId, title: 'Måltävling', start_date: '2027-01-15', end_date: '2027-01-17' }
const input = { competitionId, priority: 'A', targetDate: '2027-01-16', taperStart: '2027-01-02', events: '100 frisim', note: 'Coach input' }
const goal = { ...normalizeTaperGoal(input, competition), id: 'revision-1' }
const raw = { id: 'revision-1', competition_id: competitionId, competition_title: goal.title, competition_start: goal.competitionStart, competition_end: goal.competitionEnd, priority: goal.priority, target_date: goal.targetDate, taper_start: goal.taperStart, target_events: goal.events, note: goal.note, enabled: true, created_at: '2026-11-16T10:00:00Z' }
const ok = rows => ({ ok: true, json: async () => rows })
const metric = value => ({ value, days: 2, lastDay: '2027-01-03' })
const data = (goals = [goal], form = null, asOf = '2027-01-03') => ({ goals, form, asOf })

test('target validation keeps priority personal, validates dates/events and ignores client ownership', () => {
  const result = normalizeTaperGoal({ ...input, profile_id: 'attacker', created_by: 'attacker', title: 'fake' }, competition)
  assert.equal(result.title, competition.title); assert.equal(result.priority, 'A'); assert(!('profile_id' in result))
  for (const patch of [{ priority: 'S' }, { targetDate: '2027-02-01' }, { targetDate: '2027-01-32' }, { taperStart: '2027-01-17' }, { taperStart: '2026-01-01' }, { events: 'x'.repeat(201) }, { note: 'x'.repeat(601) }, { enabled: 'false' }]) assert.throws(() => normalizeTaperGoal({ ...input, ...patch }, competition))
  assert.equal(normalizeTaperGoal({ ...input, taperStart: '' }, competition).taperStart, null)
})
test('latest revisions include deactivation; absence is not an inferred goal', () => {
  assert.deepEqual(latestTaperGoals([{ ...goal, enabled: false }, { ...goal, id: 'old' }]), [{ ...goal, enabled: false }])
  assert.equal(buildTaperSummary(data([{ ...goal, enabled: false }])).goal, null)
  assert.equal(buildTaperSummary(data([goal], null, '2027-01-18')).goal, null)
})
test('defaults to next A goal, allows B focus, and separates calendar stage from physiological state', () => {
  const before = { ...goal, competitionId: 'before', title: 'Senior-SM', priority: 'B', targetDate: '2026-12-01' }
  const result = buildTaperSummary(data([before, goal], null, '2026-11-16'))
  assert.equal(result.goal.competitionId, competitionId); assert.equal(result.label, 'Aktuellt underlag behöver kompletteras')
  assert.match(result.stage, /Inför planerad/); assert(result.conflicts.some(text => text.includes('Senior-SM')))
  assert.equal(buildTaperSummary(data([before, goal], null, '2026-11-16'), 'before').goal.priority, 'B')
  assert.equal(buildTaperSummary(data([goal], null, '2027-01-16')).days, 0)
  assert.equal(buildTaperSummary(data([{ ...goal, taperStart: null }])).stage, 'Lättningens start är inte angiven')
})
test('multiple A targets inside adjustable 21-day attention window are flagged, not rejected', () => {
  const other = { ...goal, competitionId: 'other', title: 'Andra A-målet', targetDate: '2027-01-30' }
  assert.equal(buildTaperSummary(data([goal, other])).conflicts.length, 1)
  assert.equal(buildTaperSummary(data([goal, { ...other, targetDate: '2027-03-01' }])).conflicts.length, 0)
  assert.equal(taperDays('2026-12-31', '2027-01-01'), 1)
  assert.equal(taperDays('2026-03-28', '2026-03-30'), 2)
})
test('health/follow-up flags take precedence over all positive feelings; missing signal source is not zero', () => {
  const form = { current: { body: metric(5), feeling: metric(5), speed: metric(5) }, flags: ['Lite känningar'], confidence: 'gott' }
  const result = buildTaperSummary(data([goal], form))
  assert.equal(result.tone, 'watch'); assert.equal(result.reason, 'Lite känningar'); assert.equal(result.prompts.length, 1)
  assert.match(buildTaperSummary(data([goal], null)).label, /kompletteras/)
  assert.notEqual(buildTaperSummary(data([goal], { ...form, flags: [], illnessAvailable: false })).tone, 'positive')
})
test('high speed and low body remain mixed, high feelings are not called measured peak form', () => {
  const form = { current: { body: metric(2), feeling: metric(4), speed: metric(5) }, flags: [] }
  assert.equal(buildTaperSummary(data([goal], form)).tone, 'mixed')
  const positive = buildTaperSummary(data([goal], { ...form, current: { body: metric(4), feeling: metric(4), speed: metric(5) } }))
  assert.equal(positive.tone, 'positive'); assert.match(positive.reason, /inte bevis/)
})
test('persistence appends snapshots with server-controlled owner/actor, never mutates training', async () => {
  const calls = []
  const db = async (path, options = {}) => { calls.push({ path, options }); return options.method ? ok([{ ...JSON.parse(options.body), id: 'new' }]) : ok([competition]) }
  const result = await saveTaperGoal(id, 'coach', { ...input, profile_id: 'other', created_by: 'other' }, db)
  assert.equal(result.id, 'new'); assert.equal(calls[1].path, 'coach_taper_goals'); assert.equal(calls[1].options.method, 'POST')
  const payload = JSON.parse(calls[1].options.body)
  assert.equal(payload.profile_id, id); assert.equal(payload.created_by, 'coach'); assert.equal(payload.competition_title, competition.title)
  assert.equal(calls.length, 2)
})
test('goal reads fail closed on DB failure and are always profile-scoped', async () => {
  await assert.rejects(() => loadTaperGoals(id, async query => { assert.match(query, new RegExp(`profile_id=eq.${id}`)); return { ok: false } }), /122/)
  const loaded = await loadTaperGoals(id, async () => ok([{ ...raw, enabled: false }, raw]))
  assert.equal(loaded.length, 1); assert.equal(loaded[0].enabled, false)
})
test('a removed or moved calendar competition can be archived using the previous scoped snapshot', async () => {
  const calls = []
  const result = await saveTaperGoal(id, 'coach', { ...input, enabled: false, targetDate: 'spoof' }, async (path, options = {}) => {
    calls.push(path)
    assert(!path.startsWith('competition_calendar'))
    return options.method ? ok([{ ...JSON.parse(options.body), id: 'archived' }]) : ok([raw])
  })
  assert.equal(result.enabled, false); assert.equal(result.targetDate, goal.targetDate); assert.equal(calls.length, 2)
})
test('signal failure still allows target management without manufacturing an empty health state', async () => {
  const result = await loadTaperKollen({ id, training_group: 'junior' }, '2026-11-16', async query => {
    if (query.startsWith('coach_taper_goals?')) return ok([raw])
    if (query.startsWith('competition_calendar?')) return ok([competition])
    return { ok: false }
  })
  assert.equal(result.goals.length, 1); assert.equal(result.form, null); assert.match(result.formError, /inte.*saknar svar/)
})
test('taper data is opt-in: no goal/future plan read in ordinary selection, no health leakage', async () => {
  const calls = [], read = async query => { calls.push(query); return ok([]) }
  await loadSwimmerAssistantContext({ id, training_group: 'junior' }, validateSwimmerAssistantSelection({ categories: ['speed'], period: '28' }, '2026-11-16'), read)
  assert(!calls.some(query => /coach_taper_goals|plan_date=gt\./.test(query)))
  assert(!SWIMMER_ASSISTANT_DEFAULTS.includes('taper'))
  calls.length = 0
  const context = await loadSwimmerAssistantContext({ id, training_group: 'junior' }, validateSwimmerAssistantSelection({ categories: ['taper'], period: '28' }, '2026-11-16'), async query => {
    calls.push(query)
    if (query.startsWith('coach_taper_goals')) return ok([raw])
    if (query.startsWith('training_plans')) return ok([{ id: 'secret-db-id', plan_date: '2026-11-18', target_groups: ['junior'], title: 'Framtida fart' }, { plan_date: '2026-11-18', target_groups: ['other'], title: 'OTHER GROUP' }])
    return ok([])
  })
  assert(!calls.some(query => /profile_daily_|responses\?/.test(query)))
  assert.match(JSON.stringify(context), /Framtida fart/); assert.doesNotMatch(JSON.stringify(context), /secret-db-id|OTHER GROUP/)
  assert.equal(context.daily.length, 0); assert(context.sources.some(source => source.date === '2027-01-16'))
  assert(calls.some(query => query.includes('plan_date=gt.2026-11-16&plan_date=lte.2026-12-14')))
})
test('card order, consent gate, restricted dialog and SQL RLS stay explicit', () => {
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert(app.indexOf('<FormKollenCard') < app.indexOf('<TaperKollenCard'))
  const view = readFileSync(new URL('../src/taper-kollen.jsx', import.meta.url), 'utf8')
  assert.match(view, /useState\(false\)/); assert.match(view, /canUseSwimmerAssistant\(accountRole\)/)
  assert.match(view, /initialCategories=\{\[\.\.\.SWIMMER_ASSISTANT_DEFAULTS, 'times', 'taper'\]\}/)
  const sql = readFileSync(new URL('../supabase/migrations/122_coach_taper_goals.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/); assert.match(sql, /revoke all.*public, anon, authenticated/)
})
