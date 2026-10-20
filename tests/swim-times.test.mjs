import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTrainingTime, formatTrainingTime, validateSwimTime, comparableSwimTimes, swimTimeKey } from '../shared/swim-times.js'

const draft = (extra = {}) => ({ date: '2026-10-01', distance: 75, poolLength: 25, stroke: 'freestyle', time: '48,21', kind: 'training', startType: 'push', exercise: 'arms', equipment: ['pull_buoy'], timingMethod: 'hand', ...extra })
test('training times use integer hundredths and preserve Swedish time formats', () => {
  assert.equal(parseTrainingTime('1:08,42'), 6842)
  assert.equal(parseTrainingTime('27.7'), 2770)
  assert.equal(formatTrainingTime(6842), '1:08,42')
  for (const value of ['0', '-10', '1:60', '1:23,456', 'abc', '100:01']) assert.equal(parseTrainingTime(value), null)
})
test('arbitrary training distances are accepted but invalid or future inputs are rejected', () => {
  assert.equal(validateSwimTime(draft(), '2026-10-19').distance_meters, 75)
  for (const change of [{ date: '2026-02-30' }, { date: '2027-01-01' }, { distance: -10 }, { distance: 2.5 }, { poolLength: 33 }, { stroke: 'toString' }, { equipment: ['unknown'] }, { time: '0' }, { note: 'x'.repeat(1001) }]) assert.throws(() => validateSwimTime(draft(change), '2026-10-19'))
})
test('only matching conditions share a progress series; gear order does not split a series', () => {
  const base = { ...validateSwimTime(draft({ equipment: ['pull_buoy', 'paddles'] }), '2026-10-19'), id: 'one', created_at: '2026-10-01' }
  const same = { ...base, id: 'two', equipment: ['paddles', 'pull_buoy'], result_time: 4700, result_date: '2026-10-02' }
  assert.equal(swimTimeKey(base), swimTimeKey(same))
  for (const change of [{ pool_length: 50 }, { distance_meters: 100 }, { stroke: 'backstroke' }, { start_type: 'dive' }, { exercise: 'full' }, { equipment: [] }, { timing_method: 'electronic' }, { kind: 'test' }, { conditions: 'Med motstånd' }]) assert.notEqual(swimTimeKey(base), swimTimeKey({ ...base, ...change }))
  const groups = comparableSwimTimes([same, base, { ...base, id: 'three', pool_length: 50 }])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].items.map((item) => item.id), ['one', 'two'])
  assert.equal(groups[0].best, 4700)
})
