import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trainingHeartLoadSummary } from '../shared/training-heart-load.js'
import { TRAINING_HEART_EXAMPLES, trainingHeartExampleFacts } from '../shared/training-heart-examples.js'
import { featureFaqGuide } from '../shared/feature-faq.js'

test('load labels show change from previous period, not percentage of previous load', () => {
  for (const [ratio, direction, value] of [[.75, 'down', '↓ 25 %'], [1.3, 'up', '↑ 30 %'], [1, 'same', '≈ Oförändrad'], [.556, 'down', '↓ 44,4 %'], [1.75, 'up', '↑ 75 %'], [.95, 'down', '↓ 5 %'], [1.001, 'up', '↑ 0,1 %'], [.999, 'down', '↓ 0,1 %'], [0, 'down', '↓ 100 %'], [3, 'up', '↑ 200 %']]) {
    const result = trainingHeartLoadSummary({ ratio })
    assert.equal(result.direction, direction)
    assert.equal(result.value, value)
    assert.equal(result.label, `Belastning ${value}`)
  }
})

test('missing, invalid and unavailable comparisons are never labelled zero or unchanged', () => {
  for (const load of [undefined, null, {}, { ratio: null }, { ratio: NaN }, { ratio: Infinity }, { ratio: -1 }, { ratio: '.75' }]) {
    assert.equal(trainingHeartLoadSummary(load).direction, 'unknown')
    assert.equal(trainingHeartLoadSummary(load).value, 'Jämförelse saknas')
    assert.doesNotMatch(trainingHeartLoadSummary(load).label, /0|Oförändrad/)
  }
})

test('live heart, fictional examples and both FAQ guides share the exact load labels', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const live = source('src/training-heart.jsx'), examples = source('src/training-heart-examples.jsx')
  for (const view of [live, examples]) assert.match(view, /trainingHeartLoadSummary/)
  assert.match(live, /training-heart-status/)
  assert.match(live, /!excluded && !loading && !error && data\?\.asOf === asOf/)
  assert.match(live, /loadSummary\.description/)
  for (const example of TRAINING_HEART_EXAMPLES) {
    const label = trainingHeartLoadSummary(example.heart.load).label
    assert.ok(trainingHeartExampleFacts(example).find(([key]) => key === 'Belastning')[1].includes(label))
    for (const role of ['coach', 'swimmer']) assert.ok(featureFaqGuide(role).includes(label))
  }
  const css = source('src/training-heart.css')
  assert.match(css, /\.training-heart-ring \{[^}]*animation: none !important; rotate: none; transition: none/)
  assert.doesNotMatch(css, /load-(up|down)[^{]*\{[^}]*color:/)
})
