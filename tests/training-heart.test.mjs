import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { buildSwimmerTraffic } from '../shared/swimmer-traffic.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { loadSwimmerTraffic } from '../server/swimmer-traffic.js'

const asOf = '2026-11-01'
const response = (offset, extra = {}) => ({ id: `${offset}`, date: coachWeekAddDays(asOf, offset), createdAt: `${coachWeekAddDays(asOf, offset)}T12:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: 4, feeling: 4, speedFeeling: 4, rpe: 5, activityMinutes: 60, ...extra })
const heart = (responses = [], sleep = []) => buildTrainingHeart({ responses, sleep }, asOf)
const sixReports = [0, -1, -2, -7, -8, -9].map(offset => response(offset))

test('heart does not invent scores for empty, single-day, stale or invalid feelings', () => {
  assert.equal(heart().color, 'unknown')
  assert.equal(heart([response(0)]).color, 'unknown')
  assert.equal(heart([response(0), response(0, { id: 'twice' })]).color, 'unknown')
  assert.equal(heart([response(-3), response(-4)]).color, 'unknown')
  for (const value of [null, undefined, '', 0, '5', 9, NaN]) assert.equal(heart([response(0, { body: value }), response(-1, { body: value })]).color, 'unknown')
  assert.equal(heart([response(0), response(1)]).color, 'unknown')
  assert.throws(() => buildTrainingHeart({}, '2026-02-30'), /Ogiltigt/)
})

test('colour uses daily means of body/feeling, not the number of checkins, speed or RPE', () => {
  const rows = [response(0), response(-1)]
  assert.equal(heart(rows).color, 'green')
  assert.equal(heart(rows.map(row => ({ ...row, body: 3 }))).color, 'yellow')
  assert.equal(heart(rows.map(row => ({ ...row, feeling: 2 }))).color, 'yellow')
  assert.equal(heart(rows.map(row => ({ ...row, body: 5, feeling: 5, rpe: 10, speedFeeling: 1 }))).color, 'green')
  const weighted = heart([response(0, { body: 1 }), ...Array.from({ length: 10 }, (_, i) => response(-1, { id: `many${i}`, body: 5 }))])
  assert.equal(weighted.body.value, 3)
  assert.equal(weighted.color, 'yellow')
  assert.equal(heart(rows.map(row => ({ ...row, body: 3.5, feeling: 3.5 }))).color, 'green')
})

test('ring compares explicit reported load only with covered previous periods', () => {
  const result = heart(sixReports)
  assert.equal(result.load.value, 900)
  assert.equal(result.load.previous.value, 900)
  assert.equal(result.load.ring, 'similar')
  assert.equal(result.load.ratio, 1)
  assert.equal(heart(sixReports.map(row => ({ ...row, activityMinutes: row.date >= '2026-10-26' ? 90 : 60 }))).load.ring, 'higher')
  assert.equal(heart(sixReports.map(row => ({ ...row, activityMinutes: row.date >= '2026-10-26' ? 30 : 60 }))).load.ring, 'lower')
  assert.equal(heart(sixReports.slice(0, 3)).load.ring, 'unknown')
  assert.equal(heart(sixReports.map(row => ({ ...row, activityMinutes: null, estimatedMinutes: 120 }))).load.value, null)
  assert.equal(heart([...sixReports, response(-3, { activityMinutes: null }), response(-4, { rpe: null })]).load.ring, 'unknown')
  assert.equal(heart([...sixReports, response(-3, { activityType: null }), response(-4, { activityType: null })]).load.ring, 'unknown')
  const roundedBoundary = heart([response(0, { rpe: 5, activityMinutes: 533 }), response(-1, { rpe: 2, activityMinutes: 1333 }), response(-2, { rpe: 2, activityMinutes: 1333 }), response(-7, { rpe: 5, activityMinutes: 666 }), response(-8, { rpe: 5, activityMinutes: 666 }), response(-9, { rpe: 5, activityMinutes: 668 })])
  assert.equal(roundedBoundary.load.ratio, .8)
  assert.equal(roundedBoundary.load.ring, 'similar')
})

test('load counts latest report group without summing alternative reports; distinct slots and activities remain separate', () => {
  const old = response(0, { createdAt: '2026-11-01T10:00:00Z', rpe: 10 }), latest = response(0, { createdAt: '2026-11-01T13:00:00Z', rpe: 2 })
  assert.equal(heart([latest, old]).load.value, 120)
  assert.equal(heart([old, latest, response(0, { trainingSlot: 'morning_swim' }), response(0, { activityType: 'strength', trainingSlot: null })]).load.value, 720)
  assert.equal(heart([response(0, { competition: true })]).load.value, null)
  assert.equal(heart([response(0, { plannedCompletion: 'no' })]).load.value, null)
  assert.equal(heart([old, { ...latest, plannedCompletion: 'no' }]).load.value, null)
  assert.equal(heart([response(0, { type: 'before' })]).load.value, null)
  assert.equal(heart([response(0, { activityType: null })]).load.known, 0)
  assert.equal(heart([response(0, { activityType: null })]).load.total, 1)
})

test('missing, invalid, zero and estimated load fields are not known load', () => {
  for (const patch of [{ rpe: 0 }, { rpe: null }, { rpe: 11 }, { rpe: '5' }, { activityMinutes: 0 }, { activityMinutes: 1441 }, { activityMinutes: null }]) assert.equal(heart([response(0, patch)]).load.value, null)
})

test('animation requires recent swimming speed on distinct days, never gym strength or race readiness', () => {
  assert.equal(heart([response(0)]).speed.motion, 'none')
  assert.equal(heart([response(0), response(-1)]).speed.motion, 'brisk')
  assert.equal(heart([response(0, { speedFeeling: 2 }), response(-1, { speedFeeling: 2 })]).speed.motion, 'slow')
  assert.equal(heart([response(0, { speedFeeling: 3 }), response(-1, { speedFeeling: 3 })]).speed.motion, 'gentle')
  assert.equal(heart([response(-3), response(-4)]).speed.motion, 'none')
  for (const patch of [{ activityType: 'strength' }, { activityType: null }, { competition: true }, { plannedCompletion: 'no' }, { speedFeeling: null }]) assert.equal(heart([response(0, patch), response(-1, patch)]).speed.motion, 'none')
})

test('sleep and illness warnings remain visible even with green feelings; skipped/future/duplicate nights are excluded', () => {
  const nights = [0, -1, -2].map(offset => ({ activity_date: coachWeekAddDays(asOf, offset), minutes: 420, quality: 5 }))
  const result = heart([response(0), response(-1)], nights)
  assert.equal(result.color, 'green')
  assert.match(result.warnings.join(' '), /senaste 3 nätterna/)
  assert.equal(result.sleep.nights, 3)
  assert.equal(heart([], [...nights, ...nights, { ...nights[0], activity_date: '2026-11-02' }]).sleep.nights, 3)
  assert.equal(heart([], nights.map(row => ({ ...row, skipped: true }))).sleep.nights, 0)
  assert.equal(heart([], nights.map(row => ({ ...row, quality: null }))).warnings.length, 0)
  assert.match(heart([response(-1, { type: 'sick' })]).warnings.join(' '), /Sjukdom rapporterad 1 dag/)
  assert.equal(heart().sleep.averageMinutes, null)
})

test('traffic colours stay independent and hearts are scoped per approved non-test profile', () => {
  const report = buildSwimmerTraffic([{ id: 'a' }, { id: 'b' }, { id: 'test', isTestProfile: true }], { responses: [response(0, { profileId: 'a' }), response(-1, { profileId: 'a' }), response(0, { profileId: 'test', body: 1 })] }, asOf)
  assert.equal(report.profiles.length, 2)
  assert.equal(report.profiles[0].heart.color, 'green')
  assert.equal(report.profiles[1].heart.color, 'unknown')
  assert.equal(report.profiles[0].current.color, 'green')
})

test('existing traffic endpoint maps narrow load/speed fields to summaries without exposing raw reports', async () => {
  const calls = []
  const report = await loadSwimmerTraffic(asOf, async (query, options) => {
    calls.push(query); assert.equal(options, undefined)
    assert.doesNotMatch(query, /comment|coach_notes|reflection|\*/)
    let rows = []
    if (query.startsWith('profiles?')) rows = [{ id: 'a', created_at: '2026-01-01' }]
    if (query.startsWith('responses?')) rows = sixReports.map(row => ({ id: row.id, profile_id: 'a', activity_date: row.date, created_at: row.createdAt, day_type: row.type, activity_type: row.activityType, session_slot: row.trainingSlot, body: row.body, feeling: row.feeling, rpe: row.rpe, activity_minutes: row.activityMinutes, speed_feeling: row.speedFeeling, competition: false }))
    return { ok: true, json: async () => rows }
  })
  assert.equal(calls.length, 6)
  assert.equal(report.profiles[0].heart.load.value, 900)
  assert.equal(report.profiles[0].heart.load.ratio, 1)
  assert.equal(report.profiles[0].heart.speed.motion, 'brisk')
  assert.doesNotMatch(JSON.stringify(report), /created_at|activity_minutes|profile_id|session_slot|comment/)
})

test('heart is a sibling of the card toggle, with accessible portal, hover/click and reduced motion controls', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const view = source('src/training-heart.jsx'), main = source('src/main.jsx'), css = source('src/training-heart.css')
  assert.match(main, /<div className="swimmer-card-header">[\s\S]*?<\/button>\s*<TrainingHeart/)
  assert.match(view, /createPortal/)
  for (const text of ['onMouseEnter', 'onBlur', 'aria-expanded', 'aria-controls', 'role="dialog"', "event.key === 'Escape'", 'pointerdown', 'Stäng av animationer']) assert.ok(view.includes(text), text)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /\.motion-off \.training-heart-shape \{ animation: none/)
  assert.doesNotMatch(view, /apiRequest|fetch\(/)
})

test('emoji-like heart keeps its gloss inside one animated group and load ring separate', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const live = source('src/training-heart.jsx'), view = source('src/training-heart-glyph.jsx'), css = source('src/training-heart.css')
  assert.match(live, /<TrainingHeartGlyph motion=\{motion\}/)
  assert.ok(view.includes('id={`${id}-fill`}'), 'each card has its own gradient')
  assert.ok(view.includes('fill={`url(#${id}-fill)`}'))
  assert.match(view, /<circle className="training-heart-ring"[^>]*\/>\s*<g className="training-heart-size"><g className=\{`training-heart-shape motion-\$\{motion\}`\}>/)
  assert.match(view, /training-heart-body[\s\S]*training-heart-shine[\s\S]*<\/g>/)
  for (const color of ['green', 'yellow', 'red']) assert.match(css, new RegExp(`\\.training-heart-trigger\\.${color} \\{ --heart-light:`))
  for (const scale of ['.88', '1.08']) assert.ok(css.includes(`scale(${scale})`))
  for (const seconds of ['3.2', '2.6', '2']) assert.ok(css.includes(`training-heart-breathe ${seconds}s`))
  assert.match(css, /\.training-heart-ring \{[^}]*animation: none !important/)
  assert.match(css, /\.training-heart-trigger \.training-heart-glyph \{[^}]*animation: none !important/)
})
