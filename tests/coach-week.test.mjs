import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoachWeek, coachWeekMonday, validCoachWeek } from '../shared/coach-week.js'
import { loadCoachWeek } from '../server/coach-week.js'

const start = '2026-10-19', date = '2026-10-21'
const profiles = [{ id: 'a', displayName: 'Ebba' }, { id: 'b', displayName: 'Bo' }, { id: 'test', displayName: 'Test', isTestProfile: true }]
const response = (type, slot = 'afternoon_swim', extra = {}) => ({ profileId: 'a', date, type, slot, activityType: 'swim', createdAt: `${date}T17:00:00Z`, ...extra })
const cell = (data, slot = 'afternoon_swim') => buildCoachWeek(profiles, data, start).cells.find((item) => item.date === date && item.slot === slot)

test('plans and completions count unique swimmers independently and keep slots apart', () => {
  const plans = [{ profileId: 'a', date, slot: 'afternoon_swim' }, { profileId: 'a', date, slot: 'afternoon_swim' }, { profileId: 'test', date, slot: 'afternoon_swim' }]
  const data = { plans, responses: [response('before'), response('after'), response('after')], attendance: [{ profileId: 'a', date, slot: 'afternoon_swim', present: true, markedAt: `${date}T18:00:00Z` }] }
  const pm = cell(data)
  assert.equal(pm.entries.length, 2)
  assert.equal(pm.planned, 1)
  assert.equal(pm.completed, 1)
  assert.equal(pm.unplanned, 1)
  assert.equal(pm.entries.find((entry) => entry.profileId === 'a').source, 'Närvaro registrerad av tränare')
  assert.equal(cell(data, 'morning_swim').completed, 0)
  assert.equal(cell(data, 'morning_swim').planned, 0)
})

test('manual week marks and trainer attendance need no swimmer check-in', () => {
  const data = { sessions: [{ profileId: 'a', date, slot: 'strength', type: 'strength', source: 'manual' }], attendance: [{ profileId: 'b', date, slot: 'morning_swim', present: true, markedAt: `${date}T10:00:00Z` }] }
  assert.equal(cell(data, 'strength').completed, 1)
  assert.equal(cell(data, 'morning_swim').completed, 1)
  assert.equal(cell(data).completed, 0)
})

test('later trainer absence overrides earlier report and stale checkin session; intent cannot undo it', () => {
  const data = { responses: [response('after'), response('before', 'afternoon_swim', { createdAt: `${date}T20:00:00Z` })], sessions: [{ profileId: 'a', date, slot: 'afternoon_swim', type: 'swim', source: 'checkin' }], attendance: [{ profileId: 'a', date, slot: 'afternoon_swim', present: false, markedAt: `${date}T19:00:00Z` }] }
  assert.equal(cell(data).completed, 0)
  assert.equal(cell(data).entries.find((entry) => entry.profileId === 'a').status, 'Ej närvarande')
  data.responses.push(response('after', 'afternoon_swim', { createdAt: `${date}T21:00:00Z` }))
  assert.equal(cell(data).completed, 1)
})

test('opting out of registration after an older attendance decision does not count completion', () => {
  const data = { responses: [response('after', 'afternoon_swim', { registerTraining: false })], attendance: [{ profileId: 'a', date, slot: 'afternoon_swim', present: true, markedAt: `${date}T16:00:00Z` }] }
  assert.equal(cell(data).completed, 0)
  assert.match(cell(data).entries.find((entry) => entry.profileId === 'a').source, /utan närvaro/)
})

test('race and unassigned legacy answers are visible but never invent a swim slot or completion', () => {
  const data = { responses: [response('after', null, { activityType: null }), response('before', null, { profileId: 'b', competition: true })], sessions: [{ profileId: 'a', date, slot: 'afternoon_swim', type: 'swim', source: 'checkin' }] }
  const result = cell(data)
  assert.equal(result.completed, 0)
  assert.equal(result.entries.find((entry) => entry.profileId === 'a').status, 'Incheckning utan passval')
  assert.equal(result.entries.find((entry) => entry.profileId === 'b').status, 'Ska tävla idag')
})

test('slot incheckning takes precedence over unrelated day activity and late reports use activity date', () => {
  const data = { responses: [response('before'), response('rest', null, { profileId: 'b' }), response('after', 'morning_swim', { createdAt: '2026-10-22T06:00:00Z' })] }
  assert.equal(cell(data).entries.find((entry) => entry.profileId === 'a').status, 'Ska träna idag')
  assert.equal(cell(data).entries.find((entry) => entry.profileId === 'b').status, 'Vilar idag')
  assert.equal(cell(data, 'morning_swim').completed, 1)
})

test('strength and dryland reports use their activity slot and scope follows selected profiles', () => {
  const data = { responses: [response('after', null, { activityType: 'strength' })] }
  assert.equal(cell(data, 'strength').completed, 1)
  assert.equal(cell(data).completed, 0)
  assert.equal(buildCoachWeek([profiles[1]], data, start).cells.every((item) => item.completed === 0 && item.entries.length === 1), true)
})

test('later reported rest or sickness replaces training intention, while confirmed completion stays', () => {
  const data = { responses: [response('before'), response('sick', null, { createdAt: `${date}T19:00:00Z` })] }
  assert.equal(cell(data).entries.find((entry) => entry.profileId === 'a').status, 'Känner sig sjuk')
  data.responses.push(response('after', 'afternoon_swim', { createdAt: `${date}T18:00:00Z` }))
  assert.equal(cell(data).completed, 1)
})

test('week validation handles calendar boundaries and rejects impossible/non-Monday dates', async () => {
  assert.equal(coachWeekMonday('2026-10-25'), start)
  assert.equal(coachWeekMonday('2027-01-01'), '2026-12-28')
  for (const invalid of ['2026-02-30', '2026-10-21', '../profiles', '']) {
    assert.equal(validCoachWeek(invalid), false)
    await assert.rejects(loadCoachWeek(invalid, () => { throw new Error('must not fetch') }), /giltig vecka/)
  }
})

test('week loader pages all four bounded sources and never writes or includes private response text', async () => {
  const requests = []
  const result = await loadCoachWeek(start, async (query, options) => {
    requests.push(query)
    assert.equal(options, undefined)
    assert.match(query, /gte.2026-10-19/)
    assert.match(query, /lt.2026-10-26/)
    assert.doesNotMatch(query, /comment|feeling|coach_notes/)
    let rows = []
    if (query.startsWith('planned_training_sessions') && query.endsWith('offset=0')) rows = Array.from({ length: 500 }, (_, id) => ({ profile_id: `p${id}`, planned_date: date, session_slot: 'morning_swim' }))
    if (query.startsWith('planned_training_sessions') && query.endsWith('offset=500')) rows = [{ profile_id: 'last', planned_date: date, session_slot: 'morning_swim' }]
    return { ok: true, json: async () => rows }
  })
  assert.equal(result.plans.length, 501)
  assert.equal(result.plans.at(-1).profileId, 'last')
  assert.equal(requests.length, 5)
  await assert.rejects(loadCoachWeek(start, async () => ({ ok: false })), /kunde inte hämtas/)
})

test('weekly endpoint denies swimmer and unauthenticated requests before reading data', async () => {
  process.env.SIMKOLL_SWIMMER_CODE = 'week-swimmer-fixture'
  const { default: handler } = await import('../api/training.js')
  for (const code of ['', 'week-swimmer-fixture']) {
    const res = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
    await handler({ method: 'GET', query: { coachWeek: start }, headers: { 'x-simkoll-code': code } }, res)
    assert.equal(res.code, 403)
  }
})
