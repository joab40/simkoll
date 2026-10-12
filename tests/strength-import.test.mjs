import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStrengthDraft, validateStrengthDraft, strengthDraftContent } from '../shared/strength-import.js'
import { strengthPasses, strengthExercises } from '../shared/strength-program.js'
import { interpretStrengthProgram } from '../server/strength-import.js'

const draft = normalizeStrengthDraft({ title: 'Eget program', description: 'Två styrkepass.', instructions: 'Börja lugnt.', passes: [
  { title: 'Press', instructions: 'Värm upp.', exercises: [{ name: 'Bröstpress', prescription: '3 x 10', instructions: 'Pressa framåt med kontrollerad rörelse.', source: 'Bröstpress 3x10', uncertain: false }] },
  { title: 'Drag', instructions: '', exercises: [{ name: 'Latsdrag', prescription: '3 x 10', instructions: '', source: 'Latsdrag 3x10', uncertain: false }] },
] })

test('imported two-pass program survives storage and displays dosage and technique separately', () => {
  assert.deepEqual(validateStrengthDraft(draft), [])
  const passes = strengthPasses({ title: draft.title, content: strengthDraftContent(draft) })
  assert.equal(passes.length, 2)
  assert.equal(passes[1].title, 'Drag')
  assert.match(passes[0].content, /Börja lugnt/)
  const exercise = strengthExercises(passes[0].content)[0]
  assert.equal(exercise.name, 'Bröstpress')
  assert.equal(exercise.dosage, '3 x 10')
  assert.match(exercise.instructions, /Pressa framåt/)
  assert.doesNotMatch(passes[0].content, /Latsdrag/)
})

test('unsupported number of passes is flagged without silently discarding sessions', () => {
  const larger = { ...draft, passes: [...draft.passes, ...draft.passes] }
  assert.equal(larger.passes.length, 4)
  assert.match(validateStrengthDraft(larger).join(' '), /1–3 pass/)
})
test('repeated exercises retain separate result fields and multiline instructions remain readable', () => {
  const repeated = { ...draft, passes: [{ ...draft.passes[0], exercises: [draft.passes[0].exercises[0], { ...draft.passes[0].exercises[0], instructions: 'Steg ett.\nSteg två.' }] }] }
  const exercises = strengthExercises(strengthDraftContent(repeated))
  assert.equal(exercises.length, 2)
  assert.notEqual(exercises[0].resultKey, exercises[1].resultKey)
  assert.equal(exercises[1].instructions, 'Steg ett. Steg två.')
})

test('AI file import sends Excel as input_file and images as input_image with usage logging', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  delete process.env.OPENAI_STRENGTH_PROGRAM_MODEL
  for (const [fileName, mime, type] of [['program.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'input_file'], ['program.xls', 'application/vnd.ms-excel', 'input_file'], ['program.jpg', 'image/jpeg', 'input_image']]) {
    let logged = null
    const result = await interpretStrengthProgram({ headers: {} }, { fileName, fileData: `data:${mime};base64,ZmFrZQ==`, generateInstructions: true }, {
      fetch: async (url, options) => {
        const body = JSON.parse(options.body)
        assert.equal(body.model, 'gpt-6.1-sol')
        assert.equal(body.store, false)
        assert.equal(body.input[1].content[1].type, type)
        assert.equal(body.text.format.strict, true)
        return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(draft), usage: { input_tokens: 100, output_tokens: 50 } }) }
      },
      log: async (request, entry) => { logged = entry },
    })
    assert.equal(result.draft.passes.length, 2)
    assert.equal(result.generatedInstructions, true)
    assert.equal(logged.feature, 'strength_program_import')
    assert.equal(logged.response.usage.input_tokens, 100)
  }
})

test('malformed files and unfinished AI responses cannot become saved drafts', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  const invalid = await interpretStrengthProgram({}, { fileName: 'program.exe', fileData: 'data:image/png;base64,ZmFrZQ==' }, { fetch: () => { throw new Error('must not call API') } })
  assert.ok(invalid.error)
  const incomplete = await interpretStrengthProgram({}, { fileName: 'program.pdf', fileData: 'data:application/pdf;base64,ZmFrZQ==' }, { fetch: async () => ({ ok: true, json: async () => ({ status: 'incomplete', output_text: JSON.stringify(draft) }) }), log: async () => {} })
  assert.ok(incomplete.error)
  assert.equal(incomplete.draft, undefined)
})
