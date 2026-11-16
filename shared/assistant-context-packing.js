// Lossless JSON representation, not an AI summary. No strings are shortened,
// no sources are merged and no rows are filtered. Values in dictionaries are
// scoped to their column: numeric values and dictionary indexes cannot collide.
export const ASSISTANT_CONTEXT_FORMAT = 'simkoll-tables-v1'
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length
const owns = (object, key) => Object.hasOwn(object, key)

function table(records) {
  const fields = Object.keys(records[0] || {})
  const constantPairs = [], dictionaryPairs = [], columns = [], cells = records.map(() => [])
  for (const field of fields) {
    const values = records.map(row => row[field]), signatures = values.map(value => JSON.stringify(value))
    if (records.length > 1 && signatures.every(value => value === signatures[0])) { constantPairs.push([field, values[0]]); continue }
    columns.push(field)
    const unique = new Map(), dictionary = [], indexes = signatures.map((key, index) => {
      if (!unique.has(key)) { unique.set(key, dictionary.length); dictionary.push(values[index]) }
      return unique.get(key)
    })
    const useDictionary = dictionary.length < values.length && bytes(dictionary) + bytes(indexes) + bytes(field) + 16 < bytes(values)
    if (useDictionary) dictionaryPairs.push([field, dictionary])
    for (let index = 0; index < records.length; index++) cells[index].push(useDictionary ? indexes[index] : values[index])
  }
  return { fields, columns, constants: Object.fromEntries(constantPairs), dictionaries: Object.fromEntries(dictionaryPairs), rows: cells }
}
function readTable(encoded, cells) {
  if (cells.length !== encoded.columns.length) throw new Error('Ogiltig kompakt tabellrad.')
  const values = new Map(encoded.columns.map((field, index) => {
    if (!owns(encoded.dictionaries, field)) return [field, cells[index]]
    const dict = encoded.dictionaries[field], pointer = cells[index]
    if (!Number.isInteger(pointer) || pointer < 0 || pointer >= dict.length) throw new Error('Ogiltig kompakt värdereferens.')
    return [field, dict[pointer]]
  }))
  return Object.fromEntries(encoded.fields.map(field => [field, owns(encoded.constants, field) ? encoded.constants[field] : values.get(field)]))
}
function groupByShape(rows, key) {
  const groups = new Map()
  rows.forEach((row, index) => { const shape = key(row); if (!groups.has(shape)) groups.set(shape, []); groups.get(shape).push({ row, index }) })
  return [...groups.values()]
}
export function packAssistantContext(context) {
  if (context?.format === ASSISTANT_CONTEXT_FORMAT) return context
  // The previous wire protocol already used JSON serialization. Normalizing here
  // preserves that exact value domain, including absent vs null fields.
  const original = JSON.parse(JSON.stringify(context))
  const { sources, daily, ...metadata } = original
  if (!Array.isArray(sources) || !Array.isArray(daily)) throw new Error('Analysunderlagets tabeller saknas.')
  const sourceTables = groupByShape(sources, row => JSON.stringify([row.category, row.label, Object.keys(row.data)])).map(group => {
    const first = group[0].row, encoded = table(group.map(item => item.row.data))
    return { category: first.category, label: first.label, ...encoded, rows: encoded.rows.map((cells, index) => {
      const item = group[index], { id, category, label, date, data, ...extra } = item.row
      return [item.index, id, date, cells, ...(Object.keys(extra).length ? [extra] : [])]
    }) }
  })
  const dailyTables = groupByShape(daily, row => JSON.stringify(Object.keys(row))).map(group => {
    const encoded = table(group.map(item => item.row))
    return { ...encoded, rows: encoded.rows.map((cells, index) => [group[index].index, cells]) }
  })
  const packed = { format: ASSISTANT_CONTEXT_FORMAT, metadata, sourceCount: sources.length, sourceTables, dailyCount: daily.length, dailyTables }
  return bytes(packed) < bytes(original) ? packed : original
}
export function unpackAssistantContext(wire) {
  if (wire?.format !== ASSISTANT_CONTEXT_FORMAT) return wire
  const sources = [], daily = []
  for (const encoded of wire.sourceTables) for (const [index, id, date, cells, extra = {}] of encoded.rows) {
    if (!Number.isInteger(index) || index < 0 || index >= wire.sourceCount || owns(sources, index)) throw new Error('Ogiltig källordning i kompakt underlag.')
    sources[index] = { id, category: encoded.category, label: encoded.label, date, data: readTable(encoded, cells), ...extra }
  }
  for (const encoded of wire.dailyTables) for (const [index, cells] of encoded.rows) {
    if (!Number.isInteger(index) || index < 0 || index >= wire.dailyCount || owns(daily, index)) throw new Error('Ogiltig dagsordning i kompakt underlag.')
    daily[index] = readTable(encoded, cells)
  }
  if (Object.keys(sources).length !== wire.sourceCount || Object.keys(daily).length !== wire.dailyCount) throw new Error('Det kompakta underlaget är ofullständigt.')
  return { ...wire.metadata, sources, daily }
}
export function assistantPackingStats(context, wire = packAssistantContext(context)) {
  const originalContextBytes = bytes(context), packedContextBytes = bytes(wire)
  const categories = context.categories.map(category => ({ key: category.key, label: category.label, records: category.records,
    sourceBytes: bytes(context.sources.filter(source => source.category === category.key)),
    packedSourceBytes: bytes(wire.format === ASSISTANT_CONTEXT_FORMAT ? wire.sourceTables.filter(encoded => encoded.category === category.key) : context.sources.filter(source => source.category === category.key)),
  }))
  return { version: 1, originalContextBytes, packedContextBytes, savedBytes: originalContextBytes - packedContextBytes, allFetchedRecordsIncluded: true, categories }
}
