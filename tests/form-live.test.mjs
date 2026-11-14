import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLiveForm, swimmerSpeedSignal, formLiveEndOfDay } from '../shared/form-live.js'
import { swimmerProfileSetup, activeProfileGoals } from '../shared/swimmer-profile-setup.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'

const now = '2026-11-14T20:00:00Z'
const row = (id, time, patch = {}) => ({ id, date: '2026-11-14', createdAt: `2026-11-14T${time}:00Z`, type: 'after', activityType: 'swim', trainingSlot: id, body: 4, feeling: 4, speedFeeling: 4, rpe: 5, activityMinutes: 60, ...patch })
const responses = [row('a', '19:00', { body: 5, speedFeeling: 5 }), row('b', '12:00', { body: 1, speedFeeling: 1 }), row('c', '10:00', { body: 3 }), row('d', '08:00', { body: 2 })]

test('Just nu uses the latest two valid answers per metric, including two answers on the same day', () => {
  const live = buildLiveForm({ responses }, now)
  assert.equal(live.metrics.body.answers, 2); assert.equal(live.metrics.body.days, 1)
  assert.equal(live.metrics.body.value, 3.4)
  assert.equal(live.previous.metrics.body.value, 2.6)
  assert.equal(live.directions.body.delta, .8)
  assert.equal(live.metrics.body.samples[0].submittedAt, '2026-11-14T19:00:00.000Z')
  assert.equal(live.mode, 'latest-answers')
})

test('answers are selected independently for body, mood and swimming speed, without manufacturing missing fields', () => {
  const data = { responses: [row('a', '19:00', { body: null, speedFeeling: null }), row('b', '12:00', { body: 2, speedFeeling: 5 }), row('c', '10:00', { body: 4, speedFeeling: 3 })] }
  const result = buildLiveForm(data, now)
  assert.equal(result.metrics.feeling.samples[0].submittedAt, '2026-11-14T19:00:00.000Z')
  assert.equal(result.metrics.body.samples[0].submittedAt, '2026-11-14T12:00:00.000Z')
  assert.equal(result.metrics.body.value, 2.8); assert.equal(result.metrics.speed.value, 4.2)
  assert.equal(result.directions.body.state, 'unknown', 'two previous values are required, not one')
  assert.equal(buildLiveForm({ responses: [row('one', '19:00')] }, now).metrics.body.value, 4)
})

test('late entries do not displace a newer activity day, corrections count once and future/invalid timestamps are excluded', () => {
  const result = buildLiveForm({ responses: [row('a', '18:00', { trainingSlot: 'afternoon_swim', body: 1 }), row('b', '19:00', { trainingSlot: 'afternoon_swim', body: 5 }), row('retro', '19:30', { date: '2026-11-13', body: 2 }), row('future', '23:00', { body: 1 }), row('invalid', '10:00', { createdAt: 'bad', body: 1 })] }, now)
  assert.equal(result.metrics.body.answers, 2)
  assert.equal(result.metrics.body.samples[0].value, 5)
  assert.equal(result.metrics.body.samples[1].date, '2026-11-13')
  assert.equal(result.metrics.body.value, 3.8)
})

test('bolt uses latest single swimming speed, not a medal or weighted form score; stale reports are neutral', () => {
  assert.equal(swimmerSpeedSignal(responses, now).value, 5)
  assert.equal(swimmerSpeedSignal(responses, now).level, 'max')
  assert.equal(swimmerSpeedSignal([row('a', '19:00', { speedFeeling: 4 })], now).level, 'high')
  assert.equal(swimmerSpeedSignal([row('a', '19:00', { speedFeeling: 3 })], now).level, 'medium')
  for (const patch of [{ competition: true }, { activityType: 'strength' }, { type: 'before' }, { plannedCompletion: 'no' }, { speedFeeling: '5' }]) assert.equal(swimmerSpeedSignal([row('a', '19:00', patch)], now).value, null)
  const old = swimmerSpeedSignal([row('old', '19:00', { date: '2026-11-11', createdAt: '2026-11-11T19:00:00Z', speedFeeling: 5 })], now)
  assert.equal(old.value, 5); assert.equal(old.level, 'unknown'); assert.equal(old.fresh, false)
  assert.match(old.label, /äldre/)
})

