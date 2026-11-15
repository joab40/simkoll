import { coachWeekAddDays as add } from './coach-week.js'
import { validIllnessDay, illnessDays } from './illness.js'
import { trainingHeartAfterReports, trainingHeartLoad } from './training-heart.js'

const round = value => value == null ? null : Math.round(value * 10) / 10
const valid = value => Number.isFinite(value) && value >= 1 && value <= 5
const stamp = row => Date.parse(row.submittedAt || row.createdAt || '')
const dayOf = row => row.date || row.activityDate
const newest = (a, b) => dayOf(b).localeCompare(dayOf(a)) || stamp(b) - stamp(a) || String(b.id || '').localeCompare(String(a.id || ''))
const currentDay = now => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(now))
export function formLiveEndOfDay(asOf) {
  const noon = new Date(`${asOf}T12:00:00Z`)
  const stockholmHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(noon))
  return new Date(Date.parse(`${add(asOf, 1)}T00:00:00Z`) - (stockholmHour - 12) * 3600000 - 1).toISOString()
}

export function liveAnswerRows(responses, now) {
  const end = currentDay(now), start = add(end, -179), time = Date.parse(now)
  const rows = responses.map(row => ({ ...row, date: dayOf(row) })).filter(row => validIllnessDay(row.date) && row.date >= start && row.date <= end && Number.isFinite(stamp(row)) && stamp(row) <= time && ['before', 'after', 'rest', 'sick'].includes(row.type))
  // Repeated corrections of the same check-in are not separate observations.
  return [...new Map(rows.slice().sort((a, b) => -newest(a, b)).map(row => [`${row.date}|${row.type}|${row.activityType || ''}|${row.trainingSlot || ''}`, row])).values()].sort(newest)
}

export function freshLiveAnswer(sample, now) {
  return Boolean(sample && sample.date >= add(currentDay(now), -1) && Date.parse(sample.submittedAt) <= Date.parse(now) && Date.parse(now) - Date.parse(sample.submittedAt) <= 48 * 3600000)
}

function measure(rows, field, now, offset = 0) {
  const samples = rows.filter(row => valid(row[field])).slice(offset, offset + 2).map(row => ({ value: row[field], date: row.date, submittedAt: new Date(stamp(row)).toISOString() }))
  return { value: samples.length === 2 ? round(samples[0].value * .6 + samples[1].value * .4) : samples[0]?.value ?? null, answers: samples.length, days: new Set(samples.map(row => row.date)).size, samples,
    lastDay: samples[0]?.date || null, lastAt: samples[0]?.submittedAt || null, start: samples.at(-1)?.date || null, end: samples[0]?.date || null, fresh: freshLiveAnswer(samples[0], now), weighted: samples.length === 2 }
}

function recentLoad(rows, offset) {
  const reports = trainingHeartAfterReports(rows).sort(newest).slice(offset, offset + 2)
  const samples = reports.slice().reverse().map(row => { const load = trainingHeartLoad([row]); return { date: row.date, submittedAt: new Date(stamp(row)).toISOString(), value: load.value, estimated: load.estimated } })
  return { ...trainingHeartLoad(reports), samples }
}

