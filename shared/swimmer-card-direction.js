import { comparableSwimTimes } from './swim-times.js'

export const directionUnavailable = (label = 'För lite underlag för riktning') => ({ state: 'insufficient', label, detail: label })
export const directionDay = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
const mean = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length

export function programActivityDirection(sessions, profileId, type, today) {
  if (!Array.isArray(sessions)) return directionUnavailable('Träningsunderlaget är inte hämtat')
  const start = directionDay(today, -6), previousStart = directionDay(today, -13)
  const days = new Set(sessions.filter((row) => row.profileId === profileId && row.type === type && row.date >= previousStart && row.date <= today).map((row) => row.date))
  const current = [...days].filter((date) => date >= start).length, previous = [...days].filter((date) => date < start).length
  const counts = `${current} registrerade pass senaste 7 dagarna · ${previous} föregående 7 dagar`
  if (!current || !previous) return { ...directionUnavailable(counts), detail: `${counts}. Riktning visas när båda perioderna innehåller registrerade pass. Saknade registreringar visar inte säkert att simmaren avstått från träning.` }
  return { state: current > previous ? 'up' : current < previous ? 'down' : 'steady', label: counts, detail: `${counts}. Pilen visar kontinuitet i registrerad ${type === 'strength' ? 'styrketräning' : 'landträning'}, även utanför det tilldelade programmet. Den mäter inte styrka eller teknik. Fler pass behöver inte vara bättre.` }
}

export function sleepDirection(records, today) {
  const start = directionDay(today, -6), previousStart = directionDay(today, -13)
  const days = new Map()
  for (const row of records || []) {
    if (!row.skipped && row.activity_date >= previousStart && row.activity_date <= today && Number.isFinite(row.minutes) && row.minutes >= 0 && [1, 3, 5].includes(row.quality)) days.set(row.activity_date, row)
  }
  const current = [...days.values()].filter((row) => row.activity_date >= start), previous = [...days.values()].filter((row) => row.activity_date < start)
  if (current.length < 3 || previous.length < 3) return directionUnavailable('Riktning kräver minst 3 sömnsvar i vardera 7-dagarsperioden')
  const change = mean(current, 'quality') - mean(previous, 'quality'), minutes = Math.round(mean(current, 'minutes') - mean(previous, 'minutes'))
  const state = change >= .4 ? 'up' : change <= -.4 ? 'down' : 'steady'
  const label = state === 'up' ? 'Sömnkänslan har ökat' : state === 'down' ? 'Sömnkänslan har minskat' : 'Liknande sömnkänsla'
  return { state, label, detail: `${label}: senaste 7 dagarna (${current.length} svar) jämfört med föregående 7 (${previous.length} svar). Genomsnittlig sovtid har ${minutes > 0 ? `ökat ${minutes} minuter` : minutes < 0 ? `minskat ${Math.abs(minutes)} minuter` : 'inte ändrats'}. Pilen följer upplevd sömnkvalitet på skalan 1–5, med gränsen 0,4. Längre sovtid bedöms inte automatiskt som bättre.` }
}

export function swimTimesDirection(rows, limited = false) {
  if (limited) return directionUnavailable('Välj en kortare period för en fullständig jämförelse')
  const changes = []
  for (const group of comparableSwimTimes((rows || []).filter((row) => Number.isFinite(row.result_time) && row.result_time > 0))) {
    const days = new Map()
    for (const row of group.items) days.set(row.result_date, Math.min(days.get(row.result_date) ?? Infinity, row.result_time))
    const latest = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 2)
    if (latest.length !== 2) continue
    const difference = latest[1][1] - latest[0][1], threshold = Math.max(10, latest[1][1] * .005)
    changes.push(Math.abs(difference) < threshold ? 'steady' : difference > 0 ? 'up' : 'down')
  }
  if (!changes.length) return directionUnavailable('Minst två datum med jämförbara tider behövs')
  const faster = changes.filter((state) => state === 'up').length, slower = changes.filter((state) => state === 'down').length, steady = changes.length - faster - slower
  const state = faster && slower ? 'mixed' : faster ? 'up' : slower ? 'down' : 'steady'
  const label = changes.length === 1 ? `Senaste jämförbara tiden är ${faster ? 'snabbare' : slower ? 'långsammare' : 'liknande'}` : `${faster} snabbare · ${slower} långsammare · ${steady} liknande serier`
  return { state, label, detail: `${label}. Bästa tiden på det senaste datumet jämförs med bästa tiden på föregående datum i varje serie under vald period. Gren, bassäng, typ av tid, start, utförande, hjälpmedel, tidtagning och extra förutsättningar måste stämma. Förändringar under 0,5 procent eller 0,10 sekunder räknas som liknande. Övriga serier saknar jämförelse.` }
}
