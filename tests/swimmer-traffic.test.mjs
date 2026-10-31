import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { swimmerTrafficAt, buildSwimmerTraffic, trafficCounts } from '../shared/swimmer-traffic.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'

const end = '2026-10-31'
const profile = { id: 'a', approvalStatus: 'approved', createdAt: '2026-09-01T10:00:00Z' }
const answer = (date = end, extra = {}) => ({ profileId: 'a', date, type: 'after', body: 4, feeling: 4, ...extra })
const night = (date, minutes = 480, quality = 5) => ({ profile_id: 'a', activity_date: date, minutes, quality })
const status = data => swimmerTrafficAt(data, end)

test('one classifier distinguishes all colours without treating missing values as low scores', () => {
  assert.equal(status({}).color, 'unknown')
  assert.equal(status({ responses: [answer()] }).color, 'green')
  assert.equal(status({ responses: [answer(end, { body: 1 })] }).color, 'yellow')
  assert.equal(status({ responses: [answer('2026-10-30', { body: 2, feeling: 1 }), answer(end, { body: 1, feeling: 2 })] }).color, 'red')
  assert.equal(status({ responses: [answer(end, { type: 'sick' }), answer(end, { type: 'sick' })] }).color, 'yellow')
  assert.equal(status({ responses: [answer('2026-10-30', { type: 'sick' }), answer(end, { type: 'sick' })] }).color, 'red')
  for (const value of [null, undefined, '', 0, '1', NaN]) {
    assert.equal(status({ responses: [answer(end, { body: value, feeling: value })] }).color, 'green')
  }
})

test('activity dates include the entire first day, exclude future data and cross DST safely', () => {
  assert.equal(status({ responses: [answer('2026-10-25')] }).color, 'green')
  assert.equal(status({ responses: [answer('2026-10-24'), answer('2026-11-01')] }).color, 'unknown')
  assert.equal(status({ responses: [answer('2026-02-30')] }).color, 'unknown')
  assert.throws(() => swimmerTrafficAt({}, '2026-02-30'), /Ogiltigt/)
  const report = buildSwimmerTraffic([profile], {}, '2027-01-01')
  assert.deepEqual(report.range, { start: '2026-12-26', end: '2027-01-01', previousStart: '2026-12-19', previousEnd: '2026-12-25' })
})

test('sleep warnings affect the same colours as the card, independently of RPE', () => {
  const three = ['2026-10-29', '2026-10-30', end].map(day => night(day, 420))
  assert.equal(status({ sleep: three }).color, 'yellow')
  const five = ['2026-10-27', '2026-10-28', ...three.map(row => row.activity_date)].map(day => night(day, 420))
  assert.equal(status({ sleep: five }).color, 'red')
  assert.match(status({ sleep: five }).reasons.join(' '), /5 nätter/)
  assert.equal(status({ sleep: [night(end, 480, 1), night('2026-10-30', 480, 1)] }).color, 'red')
  assert.equal(status({ sleep: three.map(row => ({ ...row, skipped: true })) }).color, 'unknown')
  assert.equal(status({ sleep: three.map(row => ({ ...row, quality: null })) }).color, 'unknown')
  assert.equal(status({ sleep: Array(5).fill(night(end, 420)) }).color, 'green')
})

test('planned sessions deduplicate exact date/slot and use the respective calendar week', () => {
  const plans = [{ date: '2026-10-30', slot: 'morning_swim' }, { date: '2026-10-30', slot: 'afternoon_swim' }]
  const result = status({ plans: [...plans, ...plans], sessions: [{ date: '2026-10-30', slot: 'morning_swim' }] })
  assert.equal(result.color, 'yellow')
  assert.match(result.reasons[0], /^1 planerade pass/)
  assert.equal(status({ plans: [...plans, { date: end, slot: 'strength' }] }).color, 'red')
  assert.equal(status({ plans, sessions: plans }).color, 'green')
  assert.equal(status({ plans: [{ date: '2026-10-25', slot: 'strength' }] }).color, 'unknown')
  const past = swimmerTrafficAt({ plans: [{ date: '2026-10-23', slot: 'strength' }] }, '2026-10-24')
  assert.equal(past.color, 'yellow')
})

