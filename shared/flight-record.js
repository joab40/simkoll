import { coachWeekAddDays } from './coach-week.js'
import { comparableSwimTimes, isTimeDate, parseTrainingTime } from './swim-times.js'
import { diaryEntryLoad } from './training-load.js'

export const FLIGHT_HISTORY_DAYS = 90
export const FLIGHT_PERIODS = [14, 28, 90]

function finite(value, min, max = Infinity) {
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

function sum(values) {
  const known = values.filter(value => value != null)
  return known.length ? Math.round(known.reduce((total, value) => total + value, 0) * 10) / 10 : null
}

function mean(values) {
  const known = values.filter(value => value != null)
  return known.length ? Math.round(known.reduce((total, value) => total + value, 0) / known.length * 10) / 10 : null
}

export function flightRecordDays(start, end, diary, sleep = []) {
  const days = new Map((diary?.current?.days ?? []).map(day => [day.date, day]))
  const entriesByDate = new Map()
  for (const entry of diary?.entries ?? []) {
    if (!['completed', 'feedback'].includes(entry.state)) continue
    if (['competition', 'rest', 'sick', 'reflection'].includes(entry.type)) continue
    if (!entriesByDate.has(entry.date)) entriesByDate.set(entry.date, [])
    entriesByDate.get(entry.date).push(entry)
  }
  const nights = new Map(sleep.filter(row => !row.skipped).map(row => [row.activity_date, row]))
  const output = []
  for (let date = start; date <= end; date = coachWeekAddDays(date, 1)) {
    const daily = days.get(date)
    const entries = entriesByDate.get(date) ?? []
    const completed = entries.filter(entry => entry.state === 'completed')
    const load = completed.map(diaryEntryLoad).filter(item => item.value != null)
    const night = nights.get(date)
    output.push({
      date,
      speedFeeling: mean(entries.filter(entry => entry.type === 'swim').map(entry => finite(entry.speedFeeling, 1, 5))),
      feeling: finite(daily?.feeling, 1, 5),
      body: finite(daily?.body, 1, 5),
      energy: finite(daily?.energy, 1, 5),
      motivation: finite(daily?.motivation, 1, 5),
      passRating: finite(daily?.passRating, 1, 5),
      setupRating: finite(daily?.setupRating, 1, 5),
      temperature: finite(daily?.temperature, 1, 5),
      rpe: mean(completed.map(entry => finite(entry.rpe, 1, 10))),
      sessions: completed.length || null,
      reportedMeters: finite(daily?.swimMeters, 1),
      estimatedMeters: finite(daily?.estimatedSwimMeters, 1),
      reportedMinutes: finite(daily?.minutes, 1),
      estimatedMinutes: sum(completed.map(entry => finite(entry.estimatedMinutes, 1, 1440))),
      load: sum(load.map(item => item.value)),
      loadCount: load.length,
      loadEstimatedCount: load.filter(item => item.source === 'estimated').length,
      sleepMinutes: finite(night?.minutes, 0, 840),
      sleepQuality: [1, 3, 5].includes(night?.quality) ? night.quality : null,
    })
  }
  return output
}

function racePool(value) {
  const label = String(value || '').trim().toLowerCase()
  if (/^25(?:\s*m)?$/.test(label) || label === 'kortbana') return 25
  if (/^50(?:\s*m)?$/.test(label) || label === 'långbana') return 50
  return null
}

function bestPerDay(points) {
  const byDate = new Map()
  for (const point of points) {
    const previous = byDate.get(point.date)
    const count = (previous?.count ?? 0) + 1
    byDate.set(point.date, { ...(previous && previous.centis <= point.centis ? previous : point), count })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function flightTimeSeries(practice, races, origins = new Map()) {
  const usablePractice = practice.filter(row => isTimeDate(row.result_date) && Number.isInteger(row.result_time) && row.result_time > 0)
  const series = comparableSwimTimes(usablePractice).map(group => ({
    key: 'practice:' + group.key,
    label: group.description,
    kind: group.items[0].kind === 'test' ? 'test' : 'training',
    points: bestPerDay(group.items.map(row => ({
      date: row.result_date,
      centis: row.result_time,
      source: origins.get(row.id) === 'coach' ? 'Registrerat av tränare'
        : origins.get(row.id) === 'swimmer' ? 'Registrerat av simmaren' : 'Rapporterad tid',
    }))),
  }))
  const raceGroups = new Map()
  for (const row of races) {
    if (!isTimeDate(row.result_date) || !row.event?.trim()) continue
    const centis = Number.isInteger(row.result_time) && row.result_time > 0 ? row.result_time : parseTrainingTime(row.swim_time)
    if (centis == null) continue
    const pool = racePool(row.pool)
    const source = row.source === 'tempus' ? 'Tempus' : row.source === 'manual' ? 'Manuellt resultat' : 'Tävlingsresultat'
    // Unknown pool lengths never become a comparable series.
    const event = row.event.trim().replace(/\s+/g, ' ')
    const key = 'race:' + JSON.stringify(pool ? [event.toLocaleLowerCase('sv-SE'), pool, source] : [row.id])
    const group = raceGroups.get(key) ?? { key, kind: 'race', label: `${event} · ${pool ? pool + ' m bassäng' : 'bassäng saknas'} · ${source}`, points: [] }
    group.points.push({ date: row.result_date, centis, source, competition: row.competition_name || null })
    raceGroups.set(key, group)
  }
  for (const group of raceGroups.values()) series.push({ ...group, points: bestPerDay(group.points) })
  return series.sort((a, b) => Number(b.points.length > 1) - Number(a.points.length > 1)
    || b.points.at(-1).date.localeCompare(a.points.at(-1).date)
    || a.label.localeCompare(b.label, 'sv'))
}

export function flightTimeComparison(points, date) {
  const index = points.findIndex(point => point.date === date)
  if (index <= 0) return null
  return points[index - 1].centis - points[index].centis
}
