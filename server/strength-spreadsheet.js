import XLSX from 'xlsx'

// Read Excel ourselves so AI receives cell values and coordinates rather than
// relying on attachment decoding. Never execute macros or recalculate formulas.
export function readStrengthSpreadsheet(bytes) {
  const zip = bytes.subarray(0, 2).toString('ascii') === 'PK'
  const ole = bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1'
  const xml = bytes.subarray(0, 1000).toString('utf8').includes('urn:schemas-microsoft-com:office:spreadsheet')
  if (!zip && !ole && !xml) throw new Error('Filen är inte en läsbar XLS/XLSX-fil. Öppna den i Excel och spara en ny kopia.')
  let workbook
  try {
    workbook = XLSX.read(bytes, { type: 'buffer', sheetRows: 1001, cellHTML: false, cellStyles: false, cellFormula: true })
  } catch {
    throw new Error('Excel-filen kunde inte öppnas. Kontrollera att den inte är skadad eller lösenordsskyddad, eller exportera till PDF.')
  }
  if (workbook.SheetNames.length > 20) throw new Error('Filen har fler än 20 blad. Dela upp styrkeprogrammet i mindre filer.')
  let cellsCount = 0
  const sheets = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet?.['!ref']) continue
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'])
    if (range.e.r >= 1000 || range.e.c >= 64) throw new Error(`Bladet ”${name}” är för stort. Begränsa det till 1 000 rader och 64 kolumner, eller dela filen.`)
    const rows = new Map()
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!') || !cell) continue
      if (cell.f && cell.v == null) throw new Error(`Bladet ”${name}” har formler utan sparade resultat. Öppna och spara filen i Excel eller exportera till PDF.`)
      if (cell.v == null) continue
      const value = XLSX.utils.format_cell(cell)
      if (!value.trim()) continue
      if (++cellsCount > 10000) throw new Error('Filen innehåller för många ifyllda celler. Dela upp programmet.')
      const row = XLSX.utils.decode_cell(address).r + 1
      if (!rows.has(row)) rows.set(row, {})
      rows.get(row)[address] = value
    }
    if (rows.size) sheets.push({ name, range: sheet['!ref'], mergedCells: (sheet['!merges'] || []).map((range) => XLSX.utils.encode_range(range)), rows: [...rows].sort(([a], [b]) => a - b).map(([row, cells]) => ({ row, cells })) })
  }
  if (!sheets.length) throw new Error('Excel-filen innehåller inga läsbara cellvärden.')
  const text = JSON.stringify({ format: 'Excel cellvärden', note: 'Tomma celler har inget värde. Celladresser och sammanslagningar bevarar tabellernas kolumner och passrubriker.', sheets })
  if (text.length > 120000) throw new Error('Excel-innehållet är för långt. Dela upp programmet i mindre filer.')
  return text
}
