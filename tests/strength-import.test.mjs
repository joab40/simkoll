import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStrengthDraft, validateStrengthDraft, strengthDraftContent } from '../shared/strength-import.js'
import { strengthPasses, strengthExercises } from '../shared/strength-program.js'
import { interpretStrengthProgram } from '../server/strength-import.js'
import XLSX from 'xlsx'
import { readStrengthSpreadsheet } from '../server/strength-spreadsheet.js'

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

test('programs allow up to five passes and flag larger drafts without discarding sessions', () => {
  const allowed = { ...draft, passes: [...draft.passes, ...draft.passes, draft.passes[0]] }
  assert.equal(allowed.passes.length, 5)
  assert.equal(validateStrengthDraft(allowed).some((error) => /pass/.test(error)), false)
  const larger = { ...allowed, passes: [...allowed.passes, draft.passes[0]] }
  assert.equal(larger.passes.length, 6)
  assert.match(validateStrengthDraft(larger).join(' '), /1–5 pass/)
})
test('repeated exercises retain separate result fields and multiline instructions remain readable', () => {
  const repeated = { ...draft, passes: [{ ...draft.passes[0], exercises: [draft.passes[0].exercises[0], { ...draft.passes[0].exercises[0], instructions: 'Steg ett.\nSteg två.' }] }] }
  const exercises = strengthExercises(strengthDraftContent(repeated))
  assert.equal(exercises.length, 2)
  assert.notEqual(exercises[0].resultKey, exercises[1].resultKey)
  assert.equal(exercises[1].instructions, 'Steg ett. Steg två.')
})

test('AI file import extracts Excel cell values and sends images as input_image with usage logging', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  delete process.env.OPENAI_STRENGTH_PROGRAM_MODEL
  for (const [fileName, mime, type] of [['program.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'input_text'], ['program.xls', 'application/vnd.ms-excel', 'input_text'], ['program.jpg', 'image/jpeg', 'input_image']]) {
    let logged = null
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Pass 1', 'Bröst'], [null, 'Bröstpress', '3x10']]), 'Program')
    const bytes = type === 'input_text' ? XLSX.write(workbook, { type: 'buffer', bookType: fileName.endsWith('.xls') ? 'xls' : 'xlsx' }) : Buffer.from('fake')
    const result = await interpretStrengthProgram({ headers: {} }, { fileName, fileData: `data:${mime};base64,${bytes.toString('base64')}`, generateInstructions: true }, {
      fetch: async (url, options) => {
        const body = JSON.parse(options.body)
        assert.equal(body.model, 'gpt-6.1-sol')
        assert.equal(body.store, false)
        assert.equal(body.input[1].content[1].type, type)
        if (type === 'input_text') {
          const source = JSON.parse(body.input[1].content[1].text)
          assert.equal(source.sheets[0].rows[1].cells.B2, 'Bröstpress')
          assert.equal(source.sheets[0].rows[1].cells.C2, '3x10')
        }
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

test('Excel extraction preserves three passes, merged headings, empty weights and all sheets', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['Styrkeprogram'], [], ['Pass 1', 'Bröst'], [null, 'Bröstpress', '3x10', null], [], ['Pass 2', 'Rygg'], [null, 'Latsdrag', '3x10', 20], [], ['Pass 3', 'Ben'], [null, 'Benpress', '3x10', null]])
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Pass')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Vila mellan set', '90 sek']]), 'Instruktioner')
  const parsed = JSON.parse(readStrengthSpreadsheet(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })))
  assert.equal(parsed.sheets.length, 2)
  assert.deepEqual(parsed.sheets[0].mergedCells, ['A1:D1'])
  assert.equal(parsed.sheets[0].rows.filter(({ cells }) => Object.values(cells).some((value) => /^Pass [123]$/.test(value))).length, 3)
  assert.equal(parsed.sheets[0].rows.find(({ row }) => row === 4).cells.D4, undefined)
  assert.equal(parsed.sheets[0].rows.find(({ row }) => row === 7).cells.D7, '20')
})

test('oversized and invalid Excel files fail before contacting the AI', () => {
  assert.throws(() => readStrengthSpreadsheet(Buffer.from('not excel')), /inte en läsbar/)
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['Program']])
  sheet.A1001 = { t: 's', v: 'Last exercise' }
  sheet['!ref'] = 'A1:A1001'
  XLSX.utils.book_append_sheet(workbook, sheet, 'Large')
  assert.throws(() => readStrengthSpreadsheet(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })), /för stort/)
})

test('provider rejection exposes a useful status and code without storing file contents', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  let logged
  const result = await interpretStrengthProgram({}, { fileName: 'program.pdf', fileData: 'data:application/pdf;base64,ZmFrZQ==' }, { fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'unsupported_file', message: 'sensitive document details' } }) }), log: async (request, entry) => { logged = entry } })
  assert.match(result.error, /HTTP 400, unsupported_file/)
  assert.equal(logged.error, 'HTTP 400 unsupported_file')
  assert.doesNotMatch(result.error, /sensitive/)
})

test('malformed files and unfinished AI responses cannot become saved drafts', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  const invalid = await interpretStrengthProgram({}, { fileName: 'program.exe', fileData: 'data:image/png;base64,ZmFrZQ==' }, { fetch: () => { throw new Error('must not call API') } })
  assert.ok(invalid.error)
  const incomplete = await interpretStrengthProgram({}, { fileName: 'program.pdf', fileData: 'data:application/pdf;base64,ZmFrZQ==' }, { fetch: async () => ({ ok: true, json: async () => ({ status: 'incomplete', output_text: JSON.stringify(draft) }) }), log: async () => {} })
  assert.ok(incomplete.error)
  assert.equal(incomplete.draft, undefined)
})
