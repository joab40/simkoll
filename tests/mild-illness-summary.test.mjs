import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDayIllnessSummary, buildMildIllnessSummary } from '../shared/mild-illness-summary.js'
import { buildCoachControlPanel } from '../shared/coach-control-panel.js'

const profiles = [{ id: 'a', displayName: 'Anna' }, { id: 'b', displayName: 'Bo' }, { id: 'test', displayName: 'Test', isTestProfile: true }]
const answer = (profile_id, activity_date, status = 'mild', extra = {}) => ({ profile_id, activity_date, status, ...extra })

test('day cards count each scoped swimmer once and preserve independent training check-ins', () => {
  const date = '2026-11-23'
  const scoped = [...profiles, { id: 'c', displayName: 'Cecilia' }, { id: 'd', displayName: 'David' }]
  const responses = [
    { profileId: 'a', type: 'sick' }, { profileId: 'a', type: 'sick' },
    { profileId: 'b', type: 'after' }, { profileId: 'test', type: 'sick' },
  ]
  const records = [
    answer('a', date), answer('b', date), answer('c', date, 'sick'),
    answer('d', date, 'sick', { updated_at: '2026-11-23T07:00:00Z' }),
    answer('d', date, 'none', { updated_at: '2026-11-23T08:00:00Z' }),
    answer('d', '2026-11-22', 'sick'), answer('outside', date, 'sick'),
  ]
  const ids = rows => rows.map(row => row.id)
  const report = buildDayIllnessSummary(scoped, responses, records, date)
  assert.deepEqual(ids(report.sick), ['a', 'c'])
  assert.deepEqual(ids(report.mild), ['b'])
  assert.deepEqual(ids(buildDayIllnessSummary(scoped, responses, [], date).sick), ['a'])
  assert.deepEqual(buildDayIllnessSummary([], responses, records, date), { sick: [], mild: [] })
})

test('mild card counts unique swimmers/days in selected groups and dates, not number of checkins', () => {
  const report = buildMildIllnessSummary(profiles, [answer('a', '2026-11-03'), answer('a', '2026-11-03'), answer('a', '2026-11-04'), answer('b', '2026-11-04'), answer('outside', '2026-11-04'), answer('test', '2026-11-04'), answer('b', '2026-11-05'), answer('a', '2026-11-01')], '2026-11-02', '2026-11-04')
  assert.equal(report.count, 2); assert.equal(report.days, 3)
  assert.deepEqual(report.swimmers[0].dates, ['2026-11-03', '2026-11-04'])
  assert.equal(buildMildIllnessSummary([profiles[1]], [answer('a', '2026-11-04')], '2026-11-04', '2026-11-04').count, 0)
})
test('skipped, none and sick are not mild; later answers are shown without erasing historical mild days', () => {
  const report = buildMildIllnessSummary(profiles, [answer('a', '2026-11-02'), answer('a', '2026-11-04', 'none'), answer('b', '2026-11-04', 'sick'), answer('b', '2026-11-03', 'mild', { skipped: true })], '2026-11-02', '2026-11-04')
  assert.equal(report.count, 1); assert.equal(report.days, 1)
  assert.equal(report.swimmers[0].latestStatus, 'none'); assert.equal(report.swimmers[0].latestDate, '2026-11-04')
  const duplicate = buildMildIllnessSummary(profiles, [answer('a', '2026-11-04', 'none', { updated_at: '2026-11-04T18:00:00Z' }), answer('a', '2026-11-04', 'mild', { updated_at: '2026-11-04T17:00:00Z' })], '2026-11-04', '2026-11-04')
  assert.equal(duplicate.count, 0)
})
test('mild reports coexist with completed training and do not become sick days', () => {
  const report = buildCoachControlPanel(profiles, [{ profileId: 'a', activityDate: '2026-11-04', type: 'after', activityType: 'swim', rpe: 4, activityMinutes: 120 }], '2026-11-04', [], { periodStart: '2026-11-02', illnessRecords: [answer('a', '2026-11-04')] })
  assert.equal(report.completedPasses, 1); assert.equal(report.sickDays, 0); assert.equal(report.mildSwimmers, 1)
  assert.equal(report.mild.swimmers[0].profileId, 'a'); assert.equal(report.watchList.length, 1); assert.equal(report.followUps.length, 0)
})
test('actual Idag and Kontrollpanel pages both mount mild reports with scoped profiles/periods', () => {
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../src/coach-control-panel.jsx', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../src/coach-mild-illness.jsx', import.meta.url), 'utf8')
  assert.match(app, /<TodayWorkoutSummary [^\n]*date=\{summaryDate\} responses=\{selectedDateResponses\} profiles=\{groupFilteredProfiles\}/)
  const workout = app.slice(app.indexOf('function TodayWorkoutSummary('), app.indexOf('function CompetitionDaySummary('))
  assert.match(workout, /<div className="competition-day-groups">[\s\S]+<TodayIllnessCards code=\{code\} profiles=\{profiles\} dayResponses=\{responses\} date=\{date\}/)
  assert.equal((app.match(/<TodayIllnessCards/g) || []).length, 1)
  assert.match(card, /title="Rapporterad sjukdom"/)
  assert.match(card, /title="Lite känningar"/)
  assert.match(panel, /<CoachMildIllnessCard summary=\{report.mild\} trend=/)
  assert.equal((panel.match(/<CoachMildIllnessCard/g) || []).length, 1)
  assert.ok(panel.indexOf('Rapporterad sjukdom') < panel.indexOf('<CoachMildIllnessCard'))
  assert.ok(panel.indexOf('<CoachMildIllnessCard') < panel.indexOf('<small>Sömnkoll'))
  assert.match(panel, /trend=\{trend\('mild', 'simmare'/)
  assert.match(card, /illness=true&start=\$\{date\}&end=\$\{date\}/)
  assert.match(card, /startVisiblePolling/)
  assert.match(card, /loading \|\| error \? '–' : summary.count/)
  assert.match(card, /onOpenSwimmer\(profile.id\)/)
})
