import assert from 'node:assert/strict'
import { checkinTraining, validCheckinActivity } from '../shared/checkin-activity.js'
import { checkinStatus } from '../src/checkin-status.js'
import { attendanceFromCheckins } from '../src/attendance.js'
import { individualSignals, analysisResponse, buildSwimmerPasses } from '../server/individual-analysis.js'

const cycling = { type: 'after', activityType: 'cycling', registerTraining: true, activityMinutes: 30, activityDistanceMeters: 8000, comment: 'Cykling 8 km' }
assert.deepEqual(checkinTraining(cycling), { activity_type: 'cycling', session_slot: 'cycling' })
assert.equal(checkinTraining({ ...cycling, registerTraining: false }), null)
assert.equal(checkinTraining({ type: 'rest' }), null)
assert.equal(checkinTraining({ type: 'after', registerTraining: false }), null)
assert.equal(checkinTraining({ type: 'after', comment: 'Cykling' }).activity_type, 'swim') // never guess historical free text
assert.equal(checkinTraining({ type: 'after', activityType: 'strength' }).activity_type, 'strength')
assert.equal(validCheckinActivity(cycling), true)
assert.equal(validCheckinActivity({ activityType: 'swim', plannedCompletion: 'partial' }), true)
for (const fields of [{ activityType: 'invalid' }, { activityMinutes: -1 }, { activityDistanceMeters: '8' }, { activityMinutes: Infinity }]) assert.equal(validCheckinActivity(fields), false)
assert.equal(checkinStatus(cycling), 'har cyklat')
assert.equal(attendanceFromCheckins([], [{ ...cycling, profileId: 'one', createdAt: '2026-10-10T16:00:00Z' }]).one, false)
const response = { day_type: 'after', activity_date: '2026-10-10', created_at: '2026-10-10T16:00:00Z', activity_type: 'cycling', activity_minutes: 30, activity_distance_meters: 8000, comment: 'Cykling 8 km', rpe: 4, feeling: 4 }
const dto = analysisResponse(response)
assert.equal(dto.activityType, 'cycling'); assert.equal(dto.activityDistanceMeters, 8000)
const signals = individualSignals({ responses: [dto], workouts: [] })
assert.equal(signals.volume.distanceMeters, null)
assert.equal(signals.trend[0].activities[0].distanceMeters, 8000)
assert(signals.evidence[0].text.includes('cycling'))
const mixed = individualSignals({ responses: [dto, { ...dto, activityType: 'swim', rpe: 8 }], workouts: [] })
assert.equal(mixed.trend[0].mixedActivities, true)
assert.equal(mixed.trend[0].rpe, null)
assert.equal(mixed.trend[0].feeling, 4)
const passes = buildSwimmerPasses({ responses: [response], sessions: [{ activity_type: 'cycling', session_date: '2026-10-10', session_slot: 'cycling' }], workouts: [{ workout_date: '2026-10-10', distance_meters: 4500, duration_minutes: 120 }], trainingGroup: 'junior' })
assert.equal(passes.length, 0)
console.log('PASS activities: typed registration, opt-out, validation, cycling not swim/attendance, annotations, no comment guessing and mixed feedback isolation')
