export const TIME_STROKES = { freestyle: 'Frisim', backstroke: 'Ryggsim', breaststroke: 'Bröstsim', butterfly: 'Fjärilsim', medley: 'Medley' }
export const TIME_STARTS = { push: 'Frånskjut', dive: 'Från pall', water: 'Start i vattnet' }
export const TIME_EXERCISES = { full: 'Hel simning', arms: 'Arm', legs: 'Ben' }
export const TIME_EQUIPMENT = { pull_buoy: 'Dolme', fins: 'Fenor', paddles: 'Paddlar', board: 'Platta', snorkel: 'Snorkel' }
export const TIME_METHODS = { hand: 'Handtid', electronic: 'Elektronisk tid' }
export const isTimeDate = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
export const isTimeId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export function parseTrainingTime(value) {
  const match = String(value ?? '').trim().replace(',', '.').match(/^(?:(\d{1,2}):)?(\d{1,3})(?:\.(\d{1,2}))?$/)
  if (!match || (match[1] && Number(match[2]) >= 60)) return null
  const result = Number(match[1] || 0) * 6000 + Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))
  return result > 0 && result <= 599999 ? result : null
}

export function formatTrainingTime(value) {
  const minutes = Math.floor(value / 6000), seconds = Math.floor(value % 6000 / 100), hundredths = value % 100
  return `${minutes ? `${minutes}:` : ''}${String(seconds).padStart(minutes ? 2 : 1, '0')},${String(hundredths).padStart(2, '0')}`
}

export function validateSwimTime(body, today) {
  const distance = Number(body.distance), pool = Number(body.poolLength), resultTime = parseTrainingTime(body.time)
  if (!isTimeDate(body.date) || body.date < '1900-01-01' || body.date > today) throw new Error('Välj ett giltigt datum till och med idag.')
  if (!Number.isInteger(distance) || distance < 1 || distance > 10000) throw new Error('Ange en distans mellan 1 och 10 000 meter.')
  if (![25, 50].includes(pool) || !Object.hasOwn(TIME_STROKES, body.stroke) || !Object.hasOwn(TIME_STARTS, body.startType) || !Object.hasOwn(TIME_EXERCISES, body.exercise) || !Object.hasOwn(TIME_METHODS, body.timingMethod) || !['training', 'test'].includes(body.kind)) throw new Error('Välj simsätt, bassäng och förutsättningar för tiden.')
  if (resultTime === null) throw new Error('Ange en giltig tid, till exempel 27,73 eller 1:08,42.')
  if (!Array.isArray(body.equipment) || body.equipment.some((item) => !Object.hasOwn(TIME_EQUIPMENT, item))) throw new Error('Kontrollera valda hjälpmedel.')
  const conditions = String(body.conditions || '').trim(), note = String(body.note || '').trim(), entryKey = String(body.entryKey || '').trim()
  if (conditions.length > 200 || note.length > 1000 || entryKey.length > 160) throw new Error('Förutsättningar får vara högst 200 tecken och kommentaren högst 1 000 tecken.')
  return { result_date: body.date, distance_meters: distance, stroke: body.stroke, pool_length: pool, result_time: resultTime, start_type: body.startType, exercise: body.exercise, equipment: [...new Set(body.equipment)].sort(), timing_method: body.timingMethod, kind: body.kind, conditions, note, entry_key: entryKey || null }
}

// Never compare unlike equipment, starts, exercise types or timing methods.
// Extra conditions also partition the series (e.g. resistance or assisted swimming).
export const swimTimeKey = (row) => JSON.stringify([row.distance_meters, row.stroke, row.pool_length, row.kind, row.start_type, row.exercise, [...(row.equipment || [])].sort(), row.timing_method, String(row.conditions || '').trim().toLocaleLowerCase('sv-SE')])
export const swimTimeDescription = (row) => [`${row.distance_meters} m ${TIME_STROKES[row.stroke]}`, `${row.pool_length} m bassäng`, row.kind === 'test' ? 'Testlopp' : 'Träningstid', TIME_STARTS[row.start_type], TIME_EXERCISES[row.exercise], ...(row.equipment || []).map((item) => TIME_EQUIPMENT[item]), TIME_METHODS[row.timing_method], row.conditions].filter(Boolean).join(' · ')

export function comparableSwimTimes(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = swimTimeKey(row)
    if (!groups.has(key)) groups.set(key, { key, description: swimTimeDescription(row), items: [] })
    groups.get(key).items.push(row)
  }
  return [...groups.values()].map((group) => ({ ...group, items: group.items.sort((a, b) => a.result_date.localeCompare(b.result_date) || String(a.created_at).localeCompare(String(b.created_at))), best: Math.min(...group.items.map((row) => row.result_time)) }))
}
