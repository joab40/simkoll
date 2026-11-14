import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFormKollen } from '../shared/form-kollen.js'
import { FORM_EXAMPLES } from '../shared/form-kollen-examples.js'
import { coachWeekAddDays as add } from '../shared/coach-week.js'
const asOf = '2026-11-14'
const row = (offset, patch = {}) => ({ id: `r${offset}`, date: add(asOf, offset), createdAt: `${add(asOf, offset)}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: 5, feeling: 5, speedFeeling: 5, rpe: 5, activityMinutes: 60, ...patch })
const full = () => ({ responses: Array.from({ length: 42 }, (_, i) => row(i - 41)), sleep: [0, -1, -2].map(i => ({ activity_date: add(asOf, i), minutes: 510, quality: 5 })), illness: [{ activity_date: asOf, status: 'none' }] })

test('synthetic phases use the same evaluation as real data and never claim verified top form', () => {
  assert.deepEqual(FORM_EXAMPLES.map(item => item.data.phase), ['mixed', 'mixed', 'loaded', 'improving', 'positive', 'unknown', 'watch'])
  for (const { data } of FORM_EXAMPLES) assert.doesNotMatch(data.label, /toppform|nedtränad/i)
  const positive = buildFormKollen(full(), asOf)
  assert.equal(positive.phase, 'positive'); assert.equal(positive.confidence, 'gott')
  assert.equal(positive.load.baselineWeeks, 5); assert.equal(positive.load.normalLoad, 2100)
})

test('empty, single-day, stale, future and invalid observations never become positive or fabricated zeros', () => {
  const empty = buildFormKollen({}, asOf)
  assert.equal(empty.phase, 'unknown'); assert.equal(empty.current.body.value, null)
  assert.ok(empty.history.every(day => day.body == null && day.speed == null && day.load == null))
  for (const responses of [[row(0)], [row(-3), row(-4)], [row(1), row(2)], [row(0, { body: '5' }), row(-1, { body: 9 })]]) {
    assert.equal(buildFormKollen({ responses }, asOf).phase, 'unknown')
  }
  assert.throws(() => buildFormKollen({}, '2026-02-30'), /Ogiltigt/)
})

test('two or three covered weeks allow a marked preliminary comparison, not a four-week blockade', () => {
  const data = full()
  const sparse = buildFormKollen({ ...data, responses: data.responses.filter(row => row.date >= add(asOf, -27)) }, asOf)
  assert.equal(sparse.load.baselineWeeks, 3); assert.equal(sparse.phase, 'positive')
  assert.equal(sparse.load.normalLoad, 2100)
  assert.equal(sparse.baselineKnown, false); assert.equal(sparse.provisional, true)
  const high = buildFormKollen({ ...data, responses: data.responses.map(row => ({ ...row, activityMinutes: row.date >= add(asOf, -6) ? 120 : 60 })) }, asOf)
  assert.equal(high.phase, 'positive'); assert.equal(high.load.ratio, 2)
  assert.equal(high.load.normalLoad, 2100, 'current week must not contaminate baseline')
})

test('one current speed observation remains an observation alongside low body and coach-reported PBs', () => {
  const result = FORM_EXAMPLES.find(item => item.key === 'partial').data
  assert.equal(result.current.speed.days, 1)
  assert.equal(result.current.speed.value, 5)
  assert.equal(result.current.body.value, 2.5)
  assert.equal(result.provisional, true)
  assert.equal(result.phase, 'mixed')
  assert.match(result.label, /Positiva prestationsuppgifter.*kroppen känns tung/)
  assert.equal(result.metricDirections.speed.state, 'unknown')
  assert.match(result.metricDirections.speed.label, /Senast 5\/5.*1 svarsdag/)
  assert.equal(result.context.verified, false)
  assert.equal(result.context.source, 'coach')
})

test('without coach PB context the same low-body/high-speed case still gets a preliminary interpretation', () => {
  const data = full()
  data.responses = data.responses.filter(item => item.date >= add(asOf, -13)).map(item => ({ ...item, body: 2.5, speedFeeling: item.date === add(asOf, -1) ? 5 : null }))
  const result = buildFormKollen(data, asOf)
  assert.equal(result.phase, 'mixed'); assert.equal(result.provisional, true)
  assert.match(result.label, /Hög fartkänsla.*kroppen känns tung/)
  assert.match(result.reasons[0], /En svarsdag räcker inte/)
  assert.ok(!result.context)
})

test('coach PBs never override symptoms, missing illness source, or low data coverage', () => {
  const context = { observedOn: asOf, trainingPbDate: asOf }
  const sick = buildFormKollen({ ...full(), context, illness: [{ activity_date: asOf, status: 'sick' }] }, asOf)
  assert.equal(sick.phase, 'watch'); assert.ok(sick.flags.length)
  assert.equal(buildFormKollen({ ...full(), context, illnessAvailable: false }, asOf).phase, 'unknown')
  const alone = buildFormKollen({ responses: [row(0)], context }, asOf)
  assert.equal(alone.phase, 'unknown'); assert.equal(alone.confidence, 'begränsat')
})

test('separate metric directions cannot label a sparse speed series as declining because body fell', () => {
  const data = full()
  data.responses = data.responses.map(item => ({ ...item, body: item.date >= add(asOf, -2) ? 2.5 : item.date >= add(asOf, -6) ? 3.5 : 4, feeling: 4, speedFeeling: item.date === asOf ? 5 : null }))
  const result = buildFormKollen(data, asOf)
  assert.equal(result.metricDirections.body.state, 'down')
  assert.equal(result.metricDirections.feeling.state, 'steady')
  assert.equal(result.metricDirections.speed.state, 'unknown')
})

test('warning, missing illness source and skipped/old illness cannot be hidden by perfect feelings', () => {
  for (const status of ['mild', 'sick']) {
    const result = buildFormKollen({ ...full(), illness: [{ activity_date: asOf, status }] }, asOf)
    assert.equal(result.phase, 'watch'); assert.ok(result.flags.length)
    assert.equal(result.confidence, 'gott', 'coverage is independent of positive or negative answers')
  }
  for (const illness of [[], [{ activity_date: asOf, status: 'none', skipped: true }], [{ activity_date: add(asOf, -2), status: 'none' }]]) assert.notEqual(buildFormKollen({ ...full(), illness }, asOf).phase, 'positive')
  assert.equal(buildFormKollen({ ...full(), illnessAvailable: false }, asOf).phase, 'unknown')
  const sleep = [0, -1, -2].map(i => ({ activity_date: add(asOf, i), minutes: 390, quality: 5 }))
  assert.equal(buildFormKollen({ ...full(), sleep }, asOf).phase, 'watch')
})

test('daily means have equal weight and the graph retains null gaps and actual observations', () => {
  const data = { responses: [row(0, { body: 1 }), ...Array.from({ length: 10 }, (_, i) => row(-1, { id: `duplicate${i}`, body: 5 }))] }
  const result = buildFormKollen(data, asOf)
  assert.equal(result.current.body.value, 3); assert.equal(result.current.body.days, 2)
  assert.equal(result.history.at(-3).body, null)
  assert.equal(result.history.at(-2).body, 5)
  assert.equal(result.history.at(-1).body, 1)
  assert.equal(result.load.total, 2, 'latest after-report per day/activity/slot, not duplicate sums')
})

test('gym, races and not-completed reports never create swimming speed or guessed loads', () => {
  for (const patch of [{ activityType: 'strength' }, { competition: true }, { plannedCompletion: 'no' }]) {
    const data = full(); data.responses = data.responses.map(row => ({ ...row, ...patch }))
    const result = buildFormKollen(data, asOf)
    assert.equal(result.current.speed.value, null); assert.notEqual(result.phase, 'positive')
  }
  const data = full(); data.responses = data.responses.map(row => ({ ...row, activityMinutes: null }))
  assert.equal(buildFormKollen(data, asOf).load.value, null)
  data.responses = data.responses.map(row => ({ ...row, linkedEstimate: { source: 'linked-plan', minutes: 90 } }))
  const estimated = buildFormKollen(data, asOf)
  assert.equal(estimated.load.value, 3150); assert.equal(estimated.load.estimated, 7)
})

test('one outlier cannot create a rising trend; two persistent decreasing indicators trigger follow-up', () => {
  const data = full()
  data.responses = data.responses.map(row => ({ ...row, body: row.date >= add(asOf, -2) ? 2 : row.date >= add(asOf, -6) ? 3 : 5, feeling: row.date >= add(asOf, -2) ? 2 : row.date >= add(asOf, -6) ? 3 : 5 }))
  const result = buildFormKollen(data, asOf)
  assert.equal(result.phase, 'watch'); assert.equal(result.direction, 'down')
  const one = buildFormKollen({ responses: [row(0), row(-3, { body: 1, speedFeeling: 1 })] }, asOf)
  assert.equal(one.direction, 'unknown')
})

test('card replaces the header heart, sits after direction and supports accessible actual-value graphs', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const view = readFileSync(new URL('../src/form-kollen.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/form-kollen.css', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /<TrainingHeart/)
  assert.match(main, /swimmer-trend-card[\s\S]*?<FormKollenCard[\s\S]*?<SwimmerAgreementCard/)
  for (const text of ['aria-expanded', 'aria-controls', 'aria-pressed', 'role="status"', '<caption>', "useState(14)", 'retry: false']) assert.ok(view.includes(text), text)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(view, /setInterval|Math.random|createPortal/)
})
