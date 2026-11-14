import test from 'node:test'
import assert from 'node:assert/strict'
import { profileTrainingGoals, swimmerProfileSetup, trainingGoalValues } from '../shared/swimmer-profile-setup.js'
import { readFileSync } from 'node:fs'

const asOf = '2026-11-14'
const profile = { id: 'p', tempusId: '123', primaryStroke: 'free', trainingGroup: 'junior' }
const swim = { profileId: 'p', startDate: '2026-01-01', endDate: null, active: true, target: 6 }
const cross = { profileId: 'p', startDate: '2026-01-01', endDate: null, drylandTarget: 3, strengthTarget: 3 }

test('missing cross goals never become automatic threes; setup names only the missing sports', () => {
  const data = { seasonGoals: [swim], crossGoals: [] }
  const goals = profileTrainingGoals(data, 'p', asOf)
  assert.deepEqual(goals.map(goal => [goal.key, goal.state, goal.target]), [['swim', 'active', 6], ['dryland', 'missing', null], ['strength', 'missing', null]])
  const setup = swimmerProfileSetup(profile, data, asOf)
  assert.equal(setup.completeCount, 3)
  assert.equal(setup.symbol, '?'); assert.equal(setup.informational, false)
  assert.deepEqual(setup.missing, ['veckomål för landträning', 'veckomål för styrka'])
  assert.deepEqual(setup.scheduled, [])
})

test('future goals are dated plans, never current goals or generic missing settings', () => {
  const data = { seasonGoals: [swim], crossGoals: [{ ...cross, startDate: '2026-11-16' }] }
  const goals = profileTrainingGoals(data, 'p', asOf)
  assert.equal(goals[1].state, 'scheduled'); assert.equal(goals[1].target, null)
  assert.equal(goals[1].pendingTarget, 3); assert.equal(goals[1].startsOn, '2026-11-16')
  const setup = swimmerProfileSetup(profile, data, asOf)
  assert.equal(setup.completeCount, 3); assert.equal(setup.show, true)
  assert.equal(setup.symbol, 'i'); assert.equal(setup.informational, true); assert.equal(setup.color, 'gray')
  assert.equal(setup.heading, 'Sparade mål – kommande startdatum')
  assert.match(setup.title, /Ingen komplettering behövs/); assert.doesNotMatch(setup.title, /3 av 4/)
  assert.deepEqual(setup.missing, [])
  assert.equal(setup.scheduled.length, 2)
  assert.match(setup.title, /16 nov\. 2026/); assert.match(setup.title, /inget aktivt mål idag/)
  const monday = swimmerProfileSetup(profile, data, '2026-11-16')
  assert.equal(monday.completeCount, 4); assert.equal(monday.show, false)
})

test('active targets stay current until a scheduled change starts; earliest valid future change wins', () => {
  const data = { seasonGoals: [swim], crossGoals: [
    { ...cross, endDate: '2026-11-15', drylandTarget: 2 },
    { ...cross, startDate: '2026-11-23', drylandTarget: 5 },
    { ...cross, startDate: '2026-11-16', endDate: '2026-11-22', drylandTarget: 4, strengthTarget: 0 },
    { ...cross, profileId: 'other', startDate: '2026-11-15', drylandTarget: 7 },
  ] }
  const goals = profileTrainingGoals(data, 'p', asOf)
  assert.equal(goals[1].state, 'active'); assert.equal(goals[1].target, 2)
  assert.equal(goals[1].pendingTarget, 4); assert.equal(goals[1].startsOn, '2026-11-16')
  assert.equal(goals[2].pendingTarget, 0)
  const setup = swimmerProfileSetup(profile, data, asOf)
  assert.equal(setup.completeCount, 4); assert.equal(setup.show, true)
  assert.equal(setup.symbol, 'i'); assert.equal(setup.informational, true)
  assert.match(setup.scheduled[0], /nu 2/)
  assert.equal(profileTrainingGoals(data, 'p', '2026-11-16')[1].target, 4)
})

