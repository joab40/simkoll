import test from 'node:test'
import assert from 'node:assert/strict'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { heavyTrainingPattern, HEAVY_PATTERN_RULE } from '../shared/heavy-training-pattern.js'
import { followupSignals } from '../shared/followup-signals.js'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { buildSwimmerTraffic, swimmerTrafficAt } from '../shared/swimmer-traffic.js'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'
import { featureFaqGuide } from '../shared/feature-faq.js'

const asOf = '2026-11-02' // Monday: history must not reset at the calendar-week boundary.
const row = (offset, extra = {}) => ({ profileId: 'a', date: coachWeekAddDays(asOf, offset), type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: 1, feeling: 4, ...extra })
const rows = offsets => offsets.map(offset => row(offset))
const signal = responses => followupSignals({ responses, asOf })
const minimum = [0, -1, -3, -5, -7]
const profiles = [{ id: 'a', displayName: 'Fiktiv simmare' }]

test('twos alone remain stable even throughout fourteen days, with no red heart or follow-up', () => {
  const responses = Array.from({ length: 14 }, (_, i) => row(-i, { body: 2, feeling: 2 }))
  assert.equal(signal(responses).color, 'green')
  assert.deepEqual(signal(responses).reasons, [])
  const heart = buildTrainingHeart({ responses }, asOf)
  assert.equal(heart.color, 'yellow') // Physical training colour, not a follow-up warning.
  assert.equal(heart.heavy.persistent, false)
  assert.equal(heart.readiness.state, 'heavy')
  assert.deepEqual(heart.warnings, [])
})

test('persistent one needs all three boundaries: five days, eight-day span and two recent days', () => {
  const pattern = heavyTrainingPattern(rows(minimum), asOf)
  assert.equal(pattern.body.dates.length, 5)
  assert.equal(pattern.body.spanDays, 8)
  assert.equal(pattern.body.freshDays, 2)
  assert.equal(pattern.persistent, true)
  assert.equal(signal(rows(minimum)).color, 'red')
  assert.equal(buildTrainingHeart({ responses: rows(minimum) }, asOf).color, 'red')
  for (const offsets of [[0, -1, -3, -7], [0, -1, -2, -4, -6], [0, -3, -4, -5, -7]]) {
    assert.equal(signal(rows(offsets)).color, 'yellow', offsets.join(','))
    assert.equal(heavyTrainingPattern(rows(offsets), asOf).persistent, false)
  }
  assert.equal(signal(rows([0, -1, -2, -3, -4, -5, -6])).color, 'yellow', 'one entire heavy week is not yet red')
  assert.equal(signal(rows([0, -1, -2, -3, -4, -5, -6, -7])).color, 'red', 'eight days can qualify')
})

test('metrics and days cannot be pooled; duplicates, missing, invalid and future answers do not qualify', () => {
  assert.equal(signal(rows([0, -1, -7]).concat([-3, -5].map(offset => row(offset, { body: 4, feeling: 1 })))).color, 'yellow')
  assert.equal(signal(Array(20).fill(row(0))).color, 'yellow')
  const invalid = [row(-14), row(1), row(0, { date: '2026-02-30' }), row(-3, { body: '1' }), row(-5, { body: 0 }), row(-7, { body: null })]
  assert.equal(heavyTrainingPattern(invalid, asOf).body.dates.length, 0)
  assert.equal(heavyTrainingPattern(rows(minimum).concat(invalid, row(0)), asOf).body.dates.length, 5)
  assert.equal(signal(rows(minimum).map(item => ({ ...item, body: 4, feeling: 1 }))).color, 'red', 'day feeling alone can meet the same rule')
  assert.throws(() => heavyTrainingPattern([], '2026-02-30'), /Ogiltigt/)
})

test('a stale or resolved pattern cannot stay red solely because old ones remain within fourteen days', () => {
  const responses = rows([-3, -4, -6, -8, -10]).concat(row(0, { body: 2 }), row(-1, { body: 4 }))
  assert.equal(signal(responses).color, 'yellow') // A one is still present in the seven-day watch window.
  assert.equal(buildTrainingHeart({ responses }, asOf).color, 'yellow')
  assert.equal(signal(rows([-8, -9, -10, -11, -13]).concat(row(0, { body: 2 }))).color, 'green')
})

