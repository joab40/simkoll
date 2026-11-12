import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTrainingEnergy, currentTrainingEnergy } from '../shared/training-energy.js'
import { buildSwimmerTraffic } from '../shared/swimmer-traffic.js'

const now = '2026-11-13T12:00:00Z'
const response = patch => ({ date: '2026-11-13', createdAt: '2026-11-13T11:00:00Z', type: 'after', activityType: 'swim', body: 5, feeling: 5, speedFeeling: 5, ...patch })
const clear = { activity_date: '2026-11-13', updated_at: '2026-11-13T11:00:00Z', status: 'none' }
const build = (patch = {}) => buildTrainingEnergy({ responses: [response()], illness: [clear], ...patch }, now)

test('one meaning: all fresh 5s yield max, all at least 4 strong, otherwise steady or low', () => {
  assert.equal(build().effect, 'max')
  assert.equal(build({ responses: [response({ body: 4 })] }).effect, 'strong')
  assert.equal(build({ responses: [response({ body: 3 })] }).level, 'steady')
  assert.equal(build({ responses: [response({ body: 2 })] }).level, 'low')
})
test('missing, invalid, future and exactly-24-hour-old values never produce effects', () => {
  for (const row of [response({ body: null }), response({ body: '5' }), response({ feeling: 6 }), response({ speedFeeling: 4.5 }), response({ createdAt: '2026-11-13T13:00:00Z' }), response({ date: '2026-11-14' }), response({ date: '2026-11-12', createdAt: '2026-11-12T12:00:00Z' })]) {
    const energy = build({ responses: [row] })
    assert.equal(energy.level, 'unknown')
    assert.equal(energy.effect, 'none')
  }
})
test('stale activity cannot be made fresh by late submission; actual timestamps cross midnight', () => {
  assert.equal(build({ responses: [response({ date: '2026-11-11' })] }).effect, 'none')
  assert.equal(build({ responses: [response({ date: '2026-11-12', createdAt: '2026-11-12T13:00:00Z' })] }).effect, 'max')
})
test('freshness is per metric: newer low answers override older highs, old speed never fills a gap', () => {
  const rows = [response({ createdAt: '2026-11-13T10:00:00Z' }), response({ body: 2, speedFeeling: null })]
  const energy = build({ responses: rows })
  assert.equal(energy.level, 'low')
  assert.equal(energy.metrics.body.value, 2)
  assert.equal(energy.metrics.speed.value, 5)
  assert.equal(build({ responses: [response({ speedFeeling: null }), response({ date: '2026-11-11', speedFeeling: 5 })] }).effect, 'none')
})
test('gym, race, before-checkin and not-completed answers never become sim speed', () => {
  for (const patch of [{ activityType: 'strength' }, { competition: true }, { type: 'before' }, { plannedCompletion: 'no' }]) assert.equal(build({ responses: [response(patch)] }).effect, 'none')
})
test('missing, skipped, stale, positive or unavailable illness sources block celebration without erasing feelings', () => {
  for (const illness of [[], [{ ...clear, skipped: true }], [{ ...clear, status: 'mild' }], [{ ...clear, status: 'sick' }], [{ ...clear, updated_at: '2026-11-12T10:00:00Z' }], [{ ...clear, updated_at: null }]]) {
    const energy = build({ illness })
    assert.equal(energy.effect, 'none')
    assert.equal(energy.level, 'max')
    assert.ok(energy.signals.length)
  }
  assert.equal(build({ illnessAvailable: false }).effect, 'none')
  assert.equal(build({ illness: [{ ...clear, activity_date: '2026-11-12' }, { ...clear, skipped: true }] }).effect, 'none')
})
test('sleep warning and recent sickness block effects; more workload never boosts feelings', () => {
  const sleep = ['2026-11-11', '2026-11-12', '2026-11-13'].map(activity_date => ({ activity_date, minutes: 390, quality: 3 }))
  assert.equal(build({ sleep }).effect, 'none')
  assert.equal(build({ responses: [response(), response({ type: 'sick' })] }).effect, 'none')
  assert.equal(build({ responses: [response({ body: 3, rpe: 10, activityMinutes: 200 })] }).effect, 'none')
})
test('client expiry removes effects without fetching, including when illness expires before feelings', () => {
  const energy = build({ illness: [{ ...clear, updated_at: '2026-11-12T13:00:00Z' }] })
  assert.equal(currentTrainingEnergy(energy, Date.parse(now)).effect, 'max')
  assert.equal(currentTrainingEnergy(energy, Date.parse('2026-11-13T13:00:00Z')).effect, 'none')
  assert.equal(currentTrainingEnergy(null).level, 'unknown')
})
test('energy aggregation leaves reports and separate traffic unchanged, with narrow evidence only', () => {
  const data = { responses: [response({ profileId: 'a', id: 'private-id', comment: 'private text' })], illness: [{ ...clear, profile_id: 'a', status: 'mild' }] }
  const original = structuredClone(data)
  const report = buildSwimmerTraffic([{ id: 'a' }], data, '2026-11-13', now).profiles[0]
  assert.equal(report.current.color, 'yellow')
  assert.equal(report.heart.energy.effect, 'none')
  assert.doesNotMatch(JSON.stringify(report.heart.energy), /private|profileId|comment|rpe|activityMinutes/)
  assert.deepEqual(data, original)
})
