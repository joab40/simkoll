import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDiaryEntries, summarizeDiary, summarizeDiaryConnections, diaryRange } from '../shared/training-diary.js'

const day = '2026-10-14'
const session = (slot = 'morning_swim', extra = {}) => ({ id: slot, activity_type: 'swim', session_date: day, session_slot: slot, source: 'checkin', ...extra })
const answer = (extra = {}) => ({ id: 'answer', activity_date: day, created_at: '2026-10-15T08:00:00Z', day_type: 'after', activity_type: 'swim', session_slot: 'morning_swim', feeling: 4, rpe: 6, ...extra })
const workout = (extra = {}) => ({ id: 'workout', workout_date: day, time_of_day: 'morning', target_groups: ['junior'], title: 'Teknik', content: '100 m ryggsim', note: 'Tekniktips', distance_meters: 4500, duration_minutes: 90, ...extra })
const build = (extra = {}) => buildDiaryEntries({ sessions: [session()], responses: [answer()], workouts: [workout()], trainingGroup: 'junior', today: '2026-10-18', ...extra })

test('weekly connections keep unknown values, competition and other activities distinct', () => {
  const rows = [
    { date: '2026-10-12', sessions: 1, competition: false, swimMeters: 2500, estimatedSwimMeters: null, rpe: 7, speedFeeling: 3 },
    { date: '2026-10-13', sessions: 1, competition: false, swimMeters: null, estimatedSwimMeters: 3000, rpe: null, speedFeeling: null },
    { date: '2026-10-14', sessions: 0, competition: true, completedCompetition: true, swimMeters: null, estimatedSwimMeters: null, rpe: null, speedFeeling: null },
    { date: '2026-10-15', sessions: 0, competition: false, swimMeters: null, estimatedSwimMeters: null, rpe: null, speedFeeling: null },
  ]
  const [week] = summarizeDiaryConnections(rows)
  assert.equal(week.sessions, 2)
  assert.equal(week.activeDays, 2)
  assert.equal(week.competitionDays, 1)
  assert.equal(week.plannedCompetitionDays, 0)
  assert.equal(week.swimMeters, 2500)
  assert.equal(week.estimatedSwimMeters, 3000)
  assert.equal(week.rpe, 7)
  assert.equal(week.rpeDays, 1)
  assert.equal(week.speedFeeling, 3)
  assert.equal(week.calendarDays, 4)
  assert.equal(summarizeDiaryConnections(rows.slice(2))[0].swimMeters, null)
})

test('race comparison needs an earlier day with the same event and pool', () => {
  const days = ['2026-10-12', '2026-10-13', '2026-10-14'].map((date) => ({ date, sessions: 0, competition: true, swimMeters: null, estimatedSwimMeters: null, rpe: null, speedFeeling: null }))
  const results = [
    { date: '2026-10-10', event: '100 frisim', pool: '25 m', resultTime: 6000 },
    { date: '2026-10-12', event: '100 frisim', pool: '50 m', resultTime: 6100 },
    { date: '2026-10-12', event: '100 frisim', pool: '25 m', resultTime: 5900 },
    { date: '2026-10-12', event: '100 frisim', pool: '25 m', resultTime: 5800 },
    { date: '2026-10-13', event: '100 frisim', pool: '25 m', resultTime: 5750 },
  ]
  const [week] = summarizeDiaryConnections(days, results)
  assert.deepEqual(week.results.map((result) => result.fasterBy), [null, 100, 200, 50])
})

