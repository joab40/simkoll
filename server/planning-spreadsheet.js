import XLSX from 'xlsx'
import { isoWeekMonday } from '../shared/planning-import.js'
import { planningAddDays } from '../shared/weekly-planning.js'

const text = value => String(value ?? '').trim()
export function normalizePlanningSourceReference(sheet, reference) {
  if (typeof reference !== 'string' || reference.length > 1200) return ''
  const parts = reference.split(/[;,]/).map(value => value.trim())
  if (!parts.length || parts.length > 32) return ''
  const normalized = []
  for (let part of parts) {
    const separator = part.lastIndexOf('!')
    if (separator >= 0) {
      const name = part.slice(0, separator).replace(/^'(.*)'$/, '$1').replace(/''/g, "'").normalize('NFC')
      if (name !== sheet.name.normalize('NFC')) return ''
      part = part.slice(separator + 1)
    }
    part = part.replace(/\$/g, '').replace(/\s+/g, '').replace(/[-–—]/g, ':').toUpperCase()
    if (!/^[A-Z]{1,2}[1-9]\d{0,3}(?::[A-Z]{1,2}[1-9]\d{0,3})?$/.test(part)) return ''
    normalized.push(part)
  }
  return normalized.join(',')
}
export function validPlanningSourceReference(sheet, reference) {
  if (!sheet?.range) return false
  const normalized = normalizePlanningSourceReference(sheet, reference)
  if (!normalized) return false
  const bounds = XLSX.utils.decode_range(sheet.range)
  return normalized.split(',').every(value => {
    const range = XLSX.utils.decode_range(value)
    return range.s.r >= bounds.s.r && range.s.c >= bounds.s.c && range.e.r <= bounds.e.r && range.e.c <= bounds.e.c && range.e.r >= range.s.r && range.e.c >= range.s.c
  })
}
export function planningSourceReferenceHasContent(sheet, reference) {
  if (!validPlanningSourceReference(sheet, reference)) return false
  const ranges = normalizePlanningSourceReference(sheet, reference).split(',').map(value => XLSX.utils.decode_range(value))
  const inside = (cell, range) => cell.r >= range.s.r && cell.r <= range.e.r && cell.c >= range.s.c && cell.c <= range.e.c
  const cells = sheet.rows.flatMap(row => Object.keys(row.cells)).map(value => XLSX.utils.decode_cell(value))
  if (cells.some(cell => ranges.some(range => inside(cell, range)))) return true
  return (sheet.mergedCells || []).some(value => {
    const merge = XLSX.utils.decode_range(value)
    return cells.some(cell => cell.r === merge.s.r && cell.c === merge.s.c) && ranges.some(range => range.s.r <= merge.e.r && range.e.r >= merge.s.r && range.s.c <= merge.e.c && range.e.c >= merge.s.c)
  })
}
export function openPlanningSpreadsheet(bytes) {
  if (!bytes?.length || bytes.length > 3 * 1024 * 1024 || !(bytes[0] === 0x50 && bytes[1] === 0x4b || bytes[0] === 0xd0 && bytes[1] === 0xcf)) throw new Error('Välj en riktig XLS/XLSX-fil under 3 MB.')
  let workbook
  try { workbook = XLSX.read(bytes, { type: 'buffer', cellHTML: false, cellStyles: false, cellFormula: true, sheetRows: 1001 }) } catch { throw new Error('Excel-filen kunde inte läsas. Spara om den som XLSX.') }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 20) throw new Error('Filen får innehålla högst 20 flikar.')
  return workbook
}
export function inspectPlanningSpreadsheet(workbook, fileName) {
  return { fileName, sheets: workbook.SheetNames.map(name => ({ name, suggested: !/genomför|arkiv|archive|till?fällig|temporary|uppdelning/i.test(name) && workbook.Workbook?.Sheets?.find(sheet => sheet.name === name)?.Hidden !== 1, range: workbook.Sheets[name]['!ref'] || '' })) }
}
export function planningSource(workbook, names) {
  if (!Array.isArray(names) || !names.length || names.length > 5 || new Set(names).size !== names.length || names.some(name => !workbook.SheetNames.includes(name))) throw new Error('Välj 1–5 giltiga flikar att analysera.')
  let count = 0
  const sheets = names.map(name => {
    const sheet = workbook.Sheets[name], range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1')
    if (range.e.r >= 1000 || range.e.c >= 64) throw new Error(`Fliken ${name} är för stor. Välj eller exportera högst 1000 rader och 64 kolumner.`)
    const rows = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells = {}
      for (let c = range.s.c; c <= range.e.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c }), cell = sheet[address]
        if (!cell) continue
        if (cell.f && cell.v == null) throw new Error(`Formeln ${name}!${address} saknar sparat resultat. Öppna och spara filen i Excel först.`)
        const value = cell.t === 'e' ? '' : text(cell.w ?? cell.v)
        if (value) { cells[address] = value; count++ }
      }
      if (Object.keys(cells).length) rows.push({ row: r + 1, cells })
    }
    return { name, range: sheet['!ref'], mergedCells: (sheet['!merges'] || []).map(range => XLSX.utils.encode_range(range)), rows }
  })
  const source = JSON.stringify({ sheets })
  if (count > 10000 || source.length > 160000) throw new Error('De valda flikarna är för stora. Importera färre veckor åt gången.')
  return { sheets, source }
}

