import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TRAINING_HEART_EXAMPLES, TRAINING_HEART_EXAMPLE_ANSWERS, trainingHeartExampleFacts } from '../shared/training-heart-examples.js'
import { featureFaqFor, featureFaqGuide } from '../shared/feature-faq.js'

const byId = id => TRAINING_HEART_EXAMPLES.find(example => example.id === id)
test('fictional FAQ scenarios run the real heart rules, including mixed signals and missing data', () => {
  assert.equal(TRAINING_HEART_EXAMPLES.length, 5)
  const expected = {
    competition: ['green', 'lower', 'brisk', 900, 1620, 0],
    heavy: ['red', 'higher', 'slow', 2100, 1200, 0],
    mixed: ['yellow', 'similar', 'brisk', 1200, 1200, 0],
    'sleep-warning': ['green', 'lower', 'brisk', 900, 1620, 1],
    missing: ['unknown', 'unknown', 'none', 300, null, 0],
  }
  for (const example of TRAINING_HEART_EXAMPLES) {
    const heart = example.heart
    assert.deepEqual([heart.color, heart.load.ring, heart.speed.motion, heart.load.value, heart.load.previous.value, heart.warnings.length], expected[example.id])
    assert.equal(trainingHeartExampleFacts(example).length, 4)
    assert.doesNotMatch(JSON.stringify(heart), /profileId|username|comment/)
  }
  assert.equal(byId('competition').heart.load.ratio, .556)
  assert.equal(byId('heavy').heart.load.ratio, 1.75)
  assert.equal(byId('missing').heart.body.days, 1)
  assert.equal(byId('missing').heart.load.ratio, null)
  assert.match(byId('sleep-warning').heart.warnings[0], /Kort sovtid senaste 3 nätterna.*6 h 30 min/)
})

test('visible examples and both assistants share exact source values and non-diagnostic explanations', () => {
  for (const role of ['swimmer', 'coach']) {
    const entry = featureFaqFor(role, 'diary').find(item => item.id === 'training-heart-examples')
    assert.deepEqual(entry.answer, TRAINING_HEART_EXAMPLE_ANSWERS)
    const guide = featureFaqGuide(role)
    for (const example of TRAINING_HEART_EXAMPLES) {
      assert.ok(guide.includes(example.title))
      assert.ok(guide.includes(example.interpretation))
      for (const [label, value] of trainingHeartExampleFacts(example)) assert.ok(guide.includes(`${label}: ${value}`))
    }
    assert.match(entry.answer.join(' '), /fiktiva exempel/)
    assert.match(entry.answer.join(' '), /mäter inte toppform eller tävlingsberedskap/)
    assert.match(entry.answer.join(' '), /Måltävling, toppningsperiod, träningsfas, testlopp och tävlingsresultat ingår inte/)
  }
})

test('example illustrations reuse live SVG, start paused and make no private-data or AI requests', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const view = source('src/training-heart-examples.jsx'), faq = source('src/feature-faq.jsx')
  assert.match(faq, /showHeartExamples && <TrainingHeartExamples/)
  assert.match(faq, /event.target === event.currentTarget/)
  assert.match(view, /useState\(false\)/)
  assert.match(view, /motion-off/)
  assert.match(view, /aria-pressed=\{animate\}/)
  assert.match(view, /<TrainingHeartGlyph motion=\{heart.speed.motion\}/)
  assert.match(view, /trainingHeartExampleFacts\(example\)/)
  assert.match(view, /useId\(\)/)
  assert.doesNotMatch(view + source('shared/training-heart-examples.js'), /apiRequest|fetch\(|localStorage|Date\.now/)
  assert.match(source('src/training-heart.css'), /prefers-reduced-motion: reduce/)
})
