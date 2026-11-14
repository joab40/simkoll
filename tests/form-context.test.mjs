import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeFormContext, currentFormContext } from '../shared/form-context.js'
import { formChartSegments } from '../shared/form-chart.js'
import { loadCoachFormContext, saveCoachFormContext } from '../server/form-context.js'
const asOf = '2026-11-14'

test('coach context accepts real dated observations but never grants verification or instructions', () => {
  const input = { observedOn: asOf, trainingPbDate: '2026-11-13', competitionPbDate: '2026-11-08', taperStart: asOf, competitionDate: '2026-11-28', note: '  Har börjat lätta mängden.  ', verified: true, phase: 'positive' }
  const saved = normalizeFormContext(input, asOf)
  assert.equal(saved.note, 'Har börjat lätta mängden.')
  assert.equal(Object.hasOwn(saved, 'verified'), false)
  const active = currentFormContext(saved, asOf)
  assert.equal(active.verified, false); assert.equal(active.recentPerformance, true)
  assert.equal(active.taperActive, true); assert.equal(active.upcomingCompetition, true)
})

test('future, invalid, stale and reversed dates are rejected rather than normalized silently', () => {
  for (const patch of [{ observedOn: '2026-11-15' }, { observedOn: '2026-02-30' }, { observedOn: '2026-09-01' }, { trainingPbDate: '2026-11-15' }, { competitionPbDate: '2026-02-30' }, { taperStart: '2026-11-15' }, { competitionDate: '2026-11-13' }, { competitionDate: '2027-12-01' }, { note: 'x'.repeat(601) }, { note: {} }]) assert.throws(() => normalizeFormContext({ observedOn: asOf, ...patch }, asOf))
  assert.throws(() => normalizeFormContext(null, asOf))
  assert.equal(currentFormContext({ observedOn: '2026-11-15' }, asOf), null)
})

test('PB freshness follows event date, not save date; taper expires after the target date', () => {
  const value = { observedOn: asOf, trainingPbDate: '2026-11-13', competitionPbDate: '2026-11-07', taperStart: '2026-11-12', competitionDate: '2026-11-28' }
  const now = currentFormContext(value, asOf)
  assert.equal(now.trainingPbRecent, true); assert.equal(now.competitionPbRecent, false)
  assert.equal(currentFormContext(value, '2026-11-21').recentPerformance, false)
  assert.equal(currentFormContext(value, '2026-11-29').taperActive, false)
  assert.equal(currentFormContext({ observedOn: asOf, taperStart: asOf }, asOf).taperActive, false)
  assert.equal(currentFormContext({ observedOn: asOf }, asOf).recentPerformance, false)
})

test('chart bridges only actual observations with dashed gap segments and leaves missing data unchanged', () => {
  const history = [{ date: '2026-11-09', speed: 2 }, { date: '2026-11-10', speed: 3 }, { date: '2026-11-11', speed: null }, { date: '2026-11-12' }, { date: '2026-11-13', speed: 5 }, { date: asOf, speed: null }]
  const before = JSON.stringify(history), result = formChartSegments(history, 'speed')
  assert.equal(result.points.length, 3)
  assert.deepEqual(result.segments.map(segment => [segment.gap, segment.missingDays]), [[false, 0], [true, 2]])
  assert.deepEqual(result.segments.at(-1).to, { date: '2026-11-13', value: 5, index: 4 })
  assert.equal(JSON.stringify(history), before)
  assert.equal(formChartSegments(history, 'load').segments.length, 0)
  assert.equal(formChartSegments([{ date: asOf, load: 0 }], 'load').points[0].value, 0)
})

test('every observed point is joined across both short and long gaps, without extending into missing edge days', () => {
  const history = Array.from({ length: 28 }, (_, index) => ({ date: `day-${index}`, speed: null, load: null }))
  for (const index of [1, 3, 22, 25]) Object.assign(history[index], { speed: 5, load: index === 3 ? 0 : 300 })
  for (const field of ['speed', 'load']) {
    const { points, segments } = formChartSegments(history, field)
    assert.equal(segments.length, points.length - 1)
    assert.deepEqual(segments.map(({ from, to, missingDays }) => [from.index, to.index, missingDays]), [[1, 3, 1], [3, 22, 18], [22, 25, 2]])
    assert.ok(segments.every(segment => segment.gap))
  }
  const view = readFileSync(new URL('../src/form-kollen.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/form-kollen.css', import.meta.url), 'utf8')
  assert.match(view, /segment\.gap && <line[^>]+className="form-chart-gap-guide"/)
  assert.match(css, /\.form-chart-gap-guide\s*\{\s*opacity: \.22;/)
  assert.match(css, /\.form-chart-gap\s*\{\s*stroke-dasharray: 3 3;/)
})

test('context writes are append-only snapshots tied to server-selected coach and profile; missing table degrades safely', async () => {
  const calls = []
  const write = async (path, options) => { calls.push({ path, options }); const body = JSON.parse(options.body); return { ok: true, json: async () => [{ ...body, id: 'snapshot', created_at: '2026-11-14T12:00:00Z' }] } }
  const result = await saveCoachFormContext('profile', 'coach', { observedOn: asOf, note: 'En observation', profile_id: 'other', created_by: 'attacker' }, asOf, write)
  assert.equal(result.note, 'En observation')
  assert.equal(calls[0].path, 'coach_form_observations'); assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body).profile_id, 'profile')
  assert.equal(JSON.parse(calls[0].options.body).created_by, 'coach')
  const missing = await loadCoachFormContext('profile', asOf, async () => ({ ok: false, status: 404 }))
  assert.deepEqual(missing, { available: false, current: null, revisions: [] })
  const loaded = await loadCoachFormContext('profile', asOf, async query => {
    assert.match(query, /profile_id=eq.profile/); assert.match(query, /observed_on=lte.2026-11-14/)
    assert.match(query, /limit=5/); assert.match(query, /order=observed_on.desc,created_at.desc,id.desc/)
    return { ok: true, json: async () => [{ id: 'new', observed_on: asOf, note: '' }, { id: 'old', observed_on: '2026-11-13', note: 'Gammalt PB' }] }
  })
  assert.equal(loaded.current.id, 'new'); assert.equal(loaded.current.note, '')
  assert.equal(loaded.revisions.length, 2)
})

test('migration has privacy, referential integrity and deterministic history lookup', () => {
  const sql = readFileSync(new URL('../supabase/migrations/120_coach_form_observations.sql', import.meta.url), 'utf8')
  for (const text of ['enable row level security', 'from public, anon, authenticated', 'references public.profiles(id) on delete cascade', 'created_by uuid references public.coach_accounts(id)', 'observed_on desc, created_at desc, id desc']) assert.ok(sql.includes(text), text)
  assert.doesNotMatch(sql, /drop table|update public\.responses|insert into public\.competition_results/i)
})
