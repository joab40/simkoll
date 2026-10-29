import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSwimWorkbook } from '../server/swim-workbook-import.js'
import { importDriveWorkbook } from '../server/drive-workout-import.js'

const fileName = '2026-10-29 Spec F2.xlsx'
function fixture({ bookType = 'xlsx', hidden = false } = {}) {
  const book = XLSX.utils.book_new()
  for (const [name, meters] of [['Bröstsim', 4400], ['Fjärilsim', 4400], ['Frisim-Ryggsim', 4900]]) {
    const rows = [
      [`Träningspass ${name}`], ['Datum:', '2026-10-29'], [],
      ['Insim 2', '', '200 eget', 'Fenor', '', '', 'st. 3,15'], ['', '', '2x100 me', 'F2', '', '', 'st. 1,45'], [],
      ['SS:', '2x', '1x400', 'F2', '', '', 'st. 6,30'], ['', '', '8x25 fj', 'F2', '', '', 'st. 0,30'], [],
      ['Arm:', '10x', '100 fr', 'F2', '', 'Paddlar-Fenor', 'st. 1,30'], ['', '', '2x25 spec', 'Max-Lös', '', '', 'st. 0,45'],
      ['Avsim:', '', '200 ben', 'valfritt'], [], ['Summa:', '', meters, 'meter'], ['Tid'], [115],
    ]
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Insim 1', '200 eget', 'Fenor', 'st. 3,15', 500, 15], ['', '2x100 me', 'F2', 'st. 1,45'], [],
    ['Insim 2', '200 eget', 'Fenor', 'st. 3,15', 800, 25], ['', '4x50 valf', 'Teknik', 'st. 1,15'],
  ]), 'Blad2')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), 'Tom')
  if (hidden) book.Workbook = { Sheets: book.SheetNames.map((name, index) => ({ name, Hidden: index === 0 ? 1 : 0 })) }
  return XLSX.write(book, { type: 'buffer', bookType })
}

test('all tabs keep separate totals; a warm-up library is not selected as a full workout', () => {
  const result = parseSwimWorkbook(fixture(), fileName)
  assert.deepEqual(result.sheets.filter((sheet) => sheet.selected).map((sheet) => [sheet.sheetName, sheet.draft.distanceMeters, sheet.draft.durationMinutes]), [['Bröstsim', 4400, 115], ['Fjärilsim', 4400, 115], ['Frisim-Ryggsim', 4900, 115]])
  assert.equal(result.sheets[3].kind, 'warmup')
  assert.equal(result.sheets[3].selected, false)
  assert.match(result.sheets[3].draft.content, /Insim 2/)
  assert.deepEqual(result.skippedSheets, [{ sheetName: 'Tom', reason: 'Tom flik' }])
  assert.equal(result.sheets[0].draft.date, '2026-10-29')
})

test('block repeats, series, equipment and start times survive without interpreting heading numbers as repeats', () => {
  const { draft } = parseSwimWorkbook(fixture(), fileName).sheets[0]
  assert.match(draft.content, /^Insim 2\n200 eget · Fenor · st\. 3,15/)
  assert.match(draft.content, /SS:\n2x \[\n  1x400.*\n  8x25 fj.*\n\]/)
  assert.match(draft.content, /Arm:\n10x \[\n  100 fr · F2 · Paddlar-Fenor · st\. 1,30\n  2x25 spec.*\n\]/)
  assert.doesNotMatch(draft.content, /Insim 2\n2x \[/)
  assert.doesNotMatch(draft.content, /Summa|4400|115/)
})

test('legacy XLS receives the same multi-tab handling and hidden tabs require explicit selection', () => {
  const result = parseSwimWorkbook(fixture({ bookType: 'biff8', hidden: true }), 'Pass.xls')
  assert.equal(result.sheets.length, 4)
  assert.equal(result.sheets[0].selected, false)
  assert.match(result.sheets[0].warnings.join(' '), /Dold flik/)
  assert.equal(result.sheets[1].draft.distanceMeters, 4400)
})

test('unknown layouts stay available for manual review and oversized files are never silently truncated', () => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Ett annorlunda pass'], ['4x100 fr', 'st. 1,30']]), 'Frisim')
  const result = parseSwimWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), fileName)
  assert.equal(result.sheets[0].kind, 'review')
  assert.equal(result.sheets[0].selected, false)
  assert.match(result.sheets[0].draft.content, /4x100 fr · st\. 1,30/)
  assert.throws(() => parseSwimWorkbook(Buffer.alloc(3 * 1024 * 1024 + 1), fileName), /under 3 MB/)
  book.Sheets.Frisim['!ref'] = 'A1:A301'
  assert.throws(() => parseSwimWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), fileName), /300 rader/)
})

test('Drive uses verified metadata and downloads Excel or exports the complete Google workbook', async () => {
  for (const mimeType of ['application/vnd.google-apps.spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']) {
    const urls = []
    globalThis.fetch = async (raw) => {
      const url = new URL(raw); urls.push(url)
      if (url.searchParams.has('fields')) return Response.json({ name: fileName, mimeType, size: 18000 })
      return new Response(fixture())
    }
    const result = await importDriveWorkbook('file-id', 'fixture-key')
    assert.equal(result.sheets.filter((sheet) => sheet.selected).length, 3)
    assert.equal(urls.length, 2)
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      assert.match(urls[1].pathname, /\/export$/)
      assert.equal(urls[1].searchParams.get('mimeType'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } else assert.equal(urls[1].searchParams.get('alt'), 'media')
  }
})

test('unsupported and oversized Drive files fail before a download is attempted', async () => {
  for (const metadata of [{ mimeType: 'application/pdf' }, { mimeType: 'application/vnd.ms-excel', size: 4 * 1024 * 1024 }]) {
    let calls = 0
    globalThis.fetch = async () => { calls += 1; return Response.json(metadata) }
    await assert.rejects(importDriveWorkbook('file-id', 'fixture-key'), /Välj/)
    assert.equal(calls, 1)
  }
})