// Send values from selected sheets only: no other sheets, formulas, links or
// workbook metadata. Original cell addresses are retained for source checks.
export function planningModelFile(sheets, blocks = null) {
  const workbook = XLSX.utils.book_new()
  for (const source of sheets) {
    const ranges = blocks?.filter(block => block.sourceSheet === source.name).map(block => XLSX.utils.decode_range(block.sourceRange))
    if (ranges && !ranges.length) continue
    const sheet = {}
    const included = cell => !ranges || ranges.some(range => cell.r >= range.s.r && cell.r <= range.e.r && cell.c >= range.s.c && cell.c <= range.e.c)
    // Keep the closest group heading above each recognized table.
    const headings = new Set()
    for (const range of ranges || []) {
      const heading = source.rows.filter(row => row.row - 1 < range.s.r && Object.entries(row.cells).some(([address, value]) => XLSX.utils.decode_cell(address).c === range.s.c && /planering/i.test(value))).at(-1)
      if (heading) headings.add(XLSX.utils.encode_cell({ r: heading.row - 1, c: range.s.c }))
    }
    for (const row of source.rows) for (const [address, value] of Object.entries(row.cells)) {
      if (included(XLSX.utils.decode_cell(address)) || headings.has(address)) sheet[address] = { t: 's', v: value }
    }
    const addresses = Object.keys(sheet).map(address => XLSX.utils.decode_cell(address))
    if (!addresses.length) continue
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(...addresses.map(cell => cell.r)), c: Math.max(...addresses.map(cell => cell.c)) } })
    // Only retain merges whose populated anchor is in the scoped export.
    sheet['!merges'] = (source.mergedCells || []).map(value => XLSX.utils.decode_range(value)).filter(range => sheet[XLSX.utils.encode_cell(range.s)] && included(range.s) && included(range.e))
    XLSX.utils.book_append_sheet(workbook, sheet, source.name)
  }
  if (!workbook.SheetNames.length) throw new Error('Inget Excel-underlag hittades för urvalet.')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return { type: 'input_file', filename: 'vald-veckoplanering.xlsx', file_data: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${bytes.toString('base64')}` }
}

const dayIndex = value => ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'].findIndex(day => text(value).toLowerCase().startsWith(day.slice(0, 3)))
const groupsIn = value => {
  const s = text(value).toLowerCase(), groups = []
  if (/junior/.test(s)) groups.push('junior')
  if (/svart/.test(s)) groups.push('ungdom_svart')
  if (/orange/.test(s)) groups.push('ungdom_orange')
  return groups
}
// Known weekly table layout: each horizontal group block has Vecka / Dag,
// followed by morning and afternoon columns. Cell addresses stay visible.
export function parsePlanningTables(workbook, names, year) {
  const weeks = [], warnings = []
  for (const name of names) {
    const sourceYear = Number(name.match(/\b(20\d{2})\b/)?.[1] || year)
    const sheet = workbook.Sheets[name], range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    const at = (r, c) => text(sheet[XLSX.utils.encode_cell({ r, c })]?.v)
    for (let r = 0; r < range.e.r; r++) for (let c = 1; c <= range.e.c; c++) {
      if (!/^vecka$/i.test(at(r, c))) continue
      const weekNumber = Number(at(r + 1, c))
      if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) continue
      let monday
      try { monday = isoWeekMonday(sourceYear, weekNumber) } catch (error) { warnings.push(error.message); continue }
      let heading = ''
      for (let h = r; h >= 0; h--) {
        const candidate = at(h, c - 1)
        if (groupsIn(candidate).length && /planering/i.test(candidate)) { heading = candidate; break }
      }
      const groups = groupsIn(heading), sourceDateLabel = at(r + 1, c + 1)
      let header = -1
      for (let h = r + 2; h <= Math.min(r + 6, range.e.r); h++) if (/^dag$/i.test(at(h, c - 1))) { header = h; break }
      if (header < 0 || !groups.length) { warnings.push(`${name}, vecka ${weekNumber}: grupp eller tabellrubrik kunde inte identifieras.`); continue }
      const sessions = []; let day = -1
      const focusColumns = []
      for (let col = c; col < Math.min(c + 11, range.e.c + 1); col++) if (/inriktning/i.test(at(header, col))) focusColumns.push(col)
      if (!focusColumns.length) continue
      for (let row = header + 1; row <= Math.min(header + 12, range.e.r); row++) {
        const label = at(row, c - 1)
        if (/summa|vecka/i.test(label) || /^vecka$/i.test(at(row, c))) break
        const nextDay = dayIndex(label)
        if (nextDay >= 0) day = nextDay
        if (day < 0) continue
        for (const [slot, col] of focusColumns.entries()) {
          const title = at(row, col)
          if (!title || /^[-–—]$/.test(title) || /^(vila|ledigt)$/i.test(title)) continue
          const rawMeters = at(row, col + 2).replace(/\s/g, ''), meters = /^\d+(?:m)?$/i.test(rawMeters) ? Number(rawMeters.replace(/m$/i, '')) : null
          const note = [at(row, col + 1), at(row, col + 3) && `Banor: ${at(row, col + 3)}`, at(row, col + 4) && `Tränare: ${at(row, col + 4)}`].filter(Boolean).join(' · ')
          sessions.push({ date: planningAddDays(monday, day), activityType: 'swim', timeOfDay: slot ? 'afternoon' : 'morning', title, focus: title, distanceMeters: meters, durationMinutes: null, notes: note, sourceCells: `${XLSX.utils.encode_cell({ r: row, c: col })}:${XLSX.utils.encode_cell({ r: row, c: col + 4 })}` })
        }
      }
      const phase = at(r + 3, c - 1)
      const lastDay = Math.max(header, ...sessions.map(session => XLSX.utils.decode_cell(session.sourceCells.split(':')[0]).r))
      const footnotes = []
      for (let fr = lastDay + 1; fr <= Math.min(lastDay + 3, range.e.r); fr++) for (let fc = c; fc < Math.min(c + 10, range.e.c + 1); fc++) {
        const value = at(fr, fc)
        if (value && !/^summa|^vecka|^meter$/i.test(value) && /[a-zåäö]{4}/i.test(value) && !/november|oktober|inriktning|tränare|längd|banor/i.test(value)) footnotes.push(value)
      }
      for (const session of sessions) session.notes = [session.notes, phase && `Veckofokus: ${phase}`, ...new Set(footnotes)].filter(Boolean).join(' · ').slice(0, 500)
      if (sessions.length) weeks.push({ monday, groups, sessions, sourceSheet: name, sourceDateLabel, sourceRange: `${XLSX.utils.encode_cell({ r, c: c - 1 })}:${XLSX.utils.encode_cell({ r: Math.min(header + 10, range.e.r), c: Math.min(c + 9, range.e.c) })}`, warnings: [`Kontrollera datum mot källans ”${sourceDateLabel}”. År ${sourceYear} är valt.`, 'Flera rader på samma halvdag behandlas som passalternativ, inte extra träningsmängd.'] })
    }
  }
  return { weeks, warnings }
}