test('zero is explicit and complete, partial goals identify the precise sport', () => {
  const data = { seasonGoals: [swim], crossGoals: [{ ...cross, drylandTarget: 0, strengthTarget: null }] }
  const goals = profileTrainingGoals(data, 'p', asOf)
  assert.equal(goals[1].target, 0); assert.equal(goals[1].state, 'active')
  assert.deepEqual(swimmerProfileSetup(profile, data, asOf).missing, ['veckomål för styrka'])
  assert.deepEqual(swimmerProfileSetup(profile, { ...data, crossGoals: [{ ...cross, drylandTarget: 0, strengthTarget: 0 }] }, asOf).missing, [])
})

test('expired, inactive, wrong-profile and malformed future goals cannot satisfy setup', () => {
  for (const patch of [{ endDate: '2026-11-13' }, { active: false }, { profileId: 'other' }, { startDate: '2026-11-16', endDate: '2026-11-15' }, { target: '' }]) {
    const setup = swimmerProfileSetup(profile, { seasonGoals: [{ ...swim, ...patch }], crossGoals: [cross] }, asOf)
    assert.deepEqual(setup.missing, ['veckomål för simning'])
    assert.deepEqual(setup.scheduled, [])
  }
})

test('loading and failed refresh hide stale targets and pending values without claiming missing goals', () => {
  const data = { seasonGoals: [swim], crossGoals: [{ ...cross, startDate: '2026-11-16' }] }
  for (const status of ['loading', 'error']) {
    const goals = profileTrainingGoals(data, 'p', asOf, status)
    assert.ok(goals.every(goal => goal.state === 'unknown' && goal.target === null && goal.pendingTarget === null && goal.startsOn === null))
    const setup = swimmerProfileSetup(profile, data, asOf, status)
    assert.equal(setup.unknown, true); assert.deepEqual(setup.missing, []); assert.deepEqual(setup.scheduled, [])
    assert.equal(setup.symbol, '…'); assert.equal(setup.informational, false)
  }
})

test('a real missing setting keeps the question mark even when future goals are already saved', () => {
  const setup = swimmerProfileSetup({ ...profile, primaryStroke: '' }, { seasonGoals: [swim], crossGoals: [{ ...cross, startDate: '2026-11-16' }] }, asOf)
  assert.equal(setup.symbol, '?'); assert.equal(setup.informational, false)
  assert.deepEqual(setup.missing, ['specialinriktning']); assert.equal(setup.scheduled.length, 2)
})

test('edit form leaves missing targets blank, preserves explicit zero and edits next Monday rather than silently replacing a future change', () => {
  const data = { seasonGoals: [swim], crossGoals: [{ ...cross, endDate: '2026-11-15' }, { ...cross, startDate: '2026-11-16', drylandTarget: 0, strengthTarget: 2 }] }
  const goals = profileTrainingGoals(data, 'p', asOf)
  assert.deepEqual(trainingGoalValues(goals), { swim: 6, dryland: 0, strength: 2 })
  assert.deepEqual(trainingGoalValues(goals, { strength: '', dryland: '1' }), { swim: 6, dryland: '1', strength: '' })
  assert.deepEqual(trainingGoalValues(profileTrainingGoals({ seasonGoals: [swim] }, 'p', asOf)), { swim: 6, dryland: '', strength: '' })
})

test('card, setup and save feedback share goal states and never manufacture cross targets', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const view = readFileSync(new URL('../src/swimmer-training-goals.jsx', import.meta.url), 'utf8')
  const save = main.slice(main.indexOf('const saveTrainingGoals ='), main.indexOf('const saveGroup ='))
  assert.match(main, /const trainingGoals = profileTrainingGoals\(training, profile.id, todayKey\(\), trainingLoadStatus\)/)
  assert.doesNotMatch(save, /\?\? 3/)
  assert.match(save, /value === ''/)
  assert.match(save, /goalDateLabel\(savedCross.startDate\)/)
  assert.match(main, /setup.scheduled.map/)
  assert.match(view, /Mål saknas/); assert.match(view, /goalDateLabel\(goal.startsOn\)/)
  assert.match(view, /required disabled=\{unknown\}/)
})