test('late and repeated check-ins stay on the activity day without duplicating a session', () => {
  const entries = build({ responses: [answer({ id: 'older', activity_distance_meters: 4200, comment: 'Bra grepp' }), answer({ activity_distance_meters: 4300, activity_minutes: 85, comment: 'Ny reflektion' })] })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].date, day)
  assert.equal(entries[0].reportedMeters, 4300)
  assert.equal(entries[0].estimatedMeters, null)
  assert.equal(entries[0].plannedMeters, 4500)
  assert.equal(entries[0].comments.length, 2)
  const summary = summarizeDiary(entries, [answer()], day, day)
  assert.equal(summary.sessions, 1)
  assert.equal(summary.swimMeters, 4300)
  assert.equal(summary.minutes, 85)
})
test('AM and PM use their own group-targeted workout and feedback', () => {
  const entries = build({ sessions: [session(), session('afternoon_swim')], responses: [answer(), answer({ id: 'pm', session_slot: 'afternoon_swim', rpe: 9 })], workouts: [workout(), workout({ id: 'pm', time_of_day: 'afternoon', distance_meters: 3000 }), workout({ id: 'other-group', target_groups: ['other'], distance_meters: 9000 })] })
  assert.equal(entries.length, 2)
  assert.equal(entries.find((entry) => entry.slot === 'morning_swim').rpe, 6)
  assert.equal(entries.find((entry) => entry.slot === 'afternoon_swim').rpe, 9)
  assert.equal(entries.find((entry) => entry.slot === 'afternoon_swim').estimatedMeters, 3000)
})
test('ambiguous legacy feedback is visible without becoming a third completed session', () => {
  const entries = build({ sessions: [session(), session('afternoon_swim')], responses: [answer({ activity_type: null, session_slot: null })] })
  assert.equal(entries.filter((entry) => entry.state === 'feedback').length, 1)
  const summary = summarizeDiary(entries, [answer()], day, day)
  assert.equal(summary.sessions, 2)
  assert.equal(summary.rpe, 6)
})
test('competition backfills are not swimming and cycling kilometres are not swim metres', () => {
  const entries = build({ sessions: [session('afternoon_swim')], responses: [answer({ competition: true, activity_type: null, session_slot: null })] })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'competition')
  assert.equal(summarizeDiary(entries, [], day, day).sessions, 0)
  const cycling = build({ sessions: [session('afternoon_swim'), session('cycling', { activity_type: 'cycling' })], responses: [answer({ activity_type: 'cycling', session_slot: null, activity_distance_meters: 7000, activity_minutes: 25 })] })
  const summary = summarizeDiary(cycling, [], day, day)
  assert.equal(summary.sessions, 1)
  assert.equal(summary.swimMeters, null)
  assert.equal(summary.minutes, 25)
})
test('partial, missing and ambiguous volumes are not fabricated as complete or zero', () => {
  assert.equal(build({ responses: [answer({ planned_completion: 'partial' })] })[0].estimatedMeters, null)
  assert.equal(build({ workouts: [workout(), workout({ id: 'ambiguous' })] })[0].plannedMeters, null)
  assert.equal(build()[0].estimatedMeters, 4500)
  const empty = summarizeDiary([], [], day, '2026-10-15')
  assert.equal(empty.swimMeters, null)
  assert.equal(empty.days[0].rpe, null)
})
test('untyped legacy distance and comments cannot establish swimming as the activity', () => {
  const responses = [answer({ activity_type: null, session_slot: null, activity_distance_meters: 7000, comment: 'Cyklade hem' })]
  const entries = build({ responses })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'unknown')
  const summary = summarizeDiary(entries, responses, day, day)
  assert.equal(summary.sessions, 1)
  assert.equal(summary.swimMeters, null)
  assert.equal(summary.estimatedSwimMeters, null)
})
test('competition intentions stay unconfirmed; strength logs merge with registered strength', () => {
  const entries = build({ sessions: [session('strength', { activity_type: 'strength', source: 'program' })], responses: [answer({ competition: true, day_type: 'before', activity_type: null, session_slot: null })], strengthLogs: [{ session_date: day, assignment_id: 'assigned', pass_number: 1, weights: { Knäböj: '20 kg' } }], personalPlans: [{ planned_date: day, session_slot: 'afternoon_swim' }] })
  const summary = summarizeDiary(entries, [], day, day)
  assert.equal(summary.sessions, 1)
  assert.equal(summary.competitionDays, 0)
  assert.equal(summary.plannedCompetitionDays, 1)
  assert.equal(summarizeDiaryConnections(summary.days)[0].competitionDays, 0)
  assert.equal(summarizeDiaryConnections(summary.days)[0].plannedCompetitionDays, 1)
  assert.equal(entries.find((entry) => entry.type === 'strength').strengthLogs.length, 1)
})
test('today content stays locked and saved notes survive changed pass linkage', () => {
  const locked = build({ today: day })[0]
  assert.equal(locked.content, '')
  assert.equal(locked.note, '')
  assert.equal(locked.contentLocked, true)
  assert.equal(build({ today: day, unlockedToday: true })[0].content, '100 m ryggsim')
  const entries = build({ reflections: [{ entry_key: `${day}:unknown:unassigned`, activity_date: day, what_worked: 'Bra kontroll', next_time: 'Fortsätt', updated_at: day }] })
  assert.equal(entries.find((entry) => entry.type === 'reflection').reflection.whatWorked, 'Bra kontroll')
  assert.equal(summarizeDiary(entries, [], day, day).sessions, 1)
})
test('equal-length periods survive DST; invalid, future and excessive ranges are rejected', () => {
  const period = diaryRange('2026-10-01', '2026-10-31', '2026-11-01')
  assert.equal(period.days, 31)
  assert.equal(period.previousStart, '2026-08-31')
  assert.equal(period.previousEnd, '2026-09-30')
  for (const range of [['2026-02-30', '2026-03-01'], ['2026-10-01', '2026-12-01'], ['2024-01-01', '2026-01-01']]) assert.throws(() => diaryRange(...range, '2026-11-01'))
})
