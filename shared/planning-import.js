import { planningAddDays, planningMonday } from './weekly-planning.js'

export const PLANNING_GROUPS = { junior: 'Junior', ungdom_svart: 'Ungdom Svart', ungdom_orange: 'Ungdom Orange' }
export const validPlanningDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export function isoWeek(date) {
  const thursday = planningAddDays(planningMonday(date), 3)
  const year = Number(thursday.slice(0, 4))
  return { year, week: 1 + Math.round((Date.parse(`${planningMonday(date)}T12:00:00Z`) - Date.parse(`${planningMonday(`${year}-01-04`)}T12:00:00Z`)) / 604800000) }
}
export function isoWeekMonday(year, week) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(week) || week < 1 || week > 53) throw new Error('Välj ett giltigt år och veckonummer.')
  const monday = planningAddDays(planningMonday(`${year}-01-04`), (week - 1) * 7)
  if (isoWeek(monday).year !== year) throw new Error(`År ${year} har inte vecka ${week}.`)
  return monday
}
export const MAX_PLANNING_IMPORT_WEEKS = 4
// Match each group independently. Two group calendars need not share a time.
export const planningGroupChoices = (row, group, choices) => row.activityType === 'swim' ? choices.filter(choice => choice.date === row.date && choice.timeOfDay === row.timeOfDay && choice.groups.includes(group)) : []
export function defaultPlanningCalendars(row, groups, choices) {
  const nearby = row.activityType === 'swim' && choices.some(choice => choice.date === row.date && choice.timeOfDay === row.timeOfDay && choice.groups.some(group => groups.includes(group)))
  return Object.fromEntries(groups.map(group => {
    const matches = planningGroupChoices(row, group, choices)
    return [group, matches.length === 1 ? matches[0].key : matches.length || nearby ? 'unresolved' : 'none']
  }))
}
export function planningImportMondays(year, week, count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PLANNING_IMPORT_WEEKS) throw new Error('Välj 1–4 veckor åt gången.')
  const first = isoWeekMonday(year, week)
  const mondays = Array.from({ length: count }, (_, index) => planningAddDays(first, index * 7))
  if (mondays.some(date => isoWeek(date).year > 2100)) throw new Error('Välj ett år till och med 2100.')
  return mondays
}
export function validatePlanningSelection({ groups, mondays }, groupLabels = PLANNING_GROUPS) {
  if (!Array.isArray(groups) || !groups.length) throw Object.assign(new Error('Inga grupper följde med från tränarvyn. Kontrollera gruppvalet i toppmenyn.'), { status: 400 })
  if (groups.length > 20 || new Set(groups).size !== groups.length || groups.some(group => !Object.hasOwn(groupLabels, group))) throw Object.assign(new Error('En vald grupp är inte längre aktiv eller känns inte igen. Uppdatera gruppvalet i toppmenyn och försök igen.'), { status: 400 })
  if (!Array.isArray(mondays) || !mondays.length || mondays.length > MAX_PLANNING_IMPORT_WEEKS || new Set(mondays).size !== mondays.length || mondays.some(date => !validPlanningDate(date) || Number(date.slice(0, 4)) < 2000 || Number(date.slice(0, 4)) > 2100 || planningMonday(date) !== date || isoWeek(date).year < 2000 || isoWeek(date).year > 2100)) throw Object.assign(new Error('Välj 1–4 giltiga veckor före analysen.'), { status: 400 })
  return { groups: [...groups], mondays: [...mondays].sort() }
}
export function planningDriveId(value) {
  const text = String(value || '').trim()
  const match = text.match(/^https:\/\/(?:docs\.google\.com\/spreadsheets|drive\.google\.com\/file)\/d\/([a-zA-Z0-9_-]+)(?:[/?#].*)?$/)
  const id = match?.[1] || (/^[a-zA-Z0-9_-]{8,160}$/.test(text) ? text : '')
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(id)) throw new Error('Ange en Google Kalkylark-/Drive-länk eller välj fil i mappen.')
  return id
}
export function validatePlanningDraft(input, groupLabels = PLANNING_GROUPS) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
  if (!Array.isArray(input) || !input.length || input.length > 20) fail('Välj 1–20 veckor åt gången.')
  const seen = new Set()
  return input.map(week => {
    if (!validPlanningDate(week.monday) || planningMonday(week.monday) !== week.monday) fail('En vecka måste börja på en giltig måndag.')
    const groups = [...new Set(week.groups || [])]
    if (!groups.length || groups.length > 20 || groups.some(group => !Object.hasOwn(groupLabels, group))) fail('En vald grupp saknas eller är inte längre aktiv. Kontrollera berörda grupper för veckan.')
    for (const group of groups) {
      const key = `${week.monday}|${group}`
      if (seen.has(key)) fail('Samma vecka och grupp förekommer flera gånger. Välj bara ett underlag för gruppen.')
      seen.add(key)
    }
    if (!['add', 'replace'].includes(week.mode)) fail('Välj komplettera eller ersätt grundplan.')
    if (!Array.isArray(week.sessions) || !week.sessions.length || week.sessions.length > 40) fail('Varje vald vecka behöver 1–40 planeringsrader.')
    const sessions = week.sessions.map(row => {
      if (!validPlanningDate(row.date) || planningMonday(row.date) !== week.monday) fail('Alla pass måste ligga inom sin valda vecka.')
      if (!['swim', 'strength', 'dryland', 'competition'].includes(row.activityType)) fail('Välj giltig aktivitetstyp.')
      if (!['morning', 'afternoon'].includes(row.timeOfDay)) fail('Välj morgon eller eftermiddag för varje pass.')
      if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 100) fail('Varje pass behöver en rubrik på högst 100 tecken.')
      for (const [key, maximum] of [['distanceMeters', 30000], ['durationMinutes', 600]]) {
        if (row[key] !== null && row[key] !== '' && row[key] !== undefined && (!Number.isInteger(Number(row[key])) || Number(row[key]) < 1 || Number(row[key]) > maximum)) fail('Meter och minuter måste vara positiva heltal inom rimliga gränser.')
      }
      if (row.calendarKey !== undefined && (typeof row.calendarKey !== 'string' || row.calendarKey.length > 2000)) fail('Ogiltig kalenderkoppling.')
      if (row.calendarByGroup !== undefined && (!row.calendarByGroup || typeof row.calendarByGroup !== 'object' || Array.isArray(row.calendarByGroup) || Object.keys(row.calendarByGroup).length !== groups.length || groups.some(group => !Object.hasOwn(row.calendarByGroup, group) || typeof row.calendarByGroup[group] !== 'string' || !row.calendarByGroup[group] || row.calendarByGroup[group].length > 2000) || Object.keys(row.calendarByGroup).some(group => !groups.includes(group)))) fail('Välj kalenderkoppling för varje berörd grupp.')
      return { date: row.date, activityType: row.activityType, timeOfDay: row.timeOfDay, title: row.title.trim(), focus: String(row.focus || '').slice(0, 80), distanceMeters: row.distanceMeters ? Number(row.distanceMeters) : null, durationMinutes: row.durationMinutes ? Number(row.durationMinutes) : null, notes: String(row.notes || '').slice(0, 500), calendarKey: row.calendarKey || '', ...(row.calendarByGroup ? { calendarByGroup: { ...row.calendarByGroup } } : {}), separate: row.separate === true }
    })
    return { monday: week.monday, groups, mode: week.mode, sessions }
  })
}