test('old answers remain dated observations, never a live trend, and submitted-today retrospective data is not current', () => {
  const data = { responses: responses.map(item => ({ ...item, date: '2026-11-01', createdAt: item.createdAt.replace('11-14', '11-01') })) }
  const result = buildLiveForm(data, now)
  assert.equal(result.metrics.body.value, 3.4); assert.equal(result.metrics.body.fresh, false)
  assert.equal(result.directions.body.state, 'unknown')
  assert.equal(swimmerSpeedSignal([row('retro', '19:00', { date: '2026-11-01', speedFeeling: 5 })], now).fresh, false)
  for (const day of ['2026-03-30', '2026-10-26']) assert.equal(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(formLiveEndOfDay(day))), day)
})

const profile = { id: 'p', tempusId: '12345', primaryStroke: 'free', trainingGroup: 'junior' }
const training = { seasonGoals: [{ profileId: 'p', active: true, startDate: '2026-01-01', endDate: null, target: 4 }], crossGoals: [{ profileId: 'p', startDate: '2026-01-01', endDate: null, strengthTarget: 0, drylandTarget: 0 }] }
test('complete profile hides question mark, accepting explicit zero cross-training targets and open-ended active goals', () => {
  const setup = swimmerProfileSetup(profile, training, '2026-11-14', 'ready')
  assert.equal(setup.completeCount, 4); assert.equal(setup.show, false); assert.deepEqual(setup.missing, [])
  assert.ok(activeProfileGoals(training, 'p', '2026-11-14').swimGoal)
})

test('loading/failure is unknown, not missing goals; genuine missing fields and expired/inactive goals stay visible', () => {
  for (const state of ['loading', 'error']) {
    const setup = swimmerProfileSetup(profile, null, '2026-11-14', state)
    assert.equal(setup.unknown, true); assert.deepEqual(setup.missing, [])
    assert.equal(setup.checks.find(item => item.key === 'goals').complete, null)
  }
  const incomplete = swimmerProfileSetup({ ...profile, primaryStroke: null }, training, '2026-11-14')
  assert.deepEqual(incomplete.missing, ['specialinriktning'])
  for (const patch of [{ active: false }, { endDate: '2026-11-01' }, { startDate: '2026-12-01' }]) {
    const data = { ...training, seasonGoals: [{ ...training.seasonGoals[0], ...patch }] }
    const setup = swimmerProfileSetup(profile, data, '2026-11-14')
    assert.equal(setup.completeCount, 3)
    assert.ok(patch.startDate ? setup.scheduled.some(note => note.startsWith('Simning:')) : setup.missing.includes('veckomål för simning'))
  }
})

test('question mark is a native sibling button; minimized Formkollen does not mount the network loader until opened', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const control = readFileSync(new URL('../src/swimmer-setup.jsx', import.meta.url), 'utf8')
  const form = readFileSync(new URL('../src/form-kollen.jsx', import.meta.url), 'utf8')
  const speed = readFileSync(new URL('../src/swimmer-speed.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/swimmer-speed.css', import.meta.url), 'utf8')
  assert.match(main, /<\/button>\s*\{!isExpanded && <SwimmerSetupIndicator/)
  assert.match(control, /<button type="button"/); assert.match(control, /aria-expanded/)
  assert.match(form, /\[expanded, setExpanded\] = useState\(false\)/)
  assert.match(form, /expanded && <FormKollenContent/)
  assert.match(speed, /IntersectionObserver/); assert.match(speed, /visibilitychange/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(main, /<b className="swimmer-level">/)
})

test('bolt is returned with the existing traffic request, scoped to eligible profiles with no extra database reads', async () => {
  const queries = []
  const report = await loadSwimmerTraffic('2026-11-14', async query => {
    queries.push(query)
    const table = query.split('?')[0]
    const values = table === 'profiles' ? [{ id: 'member', active: true, approval_status: 'approved', is_test_profile: false }] : table === 'responses' ? ['member', 'not-in-roster'].map(profile_id => ({ id: `row-${profile_id}`, profile_id, activity_date: '2026-11-14', created_at: '2026-11-14T19:00:00Z', day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim', activity_minutes: 60, rpe: 5, speed_feeling: 5 })) : []
    return { ok: true, json: async () => values }
  }, { now })
  assert.equal(queries.length, 6)
  assert.equal(report.profiles.length, 1)
  assert.equal(report.profiles[0].profileId, 'member')
  assert.equal(report.profiles[0].speed.level, 'max')
  assert.equal(report.fetchedAt, now)
  assert.doesNotMatch(JSON.stringify(report.profiles[0].speed), /row-member|profile_id|comment|not-in-roster/)
})
