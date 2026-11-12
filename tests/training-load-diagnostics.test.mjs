import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { trainingLoadCoverage, trainingLoadIssueText } from '../shared/training-load-diagnostics.js'
import { buildSwimmerPasses } from '../server/individual-analysis.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'

const asOf = '2026-11-02'
const report = (patch = {}) => ({ id: 'a', profileId: 'p', date: '2026-11-01', createdAt: '2026-11-01T18:00:00Z', type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', plannedCompletion: 'full', activityMinutes: null, rpe: 5, ...patch })
const workout = (patch = {}) => ({ id: 'w', workout_date: '2026-11-01', time_of_day: 'afternoon', duration_minutes: 110, target_groups: ['junior'], ...patch })
const enrich = (responses, extra = {}) => withLinkedTrainingAmounts(responses, { asOf, trainingGroup: 'junior', workouts: [workout()], ...extra })
const heart = rows => buildTrainingHeart({ responses: rows }, asOf)

test('missing time has an exact fixed reason without inferring minutes or modifying input', () => {
  const cases = [
    [{ activityMinutes: 0 }, {}, 'invalid-reported-time'],
    [{ activityType: null }, {}, 'activity-missing'],
    [{ plannedCompletion: 'partial' }, { workouts: [] }, 'no-plan'],
    [{ activityType: 'strength' }, {}, 'reported-time-missing'],
    [{ trainingSlot: null }, {}, 'slot-missing'],
    [{}, { workouts: [] }, 'no-plan'],
    [{}, { workouts: [workout({ target_groups: ['other'] })] }, 'group-mismatch'],
    [{}, { workouts: [workout({ time_of_day: 'morning' })] }, 'slot-mismatch'],
    [{}, { workouts: [workout(), workout({ id: 'w2', duration_minutes: 75 })] }, 'choice-required'],
    [{ workoutReference: 'workout:missing' }, {}, 'selection-unavailable'],
    [{ workoutReference: 'workout:w' }, { workouts: [workout({ workout_date: '2026-10-31' })] }, 'date-mismatch'],
    [{ workoutReference: 'plan:p' }, { workouts: [], plans: [{ id: 'p', activity_type: 'swim', plan_date: '2026-11-01', target_groups: ['junior'], calendar_link: { detachedWorkoutId: 'w' } }] }, 'detached-plan'],
    [{}, { workouts: [workout({ duration_minutes: null })] }, 'planned-time-missing'],
    [{}, { workouts: [workout({ duration_minutes: 1441 })] }, 'invalid-planned-time'],
  ]
  for (const [patch, options, reason] of cases) {
    const original = report(patch), snapshot = structuredClone(original)
    const [row] = enrich([original], options)
    assert.equal(row.timeIssue, reason)
    assert.equal(row.linkedEstimate, undefined)
    assert.equal(heart([row]).load.value, null)
    assert.deepEqual(original, snapshot)
    assert.ok(heart([row]).load.gaps[0].issues.includes(reason))
    assert.notEqual(trainingLoadIssueText(reason), trainingLoadIssueText('unknown'))
  }
})

test('valid linked and reported times are never diagnosed as missing; absent RPE is separate', () => {
  assert.deepEqual(heart(enrich([report()])).load.gaps, [])
  assert.deepEqual(heart(enrich([report({ activityMinutes: 85, plannedCompletion: 'partial' })])).load.gaps, [])
  const missingRpe = heart(enrich([report({ rpe: null })])).load
  assert.equal(missingRpe.missingTime, 0)
  assert.deepEqual(missingRpe.gaps[0].issues, ['rpe-missing'])
  assert.equal(missingRpe.value, null)
  assert.match(trainingLoadIssueText('rpe-missing'), /inte återskapas/)
})

test('reproduces the screenshot: all ten RPE answers exist but time covers only 2/4 and 2/6', () => {
  const dates = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-01', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
  const rows = dates.map((date, index) => report({ id: `${index}`, date, createdAt: `${date}T18:00:00Z`, activityType: [0, 1, 4, 5].includes(index) ? 'swim' : 'strength', activityMinutes: [0, 1, 4, 5].includes(index) ? 60 : null }))
  const result = heart(enrich(rows, { workouts: [] })).load
  assert.equal(result.rpeAnswers, 4)
  assert.equal(result.previous.rpeAnswers, 6)
  assert.equal(result.missingTime, 2)
  assert.equal(result.previous.missingTime, 4)
  assert.equal(result.gaps.length + result.previous.gaps.length, 6)
  assert.equal(trainingLoadCoverage(result).percent, 50)
  assert.equal(trainingLoadCoverage(result.previous).percent, 33)
  assert.equal(result.ring, 'unknown')
  assert.equal(result.ratio, null)
  assert.ok(result.gaps.every(gap => gap.issues.includes('reported-time-missing')))
})

test('diagnosis uses latest report only, excludes no/race/before, and never leaks identifiers or text', () => {
  const old = report({ createdAt: '2026-11-01T17:00:00Z', comment: 'PRIVATE', workoutReference: 'workout:SECRET' })
  const latest = report({ id: 'z', activityMinutes: 60 })
  assert.deepEqual(heart(enrich([latest, old])).load.gaps, [])
  for (const patch of [{ plannedCompletion: 'no' }, { competition: true }, { type: 'before' }]) assert.deepEqual(heart(enrich([report(patch)])).load.gaps, [])
  const load = heart(enrich([old, { ...latest, activityMinutes: null, plannedCompletion: 'partial', workoutReference: 'workout:missing' }])).load
  assert.equal(load.gaps.length, 1)
  assert.deepEqual(Object.keys(load.gaps[0]).sort(), ['activity', 'date', 'issues', 'slot'])
  assert.doesNotMatch(JSON.stringify(load), /PRIVATE|SECRET|workoutReference|profileId|createdAt/)
})

test('equal submission timestamps pick the same last ID in matcher and heart', () => {
  const raw = (id, workout_reference) => ({ id, workout_reference, activity_date: '2026-11-01', created_at: '2026-11-01T18:00:00Z', day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim' })
  for (const responses of [[raw('a', 'workout:w'), raw('z', 'workout:w2')], [raw('z', 'workout:w2'), raw('a', 'workout:w')]]) {
    const [pass] = buildSwimmerPasses({ sessions: [{ session_date: '2026-11-01', session_slot: 'afternoon_swim', activity_type: 'swim' }], responses, workouts: [workout(), workout({ id: 'w2', duration_minutes: 75 })], trainingGroup: 'junior' })
    assert.equal(pass.durationMinutes, 75)
    assert.equal(pass.matchReason, null)
  }
})

test('API diagnostics remain profile-isolated and require no extra queries for non-swim missing time', async () => {
  const calls = []
  const result = await loadSwimmerTraffic(asOf, async query => {
    calls.push(query)
    const rows = query.startsWith('profiles?') ? [{ id: 'p' }, { id: 'q' }] : query.startsWith('responses?') ? [{ id: 'a', profile_id: 'p', activity_date: '2026-11-01', day_type: 'after', activity_type: 'strength', rpe: 5, activity_minutes: null }] : []
    return { ok: true, json: async () => rows }
  })
  assert.equal(calls.length, 6)
  assert.deepEqual(result.profiles.find(row => row.profileId === 'p').heart.load.gaps[0].issues, ['reported-time-missing'])
  assert.deepEqual(result.profiles.find(row => row.profileId === 'q').heart.load.gaps, [])
})

test('coverage names each failed requirement; presentation cannot turn missing comparison into zero load', () => {
  const coverage = trainingLoadCoverage({ known: 1, total: 2, days: 1 })
  assert.equal(coverage.reasons.length, 3)
  assert.equal(trainingLoadCoverage({ known: 4, total: 5, days: 2 }).reasons.length, 0)
  assert.ok(trainingLoadCoverage({ known: 79, total: 99, days: 2 }).reasons.length > 0)
  assert.equal(trainingLoadCoverage({ known: 79, total: 99, days: 2 }).percent, 79)
  assert.equal(trainingLoadCoverage({ known: 0, total: 0, days: 0 }).percent, null)
  const view = readFileSync(new URL('../src/training-energy-details.jsx', import.meta.url), 'utf8')
  assert.match(view, /trainingLoadCoverage\(value\)/)
  assert.match(view, /Visa rapporter som saknar beräkningsunderlag/)
  assert.match(view, /trainingLoadIssueText/)
  assert.match(view, /heart.load.previous/)
})
