import XLSX from 'xlsx'
import { isoWeekMonday } from '../shared/planning-import.js'
import { planningAddDays } from '../shared/weekly-planning.js'

const text = value => String(value ?? '').trim()
export function validPlanningSourceReference(sheet, reference) {
  if (!sheet?.range || !/^[A-Z]{1,2}[1-9]\d{0,3}(?::[A-Z]{1,2}[1-9]\d{0,3})?$/.test(String(reference || ''))) return false
  const bounds = XLSX.utils.decode_range(sheet.range), range = XLSX.utils.decode_range(reference)
  return range.s.r >= bounds.s.r && range.s.c >= bounds.s.c && range.e.r <= bounds.e.r && range.e.c <= bounds.e.c && range.e.r >= range.s.r && range.e.c >= range.s.c
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
    return { name, range: sheet['!ref'], rows }
  })
  const source = JSON.stringify({ sheets })
  if (count > 10000 || source.length > 160000) throw new Error('De valda flikarna är för stora. Importera färre veckor åt gången.')
  return { sheets, source }
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
        if (value && !/^summa|^vecka/i.test(value) && /[a-zåäö]{4}/i.test(value) && !/november|oktober|inriktning|tränare|längd|banor/i.test(value)) footnotes.push(value)
      }
      for (const session of sessions) session.notes = [session.notes, phase && `Veckofokus: ${phase}`, ...new Set(footnotes)].filter(Boolean).join(' · ').slice(0, 500)
      if (sessions.length) weeks.push({ monday, groups, sessions, sourceSheet: name, sourceDateLabel, sourceRange: `${XLSX.utils.encode_cell({ r, c: c - 1 })}:${XLSX.utils.encode_cell({ r: Math.min(header + 10, range.e.r), c: Math.min(c + 9, range.e.c) })}`, warnings: [`Kontrollera datum mot källans ”${sourceDateLabel}”. År ${sourceYear} är valt.`, 'Flera rader på samma halvdag behandlas som passalternativ, inte extra träningsmängd.'] })
    }
  }
  return { weeks, warnings }
}
