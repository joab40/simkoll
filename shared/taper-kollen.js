import { validPlanningDate } from './planning-import.js'

export const TAPER_PRIORITIES = [['A', 'A · Huvudmål'], ['B', 'B · Viktig tävling'], ['C', 'C · Förberedande tävling']]
export const taperDays = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
export function normalizeTaperGoal(input, competition) {
  const fail = text => { throw Object.assign(new Error(text), { status: 400 }) }
  if (!competition || input.competitionId !== competition.id) fail('Välj en tävling i kalendern.')
  if (!TAPER_PRIORITIES.some(([value]) => value === input.priority)) fail('Välj prioritet A, B eller C.')
  if (!validPlanningDate(input.targetDate) || input.targetDate < competition.start_date || input.targetDate > competition.end_date) fail('Välj viktigaste tävlingsdag inom tävlingens datum.')
  const taperStart = input.taperStart || null
  if (taperStart && (!validPlanningDate(taperStart) || taperStart > input.targetDate || taperDays(taperStart, input.targetDate) > 56)) fail('Lättningens start ska ligga före eller på måldagen, högst åtta veckor före. Detta är en planeringsgräns, inte en rekommenderad längd.')
  for (const [key, limit] of [['events', 200], ['note', 600]]) if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > limit)) fail(`Kontrollera ${key === 'events' ? 'målgrenar (högst 200 tecken)' : 'noteringen (högst 600 tecken)'}.`)
  if (input.enabled != null && typeof input.enabled !== 'boolean') fail('Ogiltig målstatus.')
  return { competitionId: competition.id, title: competition.title, competitionStart: competition.start_date, competitionEnd: competition.end_date, priority: input.priority, targetDate: input.targetDate, taperStart, events: (input.events || '').trim(), note: (input.note || '').trim(), enabled: input.enabled !== false }
}
export function latestTaperGoals(revisions) {
  const latest = new Map()
  for (const row of revisions) if (!latest.has(row.competitionId)) latest.set(row.competitionId, row)
  return [...latest.values()]
}
export function buildTaperSummary({ goals = [], form, asOf }, selectedId) {
  const upcoming = goals.filter(goal => goal.enabled && goal.targetDate >= asOf).sort((a, b) => a.targetDate.localeCompare(b.targetDate))
  const goal = upcoming.find(item => item.competitionId === selectedId) || upcoming.find(item => item.priority === 'A') || upcoming[0] || null
  if (!goal) return { goal: null, upcoming, stage: 'Välj individuella måltävlingar', label: 'Målet styr tolkningen', reason: 'Ange prioritet, målgrenar och eventuell planerad lättning. Ingen toppningsfas antas utan mål.', tone: 'neutral', prompts: [], conflicts: [] }
  const days = taperDays(asOf, goal.targetDate)
  const stage = days === 0 ? 'Måldagen är idag' : !goal.taperStart ? 'Lättningens start är inte angiven' : goal.taperStart > asOf ? 'Inför planerad lättning' : 'Inom planerad lättningsperiod'
  const conflicts = upcoming.filter(item => item.competitionId !== goal.competitionId && item.priority === 'A' && goal.priority === 'A' && Math.abs(taperDays(item.targetDate, goal.targetDate)) <= 21).map(item => `${item.title} är också A-mål inom 21 dagar. Diskutera om målen ska dela toppningsperiod eller prioriteras olika.`)
  const next = upcoming[0]
  if (next && next.competitionId !== goal.competitionId && next.targetDate < goal.targetDate) conflicts.push(`${next.title} (${next.priority}) kommer före valt mål. Väg in tävlingsdagar, resa och återhämtning; anta inte full toppning till båda.`)
  const flags = form?.flags || [], current = form?.current
  let label = 'Aktuellt underlag behöver kompletteras', reason = 'Fler färska svarsdagar och jämförbara prestationer behövs. Kalendern beskriver planen, inte bekräftad form.', tone = 'neutral'
  if (flags.length) { label = 'Uppföljning före prestationsråd'; reason = flags[0]; tone = 'watch' }
  else if (current && form.illnessAvailable !== false) {
    const enough = ['body', 'feeling', 'speed'].every(key => current[key]?.days >= 2)
    const fast = current.speed?.days >= 1 && current.speed.value >= 4
    const heavy = current.body?.days >= 2 && current.body.value <= 2.5
    if (fast && heavy) { label = 'Positiv fartkänsla – kroppen känns tung'; reason = 'Signalerna går åt olika håll. Följ upp tröttheten och jämför likvärdiga fartmoment innan planen justeras.'; tone = 'mixed' }
    else if (enough && ['body', 'feeling', 'speed'].every(key => current[key].value >= 4)) { label = 'Positiva rapporterade signaler'; reason = 'Kropp, dagskänsla och fartkänsla skattas högt. Det är inte bevis på tävlingsberedskap eller en prognos om formtoppsdag.'; tone = 'positive' }
    else if (fast) { label = 'Positiv fartobservation – följ helheten'; reason = 'Hög fartkänsla finns, men bekräftar inte uppmätt fart eller att lättningen är lagom.'; tone = 'mixed' }
  }
  const prompts = flags.length ? ['Följ upp den angivna signalen med simmaren före diskussion om ökad intensitet eller tävlingsberedskap.'] : [
    goal.priority === 'A' ? 'Diskutera hur nästa veckas mängd, fartmoment och styrka ska stödja huvudmålet – utifrån simmarens egen historik.' : 'Bestäm hur mycket denna tävling får påverka träningen inför senare A-mål.',
    'Jämför ett återkommande, likvärdigt fartmoment. Skilj subjektiv fartkänsla från uppmätt prestation.',
    'Följ upp kropp, dagskänsla och sömn efter nästa planerade förändring. Bestäm när ni omprövar planen.',
  ]
  return { goal, upcoming, days, stage, label, reason, tone, conflicts, prompts, coverage: form?.confidence || 'saknas' }
}

export const TAPER_DIALOG_QUESTION = 'Hjälp mig resonera om toppningen inför simmarens prioriterade tävlingar. Skilj plan från observerat svar. Beskriv vad som stöds och saknas, möjliga alternativ för kommande veckor och vad vi bör följa upp innan vi ändrar träningen. Ge ingen säker formprognos eller automatisk planändring.'
