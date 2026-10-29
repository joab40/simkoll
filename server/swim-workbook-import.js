import * as XLSX from 'xlsx'
import { SWIM_WORKBOOK_MAX_BYTES, SWIM_WORKBOOK_MAX_SHEETS } from '../shared/swim-workbook.js'

const clean = (value) => String(value ?? '').trim()
const number = (value) => {
  const text = clean(value).replace(/\s/g, '').replace(/(?:meter|minuter|min|m)$/i, '')
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : ''
}
const isWarmup = (value) => /^(insim|uppvärmning)\b/i.test(value)
const isSection = (value) => /^(insim|uppvärmning|ben|ss|spec|huvudserie|arm|avsim|nedvarvning|serie|teknik)\b/i.test(value)
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value

function readSheet(rows, sheetName, fileName, index) {
  const header = rows.find((row) => /^träningspass\b/i.test(row[0]))
  const total = rows.find((row) => /^summa\b/i.test(row[0]))
  const dateRow = rows.find((row) => /^datum\b/i.test(row[0]))
  const timeIndex = rows.findIndex((row) => /^tid(?:\s*\(.*\))?\s*:?$/i.test(row[0]))
  const template = Boolean(header || total)
  const setColumn = template ? 2 : 1
  const start = rows.findIndex((row) => isSection(row[0]))
  const lines = [], sections = []
  let block = false, series = 0
  const closeBlock = () => { if (block) { lines.push(']'); block = false } }
  if (start >= 0) {
    for (const row of rows.slice(start)) {
      if (/^(summa|tid|datum|grupp|nästa tävling)\b/i.test(row[0])) { closeBlock(); break }
      const section = row[0]
      const set = row[setColumn]
      if (section) {
        closeBlock()
        sections.push(section)
        if (lines.length) lines.push('')
        lines.push(section)
      }
      // A repeat is a separate cell, never the number in a heading like Insim 2.
      if (template && /^\d+\s*[x×]$/i.test(row[1])) {
        closeBlock()
        lines.push(`${row[1]} [`)
        block = true
      }
      if (set) {
        const details = row.slice(setColumn + 1, template ? 8 : 4).filter(Boolean)
        lines.push(`${block ? '  ' : ''}${[set, ...details].join(' · ')}`)
        series += 1
      }
    }
    closeBlock()
  } else {
    // Unfamiliar layouts remain inspectable and require an explicit selection.
    lines.push(...rows.filter((row) => row.some(Boolean)).map((row) => row.filter(Boolean).join(' · ')))
  }
  const warmupOnly = series > 0 && sections.length > 0 && sections.every(isWarmup)
  const kind = warmupOnly ? 'warmup' : template && series > 0 ? 'workout' : 'review'
  const warnings = []
  if (kind === 'warmup') warnings.push('Bara insimsvarianter hittades. Fliken är inte vald som ett helt pass.')
  if (kind === 'review') warnings.push('Okänd mall. Kontrollera innehållet och välj fliken själv om den är ett helt pass.')
  const distanceMeters = number(total?.[2])
  const durationMinutes = number(rows[timeIndex]?.[1]) || (timeIndex >= 0 ? number(rows[timeIndex + 1]?.[0]) : '')
  if (kind === 'workout' && !distanceMeters) warnings.push('Total distans saknas. Fyll i den om den är känd.')
  if (kind === 'workout' && !durationMinutes) warnings.push('Tidsåtgång saknas. Fyll i den om den är känd.')
  if (rows.some((row) => row.some((cell) => /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NUM!|NAME\?)/.test(cell)))) warnings.push('Fliken innehåller formelfel. Kontrollera berörda värden mot originalet.')
  let title = header?.slice(0, 2).filter(Boolean).join(' · ') || sheetName
  if (!title.toLocaleLowerCase('sv-SE').includes(sheetName.toLocaleLowerCase('sv-SE'))) title += ` · ${sheetName}`
  const sourceDate = clean(dateRow?.[1]) || fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''
  if (title.length > 80) warnings.push('Rubriken har kortats till 80 tecken. Kontrollera namnet före publicering.')
  if (sourceDate && !validDate(sourceDate)) warnings.push('Datumet kunde inte läsas säkert. Välj rätt datum för träningen.')
  const content = lines.join('\n').trim()
  const competitions = rows.slice(0, Math.max(0, start)).filter((row) => row[3] && !/nästa tävling/i.test(row[3]) && /\d/.test(row[8] || '')).map((row) => `${row[3]} ${row[8]}`)
  if (content.length > 5000) warnings.push('Passet är längre än 5 000 tecken och måste kortas före publicering. Hela texten visas för granskning.')
  return {
    key: `sheet-${index}`, sheetName, kind, selected: kind === 'workout', warnings,
    draft: { title: title.slice(0, 80), content, note: `${competitions.length ? `Kommande tävlingar: ${competitions.join(' · ')}.\n` : ''}Importerat från ${fileName} · flik ${sheetName}.`.slice(0, 500), distanceMeters, durationMinutes, focus: /\bf2\b/i.test(fileName) ? 'f2_spec' : '', date: validDate(sourceDate) ? sourceDate : '', timeOfDay: /morgon|förmiddag/i.test(`${fileName} ${title}`) ? 'morning' : /eftermiddag|kväll/i.test(`${fileName} ${title}`) ? 'afternoon' : '' },
  }
}

export function parseSwimWorkbook(buffer, fileName = 'Träningspass.xlsx') {
  if (!buffer?.length || buffer.length > SWIM_WORKBOOK_MAX_BYTES) throw new Error('Välj ett kalkylblad under 3 MB.')
  let workbook
  try { workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 301, cellHTML: false }) }
  catch { throw new Error('Kalkylbladet kunde inte läsas. Kontrollera att filen är ett giltigt XLS- eller XLSX-dokument utan lösenord.') }
  if (workbook.SheetNames.length > SWIM_WORKBOOK_MAX_SHEETS) throw new Error('Filen har fler än 20 flikar. Dela dokumentet före importen.')
  const sheets = [], skippedSheets = []
  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet?.['!ref']) { skippedSheets.push({ sheetName, reason: 'Tom flik' }); return }
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'])
    if (range.e.r >= 300 || range.e.c >= 32) throw new Error(`Fliken ${sheetName} är större än 300 rader eller 32 kolumner. Begränsa filen före importen så att inget innehåll tappas.`)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }).map((row) => row.map(clean))
    if (!rows.some((row) => row.some(Boolean))) { skippedSheets.push({ sheetName, reason: 'Tom flik' }); return }
    const entry = readSheet(rows, sheetName, fileName, index)
    if (workbook.Workbook?.Sheets?.[index]?.Hidden) { entry.selected = false; entry.warnings.push('Dold flik. Kontrollera innan du väljer den.') }
    sheets.push(entry)
  })
  if (!sheets.length) throw new Error('Inga flikar med innehåll hittades i dokumentet.')
  return { fileName, sheets, skippedSheets }
}
