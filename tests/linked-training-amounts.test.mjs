import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { trainingLoad, diaryEntryLoad } from '../shared/training-load.js'
import { trainingHeartLoadSummary } from '../shared/training-heart-load.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'

const asOf = '2026-11-01', id = '00000000-0000-4000-8000-000000000001'
const report = (extra = {}) => ({ id: 'answer', profileId: 'a', date: asOf, createdAt: `${asOf}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', plannedCompletion: 'full', workoutReference: `workout:${id}`, activityMinutes: null, rpe: 10, ...extra })
const workout = (extra = {}) => ({ id, workout_date: asOf, duration_minutes: 110, distance_meters: 5000, time_of_day: 'afternoon', target_groups: ['junior'], ...extra })
const recover = (responses, extra = {}) => withLinkedTrainingAmounts(responses, { workouts: [workout()], trainingGroup: 'junior', asOf, ...extra })
const raw = row => ({ id: row.id, activity_date: row.date, created_at: row.createdAt, day_type: row.type, activity_type: row.activityType, session_slot: row.trainingSlot, planned_completion: row.plannedCompletion, workout_reference: row.workoutReference, activity_minutes: row.activityMinutes, rpe: row.rpe })

test('RPE 10 and a linked 110-minute pass yield the same estimated 1100 in heart and diary, without changing the answer', () => {
  const original = report(), before = structuredClone(original)
  const enriched = recover([original])
  assert.deepEqual(original, before)
  assert.equal(enriched[0].activityMinutes, null)
  assert.deepEqual(enriched[0].linkedEstimate, { source: 'linked-plan', minutes: 110 })
  const heart = buildTrainingHeart({ responses: enriched }, asOf)
  assert.equal(heart.load.value, 1100)
  assert.equal(heart.load.reportedValue, null)
  assert.equal(heart.load.estimatedValue, 1100)
  assert.equal(heart.load.estimated, 1)
  assert.equal(heart.load.reported, 0)
  const [entry] = buildDiaryEntries({ responses: [raw(original)], workouts: [workout()], trainingGroup: 'junior', today: asOf })
  assert.equal(entry.reportedMinutes, null)
  assert.equal(entry.estimatedMinutes, 110)
  assert.equal(entry.estimatedMeters, 5000)
  assert.deepEqual(diaryEntryLoad(entry), trainingLoad(10, null, 110))
  assert.equal(diaryEntryLoad(entry).value, heart.load.value)
})

test('reported time always wins, even for partial work; invalid explicit time is not overwritten', () => {
  for (const activityMinutes of [85, 0, -1, '90', NaN]) {
    const [row] = recover([report({ activityMinutes, plannedCompletion: 'partial' })])
    assert.equal(row.linkedEstimate, undefined)
    const load = buildTrainingHeart({ responses: [row] }, asOf).load
    assert.equal(load.value, activityMinutes === 85 ? 850 : null)
    assert.equal(load.estimated, 0)
  }
})

test('not done, before, competition, untyped, unknown-slot and gym reports never gain full planned minutes', () => {
  for (const patch of [{ plannedCompletion: 'no' }, { type: 'before' }, { competition: true }, { activityType: null }, { trainingSlot: null }, { activityType: 'strength' }, { activityType: 'other' }]) {
    const [row] = recover([report(patch)])
    assert.equal(row.linkedEstimate, undefined, JSON.stringify(patch))
    assert.equal(buildTrainingHeart({ responses: [row] }, asOf).load.value, null)
  }
  assert.equal(diaryEntryLoad({ state: 'completed', type: 'swim', linked: true, partial: true, rpe: 10, reportedMinutes: null, estimatedMinutes: 110 }).value, 1100)
  assert.equal(diaryEntryLoad({ state: 'completed', type: 'competition', rpe: 10, reportedMinutes: 110 }).value, null)
})

test('a legacy full-after answer can recover an unambiguous slot; missing RPE stays missing', () => {
  const [row] = recover([report({ workoutReference: null, plannedCompletion: null, rpe: null })])
  assert.equal(row.linkedEstimate.minutes, 110)
  const load = buildTrainingHeart({ responses: [row] }, asOf).load
  assert.equal(load.value, null)
  assert.equal(load.missingRpe, 1)
  assert.equal(load.missingTime, 0)
  assert.equal(load.rpeAnswers, 0)
})

test('date, group, slot, missing source and invalid duration cannot fall back to an unrelated workout', () => {
  for (const patch of [{ workout_date: '2026-10-31' }, { target_groups: ['other'] }, { time_of_day: 'morning' }, { id: 'removed' }, { duration_minutes: null }, { duration_minutes: 0 }, { duration_minutes: 1441 }]) {
    assert.equal(recover([report()], { workouts: [workout(patch)] })[0].linkedEstimate, undefined, JSON.stringify(patch))
  }
})

test('alternatives require the actual selection and are never added together; manual plans also work', () => {
  const alternatives = [workout(), workout({ id: 'alternative', duration_minutes: 90 })]
  assert.equal(recover([report({ workoutReference: null })], { workouts: alternatives })[0].linkedEstimate, undefined)
  assert.equal(recover([report()], { workouts: alternatives })[0].linkedEstimate.minutes, 110)
  const plans = [{ id: 'manual', plan_date: asOf, activity_type: 'swim', time_of_day: 'afternoon', target_groups: ['junior'], duration_minutes: 75 }]
  assert.equal(recover([report({ workoutReference: 'plan:manual' })], { workouts: [], plans })[0].linkedEstimate.minutes, 75)
  assert.equal(recover([report({ workoutReference: 'plan:manual' })], { workouts: [], plans: [{ ...plans[0], calendar_link: { detachedWorkoutId: 'detached' } }] })[0].linkedEstimate, undefined)
})

test('latest report alone is recovered; later partial uses its own choice, not an older full answer', () => {
  const old = report({ id: 'a', createdAt: `${asOf}T10:00:00Z` }), latest = report({ id: 'z' })
  const rows = recover([latest, old])
  assert.equal(rows[0].linkedEstimate.minutes, 110)
  assert.equal(rows[1].linkedEstimate, undefined)
  assert.equal(buildTrainingHeart({ responses: rows }, asOf).load.value, 1100)
  assert.equal(buildTrainingHeart({ responses: recover([old, { ...latest, plannedCompletion: 'no' }]) }, asOf).load.value, null)
  assert.equal(buildTrainingHeart({ responses: recover([old, { ...latest, plannedCompletion: 'partial' }]) }, asOf).load.value, 1100)
  assert.equal(buildTrainingHeart({ responses: recover([old, { ...latest, plannedCompletion: 'partial', workoutReference: 'workout:missing' }]) }, asOf).load.value, null)
})

test('reported and estimated totals stay separate; comparisons are visibly estimated if either period includes planned time', () => {
  const dates = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-30', '2026-10-31', asOf]
  const responses = dates.map((date, index) => report({ id: `${index}`, date, createdAt: `${date}T18:00:00Z`, workoutReference: `workout:workout-${index}`, activityMinutes: index < 3 ? null : 55 }))
  const workouts = dates.map((date, index) => workout({ id: `workout-${index}`, workout_date: date }))
  const heart = buildTrainingHeart({ responses: recover(responses, { workouts }) }, asOf)
  assert.equal(heart.load.value, 1650)
  assert.equal(heart.load.reportedValue, 1650)
  assert.equal(heart.load.estimatedValue, null)
  assert.equal(heart.load.previous.estimatedValue, 3300)
  assert.equal(heart.load.ratio, .5)
  const label = trainingHeartLoadSummary(heart.load)
  assert.equal(label.shortLabel, '≈ Belastning')
  assert.equal(label.label, 'Uppskattad belastning ↓ 50 %')
  assert.match(label.description, /inte bekräftad faktisk/)
})

test('loader fetches two bounded projected sources once for the roster, keeps profile/group estimates isolated and writes nothing', async () => {
  const calls = []
  const read = async (query, options) => {
    calls.push(query); assert.equal(options, undefined)
    assert.doesNotMatch(query, /comment|reflection|notes|\*|content/)
    let rows = []
    if (query.startsWith('profiles?')) rows = [{ id: 'a', training_group: 'junior' }, { id: 'b', training_group: 'other' }]
    if (query.startsWith('responses?')) rows = ['a', 'b'].map(profile_id => ({ ...raw(report()), profile_id }))
    if (query.startsWith('daily_workouts?')) rows = [workout()]
    if (!query.startsWith('profiles?')) { assert.match(query, query.startsWith('responses?') ? /gte.2026-10-12/ : /gte.2026-10-19/); assert.match(query, /lte.2026-11-01/) }
    return { ok: true, json: async () => rows }
  }
  const loaded = await loadSwimmerTraffic(asOf, read)
  assert.equal(calls.length, 8)
  assert.equal(loaded.profiles.find(row => row.profileId === 'a').heart.load.estimatedValue, 1100)
  assert.equal(loaded.profiles.find(row => row.profileId === 'b').heart.load.value, null)
  assert.doesNotMatch(JSON.stringify(loaded), /workout_reference|training_group|linkedEstimate|activity_minutes/)
})

test('an unavailable or truncated planning source fails clearly rather than returning partial estimated load', async () => {
  for (const failed of ['daily_workouts?', 'training_plans?']) await assert.rejects(loadSwimmerTraffic(asOf, async query => ({
    ok: !query.startsWith(failed),
    json: async () => query.startsWith('profiles?') ? [{ id: 'a', training_group: 'junior' }] : query.startsWith('responses?') ? [{ ...raw(report()), profile_id: 'a' }] : [],
  })), /fullständigt/)
  await assert.rejects(loadSwimmerTraffic(asOf, async query => ({ ok: true, json: async () => query.startsWith('profiles?') ? [{ id: 'a', training_group: 'junior' }] : query.startsWith('responses?') ? [{ ...raw(report()), profile_id: 'a' }] : query.startsWith('daily_workouts?') ? Array(500).fill(workout()) : [] })), /fullständigt/)
})

test('diary and heart explain estimates without relabelling them as reported time or performing writes', () => {
  const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  assert.match(source('src/training-diary.jsx'), /Uppskattad belastning/)
  assert.match(source('src/training-diary.jsx'), /Uppskattad från kopplat pass/)
  assert.match(source('src/training-heart.jsx'), /missingRpe/)
  assert.match(source('src/training-heart.jsx'), /heartLoadSources\(heart.load\)/)
  assert.match(source('shared/training-heart-display.js'), /estimatedValue/)
  assert.doesNotMatch(source('shared/linked-training-amounts.js') + source('server/swimmer-traffic.js'), /method: 'POST'|method: 'PATCH'|method: 'DELETE'/)
})
