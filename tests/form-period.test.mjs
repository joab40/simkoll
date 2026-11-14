import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FORM_PERIODS, buildFormPeriods, summarizeFormPeriod } from '../shared/form-period.js'
import { buildFormKollen } from '../shared/form-kollen.js'
import { loadFormKollen } from '../server/form-kollen.js'
import { coachWeekAddDays as add } from '../shared/coach-week.js'

const asOf = '2026-11-14'
const response = (offset, patch = {}) => ({ id: `row-${offset}`, date: add(asOf, offset), createdAt: `${add(asOf, offset)}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: 3, feeling: 4, speedFeeling: 3, rpe: 5, activityMinutes: 60, ...patch })
const full = () => ({ responses: Array.from({ length: 180 }, (_, i) => response(i - 179)), illness: [{ activity_date: asOf, status: 'none' }] })

test('five periods have precise inclusive calendar boundaries and disjoint equal-length comparison windows', () => {
  const periods = buildFormPeriods(full(), asOf)
  assert.deepEqual(Object.keys(periods).map(Number), FORM_PERIODS)
  assert.equal(periods[2].mode, 'latest-answers')
  for (const days of FORM_PERIODS.filter(days => days !== 2)) {
    const period = periods[days]
    assert.equal(period.start, add(asOf, 1 - days)); assert.equal(period.end, asOf)
    assert.equal(period.previousStart, add(asOf, 1 - 2 * days)); assert.equal(period.previousEnd, add(asOf, -days))
    assert.equal(period.metrics.body.days, days); assert.equal(period.previous.metrics.body.days, days)
    assert.equal(period.load.value, 300 * days); assert.equal(period.load.previous.value, 300 * days)
    assert.equal(period.load.ratio, 1)
    assert.equal(period.directions.body.state, 'steady')
  }
})

test('latest-answer mode uses 60/40 on the two latest reports; corrections of a check-in count once', () => {
  const data = { responses: [response(0, { body: 5 }), ...Array.from({ length: 10 }, (_, i) => response(-1, { id: `many-${i}`, body: 1 })), response(-2, { body: 3 }), response(-3, { body: 2 })] }
  const period = buildFormPeriods(data, asOf)[2]
  assert.equal(period.metrics.body.value, 3.4)
  assert.equal(period.previous.metrics.body.value, 2.6)
  assert.equal(period.directions.body.delta, .8); assert.equal(period.directions.body.state, 'up')
  assert.equal(period.metrics.body.weighted, true)
  assert.equal(period.load.value, 600, 'load uses deduplicated sums, not weighted averages or duplicate submissions')
})

test('latest-answer mode keeps real dates when today is missing; sparse comparisons stay unavailable', () => {
  const data = { responses: [response(-1, { body: 5 }), response(-2, { body: 1 }), response(-3, { body: 1 })] }
  const periods = buildFormPeriods(data, asOf)
  assert.equal(periods[2].metrics.body.value, 3.4)
  assert.equal(periods[2].metrics.body.days, 2)
  assert.equal(periods[2].metrics.body.lastDay, add(asOf, -1))
  assert.equal(periods[2].metrics.body.answers, 2)
  assert.equal(periods[2].metrics.body.weighted, true)
  assert.equal(periods[2].directions.body.state, 'unknown')
  assert.equal(periods[2].load.ratio, null)
  const latest = buildFormKollen(data, asOf)
  assert.equal(summarizeFormPeriod(periods[90], latest).confidence, 'begränsat')
  assert.equal(summarizeFormPeriod(periods[90], latest).provisional, true)
  const empty = buildFormPeriods({}, asOf)[2]
  assert.equal(empty.metrics.body.value, null); assert.equal(empty.load.value, null)
})

test('sleep averages and load sums are unweighted; planned-time provenance, partial coverage and illnesses remain explicit', () => {
  const data = { responses: [response(0), response(-1, { activityMinutes: null, linkedEstimate: { source: 'linked-plan', minutes: 120 } })],
    sleep: [{ activity_date: asOf, minutes: 600, quality: 5 }, { activity_date: add(asOf, -1), minutes: 420, quality: 1 }],
    illness: [{ activity_date: asOf, status: 'mild' }, { activity_date: add(asOf, -1), status: 'sick' }, { activity_date: asOf, status: 'mild' }] }
  const period = buildFormPeriods(data, asOf)[2]
  assert.equal(period.sleep.minutes, 510); assert.equal(period.sleep.quality, 3); assert.equal(period.sleep.poorNights, 1)
  assert.equal(period.load.value, 900); assert.equal(period.load.reportedValue, 300); assert.equal(period.load.estimatedValue, 600)
  assert.equal(period.illness.mildDays, 1); assert.equal(period.illness.sickDays, 1)
  assert.equal(period.illness.answeredDays, 2)
})

test('selected period changes values, arrows and summary without suppressing the fixed latest state or warnings', () => {
  const data = full()
  data.responses = data.responses.map(row => ({ ...row, body: row.date >= add(asOf, -1) ? 5 : row.date >= add(asOf, -89) ? 2 : 4, speedFeeling: row.date >= add(asOf, -1) ? 5 : row.date >= add(asOf, -89) ? 2 : 4 }))
  data.illness = [{ activity_date: asOf, status: 'mild' }]
  const built = buildFormKollen(data, asOf), before = JSON.stringify(built)
  assert.equal(built.periods[2].metrics.body.value, 5)
  assert.equal(built.periods[2].directions.body.state, 'up')
  assert.equal(built.periods[90].directions.body.state, 'down')
  assert.match(summarizeFormPeriod(built.periods[2], built).label, /Högre/)
  assert.match(summarizeFormPeriod(built.periods[90], built).label, /Lägre/)
  for (const days of FORM_PERIODS) assert.equal(summarizeFormPeriod(built.periods[days], built).phase, 'watch')
  assert.equal(JSON.stringify(built), before)
  assert.ok(built.flags.some(flag => flag.includes('känningar')))
  assert.equal(built.phase, 'watch')
})

test('90-day history and previous period include the oldest endpoint, but ignore older/future/invalid rows and non-swimming speed', () => {
  const data = full()
  data.responses = data.responses.filter(row => row.date !== add(asOf, -179))
  data.responses.push(response(-179, { body: 1 }), response(-180, { body: 1 }), response(1, { body: 1 }), response(0, { date: '2026-11-00', body: 1 }))
  const periods = buildFormPeriods(data, asOf)
  assert.equal(periods[90].previous.metrics.body.days, 90)
  assert.equal(periods[90].previous.metrics.body.value, 3)
  assert.equal(periods[90].previous.load.total, 90)
  const built = buildFormKollen(data, asOf)
  assert.equal(built.history.length, 90); assert.equal(built.history[0].date, add(asOf, -89))
  assert.equal(built.history.at(-1).date, asOf)
  for (const patch of [{ activityType: 'strength' }, { competition: true }, { plannedCompletion: 'no' }]) {
    const result = buildFormPeriods({ responses: [response(0, patch), response(-1, patch)] }, asOf)[2]
    assert.equal(result.metrics.speed.value, null)
  }
  assert.throws(() => buildFormPeriods({}, '2026-02-30'), /Ogiltigt/)
})

test('longer windows require sufficient response days and complete reports, not only a few dense submissions', () => {
  const data = full()
  data.responses = data.responses.map(row => ({ ...row, rpe: row.date >= add(asOf, -20) ? null : row.rpe }))
  const periods = buildFormPeriods(data, asOf)
  assert.equal(periods[90].load.ratio, null, 'less than 80% complete reports prevents a load ratio')
  assert.equal(periods[90].directions.body.state, 'steady', 'missing load does not erase observed feelings')
  const sparse = buildFormPeriods({ responses: [response(0), response(-90)] }, asOf)[90]
  assert.equal(sparse.directions.body.state, 'unknown'); assert.equal(sparse.load.ratio, null)
})

test('loader reads exactly 180 scoped days once for all five periods, never raw comments or coach context for swimmers', async () => {
  const calls = []
  const result = await loadFormKollen({ id: 'profile', training_group: 'junior' }, asOf, async query => {
    calls.push(query)
    assert.ok(query.includes(`activity_date=gte.${add(asOf, -179)}`))
    assert.ok(query.includes(`activity_date=lte.${asOf}`))
    assert.ok(query.includes('profile_id=eq.profile'))
    assert.doesNotMatch(query, /comment|reflection/)
    return { ok: true, json: async () => [] }
  })
  assert.equal(calls.length, 3)
  assert.equal(result.history.length, 90)
  assert.deepEqual(Object.keys(result.periods).map(Number), FORM_PERIODS)
  assert.equal(Object.hasOwn(result, 'coachContext'), false)
})

test('calendar windows remain exact over daylight-saving, leap-day and year boundaries', () => {
  for (const end of ['2026-03-30', '2026-10-26', '2028-03-01', '2027-01-01']) {
    const periods = buildFormPeriods({}, end)
    for (const days of FORM_PERIODS.filter(days => days !== 2)) {
      const period = periods[days]
      const elapsed = (Date.parse(`${period.end}T12:00:00Z`) - Date.parse(`${period.previousStart}T12:00:00Z`)) / 86400000
      assert.equal(elapsed, 2 * days - 1)
    }
  }
})

test('invalid or missing load never produces Infinity, guessed zero or a comparison; sparse source dates remain missing', () => {
  const data = { responses: [response(0), response(-1), response(-2, { rpe: null }), response(-3, { activityMinutes: null })],
    sleep: [{ activity_date: asOf, minutes: 2000, quality: 5 }, { activity_date: asOf, minutes: 480, quality: 5, skipped: true }],
    illness: [{ activity_date: asOf, status: 'none', skipped: true }] }
  const period = buildFormPeriods(data, asOf)[2]
  assert.equal(period.load.previous.value, null)
  assert.equal(period.load.ratio, null)
  assert.equal(period.sleep.minutes, null)
  assert.equal(period.illness.answeredDays, 0)
  assert.doesNotMatch(JSON.stringify(period), /Infinity|NaN/)
})

test('period controls drive the whole card and preserve accessible independent latest status', () => {
  const view = readFileSync(new URL('../src/form-kollen.jsx', import.meta.url), 'utf8')
  assert.match(view, /aria-label="Analysperiod"/)
  assert.match(view, /selected = data\.periods\[period\]/)
  assert.match(view, /summarizeFormPeriod\(selected, data\)/)
  assert.match(view, /aria-live="polite"/)
  assert.match(view, /Senaste rapporterade läge · separat från periodanalysen/)
  assert.match(view, /data\.flags\.length > 0/)
  assert.doesNotMatch(view, /setInterval/)
})
