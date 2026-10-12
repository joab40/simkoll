import test from 'node:test'
import assert from 'node:assert/strict'
import { strengthPasses } from '../shared/strength-program.js'

test('three-pass strength program is split into independently selectable passes', () => {
  const program = {
    title: 'Basstyrka · 3 pass',
    content: [
      'Upplägg och instruktioner.',
      'Pass 1 · Bröst, axlar och triceps\n1. Bröstpress: 3 x 10\n2. Axelpress: 2 x 10',
      'Pass 2 · Rygg och biceps\n1. Latsdrag: 3 x 10\n2. Rodd: 3 x 10',
      'Pass 3 · Ben och bål\n1. Benpress: 3 x 10\n2. Magmaskin: 2 x 10',
      'Belastning och progression\nBörja lugnt.',
    ].join('\n\n'),
  }

  const passes = strengthPasses(program)
  assert.equal(passes.length, 3)
  assert.deepEqual(passes.map(({ passNumber, title }) => [passNumber, title]), [
    [1, 'Bröst, axlar och triceps'],
    [2, 'Rygg och biceps'],
    [3, 'Ben och bål'],
  ])
  assert.match(passes[0].content, /Bröstpress/)
  assert.doesNotMatch(passes[0].content, /Latsdrag/)
  assert.match(passes[1].content, /Latsdrag/)
  assert.match(passes[2].content, /Benpress/)
})

test('existing weekly programs keep their three separator-based sessions', () => {
  const passes = strengthPasses({
    title: 'Tjejer · Frisim · Veckoprogram (Pass 1–3)',
    content: ['intro', '1. pass one', '1. pass two', '1. pass three'].join('\n\n==============================\n\n'),
  })
  assert.equal(passes.length, 3)
  assert.equal(passes[1].content, '1. pass two')
})
