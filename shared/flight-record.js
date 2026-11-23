import { coachWeekAddDays } from './coach-week.js'
import { comparableSwimTimes, isTimeDate, parseTrainingTime } from './swim-times.js'
import { diaryEntryLoad } from './training-load.js'
import { swimMeterDay } from './swim-meter-day.js'
import { competitionBuilding } from './competition-building.js'

export const FLIGHT_HISTORY_DAYS = 90
export const FLIGHT_PERIODS = [14, 28, 90]

export function flightCompetitionJourney(competitions, asOf) {
  return competitions.filter(item => item?.id && item.title && isTimeDate(item.startDate)).map(item => {
    const endDate = isTimeDate(item.endDate) && item.endDate >= item.startDate ? item.endDate : item.startDate
    const status = endDate < asOf ? 'past' : item.startDate <= asOf ? 'current' : 'upcoming'
    const building = competitionBuilding(item)
    return { id: item.id, title: item.title, startDate: item.startDate, endDate, status, building, championship: building !== 'regional' }
  }).sort((a, b) => a.startDate.localeCompare(b.startDate))
}

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

function taperObservation(dayEntries, completed, load) {
  if (dayEntries.some(entry => entry.type === 'sick' && entry.state === 'status')) return { kind: 'sick' }
  if (dayEntries.some(entry => entry.type === 'competition' && entry.state === 'completed')) return null
  if (!completed.length) {
    return dayEntries.some(entry => entry.type === 'rest' && entry.state === 'status')
      && !dayEntries.some(entry => entry.state === 'feedback' && entry.type !== 'reflection')
      ? { kind: 'rest', meters: 0, load: 0, sessions: 0, rpe: null }
      : null
  }
  const rpe = completed.map(entry => finite(entry.rpe, 1, 10))
  return {
    kind: 'training',
    meters: swimMeterDay(dayEntries).swimMetersPlot,
    load: load.length === completed.length ? sum(load.map(item => item.value)) : null,
    rpe: rpe.some(value => value == null) ? null : mean(rpe),
    sessions: completed.length,
  }
}

export function flightRecordDays(start, end, diary, sleep = []) {
  const days = new Map((diary?.current?.days ?? []).map(day => [day.date, day]))
  const entriesByDate = new Map()
  for (const entry of diary?.entries ?? []) {
    if (!entriesByDate.has(entry.date)) entriesByDate.set(entry.date, [])
    entriesByDate.get(entry.date).push(entry)
  }
  const nights = new Map(sleep.filter(row => !row.skipped).map(row => [row.activity_date, row]))
  const output = []
  for (let date = start; date <= end; date = coachWeekAddDays(date, 1)) {
    const daily = days.get(date)
    const dayEntries = entriesByDate.get(date) ?? []
    const entries = dayEntries.filter(entry => ['completed', 'feedback'].includes(entry.state) && !['competition', 'rest', 'sick', 'reflection'].includes(entry.type))
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
      taperObservation: taperObservation(dayEntries, completed, load),
      sleepMinutes: finite(night?.minutes, 0, 840),
      sleepQuality: [1, 3, 5].includes(night?.quality) ? night.quality : null,
    })
  }
  return output
}

export function racePool(value) {
  const label = String(value || '').trim().toLowerCase()
  if (/^25(?:\s*m(?:eter)?)?$/.test(label) || label === 'kortbana') return 25
  if (/^50(?:\s*m(?:eter)?)?$/.test(label) || label === 'långbana') return 50
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
  const series = comparableSwimTimes(usablePractice).map(group => {
    const sample = group.items[0]
    const conditions = sample.conditions?.trim().toLocaleLowerCase('sv-SE')
    const comparableToRace = sample.exercise === 'full' && !sample.equipment?.length
      && (!conditions || conditions === 'tävlingsdräkt')
    return {
      key: 'practice:' + group.key,
      label: group.description,
      kind: sample.kind === 'test' ? 'test' : 'training',
      raceReference: comparableToRace
        ? { distance: sample.distance_meters, stroke: sample.stroke, pool: sample.pool_length } : null,
      points: bestPerDay(group.items.map(row => ({
        date: row.result_date,
        centis: row.result_time,
        source: origins.get(row.id) === 'coach' ? 'Registrerat av tränare'
          : origins.get(row.id) === 'swimmer' ? 'Registrerat av simmaren' : 'Rapporterad tid',
      }))),
    }
  })
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
