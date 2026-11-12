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

test('live energy details keep historical load labels separate from the star', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const live = source('src/training-heart.jsx'), details = source('src/training-energy-details.jsx')
  assert.match(details, /trainingHeartLoadSummary/)
  assert.match(details, /load.description/)
  assert.match(live, /!excluded && !loading && !error && data\?\.asOf === asOf/)
  assert.match(details, /Belastningen ändrar inte stjärnans storlek/)
  for (const role of ['coach', 'swimmer']) assert.ok(featureFaqGuide(role).includes('Belastningen finns kvar i detaljerna'))
})
