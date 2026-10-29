import assert from 'node:assert/strict'
import { hasTrendValue, trendSegments, smoothTrendPath, trendDateLayout } from '../src/trend-curve.js'

for (const value of [null, undefined, '', NaN, Infinity]) assert.equal(hasTrendValue(value), false)
assert.equal(hasTrendValue(0), true)
const segments = trendSegments([{ v: 3 }, { v: 4 }, { v: null }, { v: 2 }, { v: undefined }, { v: 0 }], 'v')
assert.deepEqual(segments.map((segment) => segment.map((point) => point.index)), [[0, 1], [3], [5]])
assert.equal(smoothTrendPath([]), '')
assert.equal(smoothTrendPath([{ x: 10, y: 20 }]), 'M 10,20')
for (const values of [[1, 5, 1], [3, 3, 3], [1, 2, 5, 4], [5, 4, 1], [0, 1000, 1, 2]]) {
  const points = values.map((y, index) => ({ x: index * 90, y }))
  const path = smoothTrendPath(points)
  const curves = path.split(' C ').slice(1)
  assert.equal(curves.length, points.length - 1)
  curves.forEach((curve, index) => {
    const [x1, y1, x2, y2, x3, y3] = curve.split(/[ ,]/).map(Number)
    const a = points[index], b = points[index + 1]
    assert.equal(x3, b.x); assert.equal(y3, b.y)
    for (let step = 0; step <= 100; step++) {
      const t = step / 100, u = 1 - t
      const y = u ** 3 * a.y + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3
      assert(y >= Math.min(a.y, b.y) - 1e-8 && y <= Math.max(a.y, b.y) + 1e-8)
    }
    assert(x1 > a.x && x2 < b.x)
  })
}
const repeatedDays = ['2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28', '2026-10-29'].map((date) => ({ date }))
const layout = trendDateLayout(repeatedDays)
assert.equal(layout.labels.length, 4, 'one date label per calendar day')
layout.positions.forEach((position, index) => {
  assert(Number.isFinite(position))
  if (index) assert(position > layout.positions[index - 1], 'same-day workouts must have distinct ordered x coordinates')
  const center = layout.labels.find((label) => label.date === repeatedDays[index].date).position
  assert(Math.abs(position - center) < layout.dayWidth / 2, 'workout stays inside its calendar day')
})
for (const values of [[3.2, 3.1, 3.1, 3, 3, 3.1], [5, 4.7, 3, 5, 2.4, 3.3]]) {
  const path = smoothTrendPath(values.map((y, index) => ({ x: layout.positions[index] * 1000, y })))
  assert(!/NaN|Infinity/.test(path), 'ratings and meter lines must remain drawable across repeated dates')
  assert.equal(path.split(' C ').length - 1, values.length - 1)
}
const singleDay = trendDateLayout([{ date: '2026-10-29' }])
assert.deepEqual(singleDay.positions, [0.5])
const spacedDays = trendDateLayout([{ date: '2026-10-23' }, { date: '2026-10-25' }])
assert(Math.abs(spacedDays.positions[1] - spacedDays.positions[0] - spacedDays.dayWidth * 2) < 1e-12, 'missing days retain their calendar spacing')
console.log('PASS smooth trends: original points, no overshoot, sparse gaps, true zero, isolated observations and multiple workouts per day')