test('illness and sleep still act independently, even with twos and low reported training load', () => {
  const responses = [row(0, { body: 2, feeling: 2, rpe: 1, activityMinutes: 10 })]
  assert.equal(followupSignals({ responses, asOf, illness: [{ activity_date: asOf, status: 'sick' }] }).color, 'red')
  assert.equal(followupSignals({ responses, asOf, illness: [0, -1, -2].map(offset => ({ activity_date: coachWeekAddDays(asOf, offset), status: 'mild' })) }).color, 'red')
  const sleep = [0, -1].map(offset => ({ activity_date: coachWeekAddDays(asOf, offset), minutes: 480, quality: 1 }))
  assert.equal(swimmerTrafficAt({ responses, sleep }, asOf).color, 'red')
})

test('card, control panel and prior-week comparison use complete fourteen-day patterns without polluting weekly metrics', () => {
  const responses = rows(minimum).concat(rows(minimum.map(offset => offset - 7)), row(-13, { speedFeeling: 1 }), row(-12, { speedFeeling: 1 }), row(-7, { speedFeeling: 3 }), row(-6, { speedFeeling: 3 }))
  const traffic = buildSwimmerTraffic(profiles, { responses }, asOf).profiles[0]
  assert.equal(traffic.current.color, 'red')
  assert.equal(traffic.previous.color, 'red', 'comparison requires the earliest dates in its own fourteen-day window')
  const mapped = responses.map(({ date, ...rest }) => ({ ...rest, activityDate: date }))
  const panel = buildCoachControlPanel(profiles, mapped, asOf, [], { periodStart: asOf })
  assert.equal(panel.followUps[0].profileId, 'a')
  assert.deepEqual(panel.followUps[0].reasons, traffic.current.reasons)
  assert.equal(panel.completedPasses, 1)
  assert.equal(panel.swimmers[0].speedPrevious, 3, 'extended signal history must not enter the previous calendar-week speed mean')
  assert.equal(panel.signalStart, '2026-10-20')
  assert.equal(panel.symptomStart, '2026-10-27')
})

test('loader reads twenty-one response days but fourteen other days, with no new writes or needless estimate reads', async () => {
  const calls = []
  const responses = rows(minimum.map(offset => offset - 7)).concat(row(-20, { activityMinutes: null, rpe: 3 }), row(0, { body: 2 }))
  const report = await loadSwimmerTraffic(asOf, async (query, options) => {
    calls.push(query)
    assert.equal(options, undefined)
    let data = []
    if (query.startsWith('profiles?')) data = [{ id: 'a' }]
    else {
      const params = new URLSearchParams(query.split('?')[1])
      assert.deepEqual(params.getAll('activity_date').length ? params.getAll('activity_date') : params.getAll(query.startsWith('personal_') ? 'session_date' : 'planned_date'), [query.startsWith('responses?') ? 'gte.2026-10-13' : 'gte.2026-10-20', 'lte.2026-11-02'])
    }
    if (query.startsWith('responses?')) data = responses.map(item => ({ id: item.date, profile_id: 'a', activity_date: item.date, day_type: item.type, body: item.body, feeling: item.feeling, activity_type: item.activityType, session_slot: item.trainingSlot, activity_minutes: Object.hasOwn(item, 'activityMinutes') ? item.activityMinutes : 60, rpe: 3 }))
    return { ok: true, json: async () => data }
  })
  assert.equal(calls.length, 6)
  assert.equal(report.profiles[0].previous.color, 'red')
  assert.equal(report.profiles[0].current.color, 'green')
})

test('both FAQ assistants and visible rules explain the identical non-medical threshold', () => {
  for (const role of ['coach', 'swimmer']) assert.ok(featureFaqGuide(role).includes(HEAVY_PATTERN_RULE))
  assert.match(HEAVY_PATTERN_RULE, /inte en medicinsk gräns/)
})
