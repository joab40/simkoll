import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTrainingHeart } from '../shared/training-heart.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { featureFaqGuide } from '../shared/feature-faq.js'
import { TRAINING_STATE_RULES } from '../shared/training-heart-state.js'

const asOf = '2026-11-02', date = offset => coachWeekAddDays(asOf, offset)
const report = (offset, patch = {}) => ({ id: `r${offset}`, date: date(offset), createdAt: `${date(offset)}T18:00:00Z`,
  type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim',
  body: 4.5, feeling: 4.5, speedFeeling: 4.5, rpe: offset < -6 ? 6 : 5,
  activityMinutes: offset < -6 ? 90 : 60, ...patch })
const rows = [0, -1, -2, -7, -8, -9].map(offset => report(offset))
const nights = [0, -1, -2].map(offset => ({ activity_date: date(offset), minutes: 540, quality: 5 }))
const build = (responses = rows, sleep = nights) => buildTrainingHeart({ responses, sleep }, asOf)
const state = (responses, sleep) => build(responses, sleep).readiness.state
const current = (patch, original = rows) => original.map(row => row.date >= date(-2) ? { ...row, ...patch } : row)

test('Turbo combines strong current feelings, speed, sleep and a covered reduction, with transparent evidence', () => {
  const before = structuredClone({ rows, nights }), result = build()
  assert.equal(result.readiness.state, 'turbo')
  assert.match(result.readiness.label, /toppningssignal/)
  assert.match(result.readiness.description, /inte bekräftad toppform/)
  assert.equal(result.load.ratio, .556)
  assert.equal(result.readiness.checks.length, 7)
  assert.ok(result.readiness.checks.every(check => check.detail && typeof check.ok === 'boolean'))
  assert.deepEqual({ rows, nights }, before)
})

test('positive states cannot be produced by lower load, a single good day, RPE or gym strength alone', () => {
  assert.equal(state(current({ body: 2, feeling: 3 })), 'heavy')
  assert.notEqual(state(current({ speedFeeling: null })), 'turbo')
  for (const field of ['body', 'feeling', 'speedFeeling']) {
    const sparse = current({ [field]: null }).map(row => row.date === asOf ? { ...row, [field]: 5 } : row)
    assert.ok(!['ready', 'turbo'].includes(state(sparse)), field)
  }
  assert.ok(!['ready', 'turbo', 'fast'].includes(state(current({ activityType: 'strength' }))))
  assert.ok(!['ready', 'turbo', 'fast'].includes(state(current({ competition: true }))))
  assert.ok(!['ready', 'turbo'].includes(state(current({ rpe: 1, speedFeeling: 2 }))))
  assert.ok(!['ready', 'turbo'].includes(state([report(0)], [nights[0]])))
})

test('ready is a qualified signal even without comparable load, not guaranteed recovery or Turbo', () => {
  const good = current({ body: 4, feeling: 4, speedFeeling: 4 })
  assert.equal(state(good), 'ready')
  assert.equal(state(good.filter(row => row.date >= date(-2))), 'ready')
  assert.match(build(good).readiness.description, /inte en direkt fråga/)
  assert.equal(state(current({ rpe: 6, activityMinutes: 81 })), 'turbo') // exactly 10% below previous
  assert.equal(state(current({ rpe: 6, activityMinutes: 82 })), 'ready')
  assert.equal(state(current({ activityMinutes: null })), 'ready')
})

test('sleep must be recent, valid and present; old, skipped or future nights never prove rested', () => {
  for (const sleep of [[], [nights[0]], nights.map(n => ({...n, skipped: true})),
    nights.map(n => ({...n, minutes: 479})), nights.map(n => ({...n, quality: 3})),
    nights.map(n => ({...n, quality: null})),
    nights.map((n, i) => ({...n, activity_date: date(-3-i)})),
    nights.map((n, i) => ({...n, activity_date: date(i+1)})),
    [nights[0], nights[0], nights[0]]]) {
    assert.ok(!['turbo', 'ready'].includes(state(rows, sleep)), JSON.stringify(sleep))
  }
  assert.equal(state(rows, nights.map(n => ({...n, minutes: 480}))), 'turbo')
  assert.equal(state(rows, [nights[0], {...nights[1], quality: 3}]), 'turbo')
})

test('sleep and illness warnings take precedence despite excellent mood, speed and lower load', () => {
  assert.equal(state(rows, nights.map(n => ({...n, minutes: 420}))), 'watch')
  assert.equal(state(rows, nights.map(n => ({...n, quality: 1}))), 'watch')
  assert.equal(state([...rows, report(-1, {id: 'sick', type: 'sick'})]), 'watch')
  assert.equal(build(rows, nights.map(n => ({...n, minutes: 420}))).color, 'green')
})

test('rising compares distinct non-overlapping current 3 days and earlier 4 days, with equal day weights', () => {
  const earlier = [-3, -4].map(offset => report(offset, {speedFeeling: 3}))
  const progressing = current({body: 3.5, feeling: 3.5, speedFeeling: 3.5})
  assert.equal(state([...progressing, ...earlier]), 'rising')
  assert.equal(state([...progressing, earlier[0]]), 'steady')
  assert.equal(state([...current({body: 3.5, feeling: 3.5, speedFeeling: 3.4}), ...earlier]), 'steady')
  assert.equal(state([...progressing, ...earlier.map(row => ({...row, date: date(-7)}))]), 'steady')
  assert.equal(state([...progressing, ...earlier, ...Array.from({length: 6}, (_, i) => ({...earlier[0], id: `duplicate-${i}`}))]), 'rising')
})

test('fast, heavy, load-only and unknown keep mixed signals and missing data distinct', () => {
  assert.equal(state(current({body: 3.5, feeling: 3.5, speedFeeling: 4})), 'fast')
  assert.notEqual(state(current({body: 2, feeling: 4, speedFeeling: 5})), 'fast')
  assert.equal(state(current({body: 3, speedFeeling: 2})), 'heavy')
  assert.equal(state(current({body: 3.5, feeling: 3.5, speedFeeling: 3})), 'steady')
  assert.equal(state(current({body: null, feeling: null, speedFeeling: null})), 'load-only')
  assert.equal(state([], []), 'unknown')
  assert.notEqual(state([report(-3), report(-4)], nights), 'fast')
  assert.ok(!['turbo', 'ready'].includes(state(current({body: '5'}))))
})

test('both FAQ/assistant guides explain exact shared state rules without adding private context', () => {
  for (const role of ['coach', 'swimmer']) {
    const guide = featureFaqGuide(role)
    for (const rule of TRAINING_STATE_RULES) assert.ok(guide.includes(rule))
    for (const text of ['Turbo', 'Utvilad och redo', 'På väg mot fart', 'Tung i träningen', 'inte faktisk puls']) assert.ok(guide.includes(text))
  }
  const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const css = source('src/training-heart.css'), view = source('src/training-heart.jsx')
  assert.match(css, /state-turbo \.training-heart-shape.*training-heart-turbo/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /\.motion-off \.training-heart-shape \{ animation: none/)
  assert.match(css, /\.training-heart-ring \{[^}]*animation: none !important/)
  assert.match(view, /Vilka värden ligger bakom signalen/)
  assert.match(view, /readiness\.label/)
  assert.doesNotMatch(view, /apiRequest|fetch\(/)
})
