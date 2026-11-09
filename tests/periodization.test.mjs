import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPeriodization, periodizationRange, isoWeek } from '../shared/periodization.js'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { loadPeriodization } from '../server/periodization.js'

const today = '2026-11-09'
const entry = (date, extra = {}) => ({ date, type: 'swim', state: 'completed', reportedMeters: null, estimatedMeters: null, rpe: null, ...extra })
test('makro uses 12 ISO calendar weeks, meso exactly 28 rolling days across DST/year boundaries', () => {
  for (const day of ['2026-11-09', '2026-11-15', '2026-01-01', '2026-03-30', '2026-10-26']) {
    const data = buildPeriodization([], day)
    assert.equal(data.macro.length, 12); assert.equal(data.meso.length, 28)
    assert.equal(data.meso.at(-1).end, day)
    assert.equal(data.macro.at(-1).end, day)
    assert.equal(new Date(`${data.range.start}T12:00Z`).getUTCDay(), 1)
    assert.ok(data.macro.every(row => row.meters === 0 && row.rpe === null))
  }
  assert.deepEqual(isoWeek('2025-12-29'), { year: 2026, week: 1 })
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 })
  assert.equal(buildPeriodization([], today).macro.at(-1).ongoing, true)
  assert.equal(buildPeriodization([], '2026-11-15').macro.at(-1).ongoing, false)
  assert.throws(() => periodizationRange('2026-02-30'))
})
test('RPE averages swims per day then days per week, excludes other sports, plans, missing and invalid RPE', () => {
  const data = buildPeriodization([
    entry('2026-11-02', { reportedMeters: 3000, rpe: 2 }), entry('2026-11-02', { reportedMeters: 4000, rpe: 4 }),
    entry('2026-11-03', { estimatedMeters: 5000, rpe: 9 }), entry('2026-11-04', { reportedMeters: 2000 }),
    entry('2026-11-05', { type: 'strength', rpe: 10 }), entry('2026-11-05', { type: 'competition', rpe: 10 }),
    entry('2026-11-05', { state: 'planned', reportedMeters: 9000, rpe: 10 }),
    entry('2026-11-06', { reportedMeters: 0, rpe: 0 }), entry('2026-11-07', { reportedMeters: 0, rpe: 11 }),
  ], today)
  const week = data.macro.at(-2)
  assert.equal(week.meters, 14000); assert.equal(week.rpe, 6)
  assert.equal(week.estimated, true); assert.equal(week.rpeDays, 2); assert.equal(week.rpeReports, 3)
  assert.equal(data.meso.find(row => row.start === '2026-11-02').rpe, 3)
  assert.equal(data.meso.find(row => row.start === '2026-11-04').rpe, null)
})
test('reported zero wins, unknown completed distances stay unknown, no registered swim is zero', () => {
  const data = buildPeriodization([entry('2026-11-02', { reportedMeters: 0, estimatedMeters: 5000 }), entry('2026-11-03'), entry('2026-11-04', { reportedMeters: 2000 })], today)
  assert.equal(data.meso.find(row => row.start === '2026-11-02').meters, 0)
  assert.equal(data.meso.find(row => row.start === '2026-11-03').meters, null)
  assert.equal(data.meso.find(row => row.start === '2026-11-05').meters, 0)
  assert.equal(data.macro.at(-2).meters, null)
  assert.equal(data.macro.at(-2).knownMeters, 2000)
  assert.equal(data.macro.at(-2).unknownDays, 1)
  assert.equal(buildPeriodization([entry('2026-11-02', { reportedMeters: -500 })], today).macro.at(-2).knownMeters, 0)
})
test('diary matcher keeps latest feedback, attendance deduplication and selected alternative instead of summing options', () => {
  const day = '2026-11-02'
  const base = { activity_date: day, day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim', workout_reference: 'workout:b' }
  const entries = buildDiaryEntries({ today, trainingGroup: 'junior', sessions: [0, 1].map(id => ({ id, session_date: day, session_slot: 'afternoon_swim', activity_type: 'swim', source: 'coach-attendance' })), responses: [
    { ...base, id: 'old', created_at: `${day}T18:00:00Z`, rpe: 3 },
    { ...base, id: 'new', created_at: `${day}T19:00:00Z`, rpe: 7 },
  ], workouts: ['a', 'b'].map((id, index) => ({ id, workout_date: day, title: id, time_of_day: 'afternoon', target_groups: ['junior'], distance_meters: 3000 + index * 1000 })) })
  const week = buildPeriodization(entries, today).macro.at(-2)
  assert.equal(week.meters, 4000); assert.equal(week.rpe, 7); assert.equal(week.swims, 1); assert.equal(week.rpeReports, 1)
  const noChoice = buildDiaryEntries({ today, trainingGroup: 'junior', sessions: [{ session_date: day, session_slot: 'afternoon_swim', activity_type: 'swim' }], responses: [], workouts: ['a', 'b'].map(id => ({ id, workout_date: day, time_of_day: 'afternoon', distance_meters: 4000 })) })
  assert.equal(buildPeriodization(noChoice, today).macro.at(-2).meters, null)
})
test('loader scopes private sources, paginates, reads only aggregates and fails closed on unavailable sources', async () => {
  const profile = { id: 'fixture', training_group: 'junior' }, seen = []
  const read = async query => { seen.push(query); return { ok: true, json: async () => [] } }
  const data = await loadPeriodization(profile, today, read)
  assert.equal(data.profileId, profile.id); assert.equal(data.macro.length, 12)
  assert.equal(seen.length, 5)
  for (const query of seen) {
    assert.match(query, /limit=500&offset=0/); assert.match(query, /order=/)
    if (!/^(daily_workouts|training_plans)/.test(query)) assert.match(query, /profile_id=eq.fixture/)
    assert.doesNotMatch(query, /comment|content|note|reflection|\*|point|goal|result/)
  }
  assert.ok(!Object.hasOwn(data, 'entries'))
  await assert.rejects(loadPeriodization(profile, today, async () => ({ ok: false })), /Hela periodiseringsunderlaget/)
  await assert.rejects(loadPeriodization(profile, today, async () => ({ ok: true, json: async () => Array(500).fill({}) })), /Hela periodiseringsunderlaget/)
})
test('integration replaces only the coach swimmer point card and loads history lazily', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../src/swimmer-periodization.jsx', import.meta.url), 'utf8')
  assert.match(main, /<SwimmerPeriodization key=\{`periodization-\$\{profile.id\}`\}/)
  assert.doesNotMatch(main, /<PointProgress info=\{profilePoints\[profile.id\]\} compact/)
  assert.match(main, /<RewardCard key="level"/)
  assert.match(ui, /if \(!open\) return/); assert.match(ui, /useState\('macro'\)/)
  assert.match(ui, /if \(active\) setResult/); assert.match(ui, /profileId !== profile.id/)
  assert.match(ui, /<PeriodizationChart key=\{mode\}/, 'switching from a selected late meso day must reset selection and scroll before macro renders')
  assert.match(ui, /Saknad RPE är en lucka, aldrig noll/)
})