export function buildLiveForm(data, now) {
  const rows = liveAnswerRows(data.responses || [], now), swims = trainingHeartAfterReports(rows).filter(row => row.activityType === 'swim').sort(newest)
  const metricsFor = offset => Object.fromEntries([['body', 'body', rows], ['feeling', 'feeling', rows], ['speed', 'speedFeeling', swims]].map(([key, field, source]) => [key, measure(source, field, now, offset)]))
  const metrics = metricsFor(0), previousMetrics = metricsFor(2)
  const directions = Object.fromEntries(['body', 'feeling', 'speed'].map(key => {
    const current = metrics[key], previous = previousMetrics[key]
    const comparable = current.answers === 2 && previous.answers === 2 && current.fresh
    const delta = comparable ? round(current.value - previous.value) : null
    return [key, { state: delta == null ? 'unknown' : delta >= .5 ? 'up' : delta <= -.5 ? 'down' : 'steady', delta, label: delta == null ? 'Jämförelse saknas' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('sv-SE')} /5`, detail: 'De två senaste giltiga svaren för detta mått jämförs med de två före dem. Senaste svaret väger 60 %, näst senaste 40 % i båda paren. Efterregistrering hör till aktivitetsdagen. En trend är inte uppmätt prestation.' }]
  }))
  const load = recentLoad(rows, 0), previousLoad = recentLoad(rows, 2)
  const nights = [...new Map((data.sleep || []).filter(row => validIllnessDay(row.activity_date) && row.activity_date <= currentDay(now) && !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map(row => [row.activity_date, row])).values()].sort((a, b) => b.activity_date.localeCompare(a.activity_date)).slice(0, 2)
  const sleep = { nights: nights.length, minutes: nights.length ? round(nights.reduce((sum, row) => sum + row.minutes, 0) / nights.length) : null, quality: nights.length ? round(nights.reduce((sum, row) => sum + row.quality, 0) / nights.length) : null, poorNights: nights.filter(row => row.quality === 1).length, lastDay: nights[0]?.activity_date || null }
  const illnesses = illnessDays(data.illness || [], add(currentDay(now), -1), currentDay(now))
  return { days: 2, mode: 'latest-answers', fetchedAt: now, metrics, directions, minimumDays: 2, sleep,
    load: { ...load, previous: previousLoad, ratio: load.known === 2 && previousLoad.known === 2 && previousLoad.value > 0 ? load.value / previousLoad.value : null },
    previous: { metrics: previousMetrics, load: previousLoad },
    illness: { answeredDays: illnesses.length, mildDays: illnesses.filter(row => row.status === 'mild').length, sickDays: illnesses.filter(row => row.status === 'sick').length } }
}

export function swimmerSpeedSignal(responses, now = new Date().toISOString()) {
  const rows = trainingHeartAfterReports(liveAnswerRows(responses, now)).filter(row => row.activityType === 'swim' && valid(row.speedFeeling)).sort(newest)
  // Keep only the latest swimming answer on each activity day. No IDs or free text
  // are needed to refresh the bolt locally as its evidence ages.
  const days = [...new Map(rows.slice().reverse().map(row => [row.date, row])).values()].sort(newest).slice(0, 2)
  return refreshSwimmerSpeedSignal({ samples: days.map(row => ({ value: row.speedFeeling, date: row.date, submittedAt: new Date(stamp(row)).toISOString() })) }, now)
}

export function refreshSwimmerSpeedSignal(base, now = new Date().toISOString()) {
  const time = Date.parse(now), hour = 3600000
  // An after-registration cannot make an old activity fresh again. The activity
  // day has no exact training timestamp, so cap freshness at its end in Stockholm.
  const age = sample => Math.max(time - Date.parse(sample.submittedAt), time - Date.parse(formLiveEndOfDay(sample.date)))
  const samples = (base.samples || (base.value != null && base.date ? [base] : [])).filter(sample => valid(sample.value) && validIllnessDay(sample.date) && sample.date <= currentDay(now) && Number.isFinite(Date.parse(sample.submittedAt)) && Date.parse(sample.submittedAt) <= time)
  const sample = samples[0], value = sample?.value ?? null
  const fresh = Boolean(sample && age(sample) < 72 * hour)
  const recent = Boolean(fresh && age(sample) < 48 * hour)
  const level = !fresh ? 'unknown' : value >= 4.5 ? 'max' : value >= 3.5 ? 'high' : value >= 2.5 ? 'medium' : value >= 1.5 ? 'low' : 'quiet'
  const pair = samples.slice(0, 2)
  const repeated = recent && pair.length === 2 && pair[0].date !== pair[1].date && pair.every(item => age(item) < 72 * hour && item.value >= 4)
  const pulse = !repeated ? 'none' : pair.every(item => item.value === 5) ? 'max' : 'high'
  const daysAgo = sample ? Math.round((Date.parse(`${currentDay(now)}T12:00:00Z`) - Date.parse(`${sample.date}T12:00:00Z`)) / (24 * hour)) : null
  const ageLabel = !sample ? '' : daysAgo === 0 ? 'idag' : daysAgo === 1 ? 'igår' : daysAgo === 2 ? '2 dagar sedan' : new Date(`${sample.date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })
  const refreshAt = Math.min(Date.parse(formLiveEndOfDay(currentDay(now))) + 1, ...samples.flatMap(item => [Date.parse(item.submittedAt), Date.parse(formLiveEndOfDay(item.date))].flatMap(at => [at + 48 * hour, at + 72 * hour])).filter(at => at > time))
  const label = value == null ? 'Fartkänsla: aktuellt simsvar saknas' : `Senast rapporterad fartkänsla ${value.toLocaleString('sv-SE')}/5 · ${ageLabel}${fresh ? '' : ' · äldre svar'}. ${pulse === 'none' ? '' : `Återkommande hög fartkänsla på två olika simdagar; ${pulse === 'max' ? 'två femmor' : 'båda minst 4/5'}. `}Självskattad, inte uppmätt fart eller bekräftad toppform.`
  return { value, fresh, recent, level, pulse, ageLabel, refreshAt, ...sample, samples, label }
}
