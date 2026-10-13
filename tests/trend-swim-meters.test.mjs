import test from 'node:test'
import assert from 'node:assert/strict'
import { withTrendSwimMeters } from '../src/trend-swim-meters.js'
import { trendSegments } from '../src/trend-curve.js'

test('reported swimming overrides planned meters; cycling is excluded', () => {
  const [row] = withTrendSwimMeters([{ distanceMeters: 4500, activities: [{ type: 'swim', distanceMeters: 2000 }, { type: 'swim', distanceMeters: 1500 }, { type: 'cycling', distanceMeters: 7000 }] }])
  assert.equal(row.swimMeters, 3500)
  assert.equal(row.swimMeterScale, 3.5)
  assert.equal(row.swimMeterSource, 'Rapporterat')
})
test('planned fallback is labelled and missing data breaks the line', () => {
  const rows = withTrendSwimMeters([{ distanceMeters: 10000 }, { activities: [{ type: 'cycling', distanceMeters: 7000 }] }, { distanceMeters: 2000 }])
  assert.equal(rows[0].swimMeterScale, 10)
  assert.equal(rows[0].swimMeterSource, 'Uppskattat från kopplat simpass')
  assert.equal(rows[1].swimMeterScale, null)
  assert.equal(trendSegments(rows, 'swimMeterScale').length, 2)
})
test('explicit zero survives; null empty invalid and negative values are missing', () => {
  const rows = withTrendSwimMeters([0, null, '', -1, 'oops', 12000].map((distanceMeters) => ({ distanceMeters, activities: [{ type: 'swim', distanceMeters: null }] })))
  assert.deepEqual(rows.map((row) => row.swimMeterScale), [0, null, null, null, null, 12])
})