test('comparison uses one current roster, no invented previous status for new swimmers', () => {
  const roster = [profile, { id: 'new', createdAt: '2026-10-28T10:00:00Z' }, { id: 'test', isTestProfile: true }, { id: 'off', active: false }, { id: 'pending', approvalStatus: 'pending' }, profile]
  const report = buildSwimmerTraffic(roster, { responses: [answer(), answer('2026-10-24'), answer(end, { profileId: 'new' }), answer('2026-10-24', { profileId: 'new' })] }, end)
  assert.equal(report.profiles.length, 2)
  assert.equal(report.profiles[1].current.color, 'green')
  assert.equal(report.profiles[1].previous.color, 'unknown')
  const counts = trafficCounts(roster, report)
  assert.deepEqual(counts.current, { red: 0, yellow: 0, green: 2, unknown: 0 })
  assert.deepEqual(counts.previous, { red: 0, yellow: 0, green: 1, unknown: 1 })
  assert.equal(counts.total, 2)
  assert.equal(counts.canCompare, true)
  assert.equal(trafficCounts([roster[1]], report).canCompare, false)
})

test('group/search cohort changes both sides; absent rows stay grey, not green', () => {
  const report = { profiles: [{ profileId: 'a', current: { color: 'red' }, previous: { color: 'green' } }, { profileId: 'b', current: { color: 'green' }, previous: { color: 'yellow' } }] }
  const scoped = trafficCounts([profile, { id: 'missing' }], report)
  assert.deepEqual(scoped.current, { red: 1, yellow: 0, green: 0, unknown: 1 })
  assert.deepEqual(scoped.previous, { red: 0, yellow: 0, green: 1, unknown: 1 })
  assert.equal(trafficCounts([], report).canCompare, false)
  assert.equal(trafficCounts([profile], null).canCompare, false)
})

test('loader reads all pages from five bounded, narrow sources without writes', async () => {
  const requests = []
  const report = await loadSwimmerTraffic(end, async (query, options) => {
    requests.push(query)
    assert.equal(options, undefined)
    assert.doesNotMatch(query, /comment|coach_notes|reflection|\*/)
    if (!query.startsWith('profiles?')) {
      assert.match(query, /gte.2026-10-18/)
      assert.match(query, /lte.2026-10-31/)
    }
    let rows = []
    if (query.startsWith('profiles?')) {
      assert.match(query, /active=eq.true&approval_status=eq.approved&is_test_profile=eq.false/)
      rows = [{ id: 'a' }]
    }
    if (query.startsWith('responses?')) rows = query.endsWith('offset=0')
      ? Array.from({ length: 500 }, (_, id) => ({ id, profile_id: 'a', activity_date: '2026-10-24', body: 4, feeling: 4 }))
      : [{ id: 501, profile_id: 'a', activity_date: end, day_type: 'sick' }]
    return { ok: true, json: async () => rows }
  })
  assert.equal(requests.length, 6)
  assert.equal(report.profiles[0].current.color, 'yellow')
  assert.equal(report.profiles[0].previous.color, 'green')
  assert.doesNotMatch(JSON.stringify(report), /activity_date|profile_id|minutes|comment/)
})

test('loader never returns partial or silently truncated comparisons', async () => {
  await assert.rejects(loadSwimmerTraffic(end, async query => ({ ok: !query.startsWith('profile_daily_sleep?'), json: async () => [] })), /fullständigt/)
  await assert.rejects(loadSwimmerTraffic(end, async query => ({ ok: true, json: async () => query.startsWith('responses?') ? Array(500).fill({}) : [] })), /fullständigt/)
  await assert.rejects(loadSwimmerTraffic('2026-02-30', () => { throw Error('must not read') }), /Ogiltigt/)
})

test('API denies unauthenticated and swimmer traffic requests before accessing data', async () => {
  process.env.SIMKOLL_SWIMMER_CODE = 'traffic-swimmer-fixture'
  const { default: handler } = await import('../api/training.js')
  for (const code of ['', 'traffic-swimmer-fixture']) {
    const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
    await handler({ method: 'GET', query: { traffic: 'true' }, headers: { 'x-simkoll-code': code } }, response)
    assert.equal(response.code, 403)
  }
})

test('cards and colour filters share report statuses; UI distinguishes errors and count direction', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const view = readFileSync(new URL('../src/swimmer-traffic-overview.jsx', import.meta.url), 'utf8')
  assert.match(main, /trafficFor\(profile\).color === trafficFilter/)
  assert.match(main, /const traffic = trafficFor\(profile\)/)
  assert.doesNotMatch(main, /trafficColorFor/)
  assert.match(main, /\[code, trafficDate, trafficKey\]/)
  assert.match(view, /role="alert"/)
  assert.match(view, /Uppåt betyder inte automatiskt bättre/)
  assert.match(view, /Jämförelse saknas/)
  assert.match(view, /tidigare \$\{counts.previous\[color\]\}/)
  assert.match(view, /aria-pressed/)
})
