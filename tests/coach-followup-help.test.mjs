import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coachFollowUpHelp } from '../shared/coach-followup-help.js'
import { buildCoachControlPanel, sleepFollowUpReasons } from '../shared/coach-control-panel.js'

test('general feeling and physical body have distinct question explanations but the same low threshold', () => {
  const feeling = coachFollowUpHelp('Låg känsla 2 dagar senaste veckan')
  const body = coachFollowUpHelp('Låg kroppskänsla 3 dagar senaste veckan')
  assert.match(feeling.description, /Hur känns det idag/)
  assert.match(feeling.description, /allmänna dagskänslan/)
  assert.match(body.description, /Hur känns kroppen/)
  assert.match(body.description, /Kraftlös = 1 och Seg = 2/)
  for (const help of [feeling, body]) {
    assert.match(help.description, /1–2 av 5/)
    assert.match(help.rule, /minst två olika aktivitetsdagar/)
    assert.match(help.rule, /inte antal svar eller ett medelvärde/)
    assert.match(help.rule, /Saknade svar räknas inte som låga/)
  }
  assert.equal(coachFollowUpHelp('Okänd signal'), null)
})

test('explanations match independent, distinct-day signals, not duplicates or missing data', () => {
  const profiles = [{ id: 'body', displayName: 'Body' }, { id: 'feeling', displayName: 'Feeling' }, { id: 'single', displayName: 'Single' }]
  const row = (profileId, activityDate, extra) => ({ profileId, activityDate, type: 'after', ...extra })
  const report = buildCoachControlPanel(profiles, [
    row('body', '2026-10-29', { body: 2, feeling: 4 }), row('body', '2026-10-30', { body: 1, feeling: 5 }),
    row('feeling', '2026-10-29', { body: 4, feeling: 1 }), row('feeling', '2026-10-30', { body: 5, feeling: 2 }),
    row('single', '2026-10-30', { body: 1, feeling: 1 }), row('single', '2026-10-30', { body: 1, feeling: 1 }),
    row('single', '2026-10-29', {}),
  ], '2026-10-31', [], { periodStart: '2026-10-26' })
  assert.equal(report.followUps.length, 2)
  assert.deepEqual(report.followUps.find((item) => item.profileId === 'body').reasons, ['Låg kroppskänsla 2 dagar senaste veckan'])
  assert.deepEqual(report.followUps.find((item) => item.profileId === 'feeling').reasons, ['Låg känsla 2 dagar senaste veckan'])
  assert.equal(report.signalStart, '2026-10-25')
  for (const swimmer of report.followUps) for (const reason of swimmer.reasons) assert.ok(coachFollowUpHelp(reason))
})

test('every current sleep signal and other follow-up reason has matching help', () => {
  const nights = (minutes) => minutes.map((value, index) => ({ activity_date: `2026-10-${25 + index}`, minutes: value, quality: 1 }))
  const reasons = [
    ...sleepFollowUpReasons(nights([400, 390, 380]), '2026-10-31'),
    ...sleepFollowUpReasons(nights([400, 390, 380, 410, 420]), '2026-10-31'),
    ...sleepFollowUpReasons(nights([300, 300, 500]), '2026-10-31'),
    'Sjukfrånvaro rapporterad 2 dagar senaste veckan', 'Hög ansträngning (RPE 8–10) 2 dagar senaste veckan',
  ]
  for (const reason of reasons) assert.ok(coachFollowUpHelp(reason), reason)
  assert.match(coachFollowUpHelp(reasons.find((reason) => reason.startsWith('Kort sovtid senaste'))).description, /behöver inte vara tre på varandra följande/)
  assert.match(coachFollowUpHelp(reasons.find((reason) => reason.startsWith('Kort sovtid 5'))).description, /En längre natt väger inte bort dem/)
  assert.match(coachFollowUpHelp('Hög ansträngning (RPE 8–10) 2 dagar senaste veckan').rule, /inte som höga/)
})

test('follow-up help is accessible by hover, focus and tap without data requests', () => {
  const source = readFileSync(new URL('../src/coach-followup-reason.jsx', import.meta.url), 'utf8')
  for (const token of ['onPointerEnter', 'onPointerLeave', 'onFocus', 'onBlur', 'onClick', 'Escape', 'pointerdown', 'aria-expanded', 'aria-controls', 'hidden={!open}']) assert.ok(source.includes(token), token)
  assert.doesNotMatch(source, /fetch\(|apiRequest/)
  const panel = readFileSync(new URL('../src/coach-control-panel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /<CoachFollowUpReason/)
  assert.match(panel, /periodLabel=\{`\$\{dayLabel\(report.signalStart\)/)
})
