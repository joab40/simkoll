import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { latestSwimmerComment } from '../src/swimmer-card-focus.js'

const day = '2026-11-14'
const row = (id, time, comment, patch = {}) => ({ id, createdAt: `${day}T${time}:00Z`, comment, ...patch })

test('card shows only the latest nonempty comment on the selected activity day, without mutating the responses', () => {
  const items = [row('first', '08:00', 'Tidigt svar'), row('latest', '12:00', '  Senaste\nhela kommentaren  '), row('empty', '15:00', '  ')]
  const original = structuredClone(items)
  assert.equal(latestSwimmerComment(items, day), 'Senaste\nhela kommentaren')
  assert.deepEqual(items, original)
  assert.equal(latestSwimmerComment([], day), '')
  assert.equal(latestSwimmerComment([row('empty', '08:00', null)], day), '')
})

test('old, future, invalid and late-entered comments never masquerade as today; Stockholm day boundary is respected', () => {
  assert.equal(latestSwimmerComment([
    row('late', '18:00', 'Igår, inlagt idag', { activityDate: '2026-11-13' }),
    row('old', '08:00', 'Igår', { createdAt: '2026-11-13T12:00:00Z' }),
    row('future', '08:00', 'Imorgon', { activityDate: '2026-11-15' }),
    row('invalid', '08:00', 'Ogiltig', { createdAt: 'bad' }),
  ], day), '')
  assert.equal(latestSwimmerComment([row('midnight', '23:30', 'Nästa dag i Sverige')], day), '')
  assert.equal(latestSwimmerComment([row('midnight', '23:30', 'Nästa dag i Sverige')], '2026-11-15'), 'Nästa dag i Sverige')
  assert.equal(latestSwimmerComment([row('corrected', '08:00', 'Rättad', { submittedAt: `${day}T19:00:00Z` }), row('other', '12:00', 'Tidigare')], day), 'Rättad')
})

test('illness precedes the single-line comment in the upper header; full comment is available when expanded', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const focus = readFileSync(new URL('../src/swimmer-card-focus.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/swimmer-card-focus.css', import.meta.url), 'utf8')
  assert.ok(focus.indexOf('className={`swimmer-card-focus-illness') < focus.indexOf('className="swimmer-card-focus-comment"'))
  assert.match(focus, /\['mild', 'sick'\]\.includes/)
  assert.doesNotMatch(focus, /dangerouslySetInnerHTML/)
  assert.match(css, /white-space: nowrap; text-overflow: ellipsis/)
  assert.match(css, /@container \(max-width: 430px\)/)
  assert.match(main, /<SwimmerCardFocus illness=\{currentIllness\} comment=\{todayComment\}/)
  assert.match(main, /todayItem\?\.type === 'sick' \? \{ status: 'sick'/)
  assert.doesNotMatch(main, /<p className="swimmer-illness-badge">/)
  const header = readFileSync(new URL('../src/swimmer-card-header.jsx', import.meta.url), 'utf8')
  assert.ok(header.indexOf('{focus}{speed}') < header.indexOf('className="swimmer-card-meta"'))
  assert.match(main, /<SwimmerTodayComment comment=\{todayComment\}/)
})

test('trainer-facing expanded card order prioritizes goals, weekly planning, direction and collapsed Formkollen', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const details = main.slice(main.indexOf('{isExpanded && <div className="swimmer-card-details">'), main.indexOf('function PeriodOverview'))
  const markers = ['swimmer-traffic-reasons', '<SwimmerTodayComment', '<SwimmerTrainingGoals', '<SwimmerCompactWeek', 'className="swimmer-trend-card"', '<FormKollenCard', '<SwimmerPeriodization', '<SwimmerAgreementCard', '<SwimmerDevelopmentGoalsCard', '<SwimmerStrengthProgramCard', '<SwimmerTrainingTimesCard', '<SleepHistory', '<IllnessHistory', '<SwimmerNotes', 'Profilinställningar']
  const positions = markers.map(marker => details.indexOf(marker))
  assert.ok(positions.every(index => index >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  for (const component of ['SwimmerTrainingGoals', 'SwimmerCompactWeek', 'FormKollenCard']) assert.equal((details.match(new RegExp(`<${component}\\b`, 'g')) || []).length, 1)
  const form = readFileSync(new URL('../src/form-kollen.jsx', import.meta.url), 'utf8')
  assert.match(form, /\[expanded, setExpanded\] = useState\(false\)/)
  assert.match(form, /expanded && <FormKollenContent/)
})
