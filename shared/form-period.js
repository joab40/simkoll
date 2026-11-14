import { coachWeekAddDays as add } from './coach-week.js'
import { trainingHeartAfterReports, trainingHeartLoad } from './training-heart.js'
import { illnessDays, validIllnessDay } from './illness.js'
import { buildLiveForm, formLiveEndOfDay } from './form-live.js'

export const FORM_PERIODS = [2, 7, 14, 28, 90]
export const FORM_HISTORY_DAYS = 180
const round = value => value == null ? null : Math.round(value * 10) / 10
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const inRange = (date, start, end) => validIllnessDay(date) && date >= start && date <= end
const fmt = value => value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
export const formPeriodMinimumDays = days => days === 2 ? 2 : Math.max(3, Math.ceil(days * .3))

function periodMetric(rows, field, start, end, weighted) {
  const daily = new Map()
  for (const row of rows) if (Number.isFinite(row[field]) && row[field] >= 1 && row[field] <= 5) {
    if (!daily.has(row.date)) daily.set(row.date, [])
    daily.get(row.date).push(row[field])
  }
  const dates = [...daily.keys()].sort()
  const weight = date => weighted ? date === end ? .6 : .4 : 1
  const denominator = dates.reduce((sum, date) => sum + weight(date), 0)
  const value = dates.length ? dates.reduce((sum, date) => sum + mean(daily.get(date)) * weight(date), 0) / denominator : null
  return { value: round(value), days: dates.length, start, end, lastDay: dates.at(-1) || null, latestDayMissing: !daily.has(end), weighted: weighted && dates.length === 2 }
}

function windowStats(data, start, end, days) {
  const rows = (data.responses || []).filter(row => inRange(row.date, start, end))
  const swims = trainingHeartAfterReports(rows).filter(row => row.activityType === 'swim')
  const metrics = Object.fromEntries([['body', 'body', rows], ['feeling', 'feeling', rows], ['speed', 'speedFeeling', swims]].map(([key, field, source]) => [key, periodMetric(source, field, start, end, days === 2)]))
  const nights = [...new Map((data.sleep || []).filter(row => inRange(row.activity_date, start, end) && !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map(row => [row.activity_date, row])).values()]
  const illness = illnessDays(data.illness || [], start, end)
  // Identical report grouping and safe planned-time fallback as the latest-state analysis.
  const load = trainingHeartLoad(rows)
  return { metrics, load, sleep: { nights: nights.length, minutes: round(mean(nights.map(row => row.minutes))), quality: round(mean(nights.map(row => row.quality))), poorNights: nights.filter(row => row.quality === 1).length, lastDay: nights.map(row => row.activity_date).sort().at(-1) || null },
    illness: { answeredDays: illness.length, mildDays: illness.filter(row => row.status === 'mild').length, sickDays: illness.filter(row => row.status === 'sick').length, sickReportDays: new Set(rows.filter(row => row.type === 'sick').map(row => row.date)).size } }
}

export function buildFormPeriods(data, asOf, options = {}) {
  // Validate even an empty source; no Date rollover or arbitrary query range.
  if (!validIllnessDay(asOf)) throw new Error('Ogiltigt datum för Formkollen.')
  const now = options.now || formLiveEndOfDay(asOf)
  return Object.fromEntries(FORM_PERIODS.map(days => {
    if (days === 2) return [days, buildLiveForm(data, now)]
    const start = add(asOf, 1 - days), previousEnd = add(start, -1), previousStart = add(start, -days)
    const current = windowStats(data, start, asOf, days), previous = windowStats(data, previousStart, previousEnd, days)
    const minimumDays = formPeriodMinimumDays(days)
    const directions = Object.fromEntries(['body', 'feeling', 'speed'].map(key => {
      const now = current.metrics[key], before = previous.metrics[key]
      const comparable = now.days >= minimumDays && before.days >= minimumDays
      const delta = comparable ? round(now.value - before.value) : null
      const state = delta == null ? 'unknown' : delta >= .5 ? 'up' : delta <= -.5 ? 'down' : 'steady'
      return [key, { state, delta, label: delta == null ? 'Jämförelse saknas' : `${delta > 0 ? '+' : ''}${fmt(delta)} /5`, detail: `Nu: ${now.days} av ${days} svarsdagar. Föregående: ${before.days} av ${days}. Minst ${minimumDays} svarsdagar i vardera perioden krävs för trend. ${days === 2 ? 'Samma 60/40-viktning används i båda perioderna.' : 'Varje dags genomsnitt väger lika.'}` }]
    }))
    const coveredLoad = load => load.known >= (days === 2 ? 2 : 3) && load.days >= minimumDays && load.total > 0 && load.known / load.total >= .8
    const comparableLoad = coveredLoad(current.load) && coveredLoad(previous.load) && previous.load.value > 0
    const load = { ...current.load, previous: previous.load, ratio: comparableLoad ? current.load.value / previous.load.value : null }
    return [days, { days, start, end: asOf, previousStart, previousEnd, minimumDays, ...current, load, previous, directions }]
  }))
}

export function summarizeFormPeriod(period, latest) {
  const { metrics, directions, minimumDays, days } = period
  const live = period.mode === 'latest-answers'
  const count = key => live ? metrics[key].fresh ? metrics[key].answers : 0 : metrics[key].days
  const known = ['body', 'feeling', 'speed'].filter(key => count(key) >= minimumDays)
  const up = known.filter(key => directions[key].state === 'up'), down = known.filter(key => directions[key].state === 'down')
  const provisional = known.length < 3 || Object.values(directions).some(item => item.state === 'unknown')
  let phase = 'unknown', label = 'Begränsat underlag för perioden'
  let reason = 'Rapporterade värden visas, men det finns för få svarsdagar för en samlad periodtolkning.'
  if (count('body') >= minimumDays && count('feeling') >= minimumDays) {
    phase = 'mixed'; label = Object.values(directions).every(item => item.state === 'unknown') ? 'Periodens rapporterade känslor' : 'Liknande eller blandade känsloskattningar'
    reason = 'Periodens kropp-, dags- och fartkänsla behöver läsas var för sig. Det här är inte en bedömning av formen idag.'
    if (up.length && down.length) { label = 'Känslorna utvecklas åt olika håll'; reason = 'Vissa känsloskattningar har ökat och andra minskat mot föregående lika långa period.' }
    else if (down.length) { phase = 'loaded'; label = 'Lägre känsloskattningar under perioden'; reason = 'Minst ett mått har minskat mot föregående lika långa period. Det betyder inte automatiskt sämre simprestation.' }
    else if (up.length) { phase = 'improving'; label = 'Högre känsloskattningar under perioden'; reason = 'Minst ett mått har ökat mot föregående lika långa period, utan en jämförbar minskning i de andra.' }
    else if (known.length === 3 && known.every(key => metrics[key].value >= 4.5)) { label = 'Höga känsloskattningar under perioden'; reason = 'Kropp, dagskänsla och simfartkänsla skattas högt i underlaget. Det bekräftar inte toppform eller aktuell återhämtning.' }
  }
  if (live && (count('body') < 2 || count('feeling') < 2)) reason = 'De senaste svaren visas med sina datum. För få eller för gamla svar för en aktuell samlad tolkning; äldre svar är inte dagens känsla.'
  if (live) {
    if (label === 'Högre känsloskattningar under perioden') label = 'Högre känsla i de senaste svaren'
    else if (label === 'Lägre känsloskattningar under perioden') label = 'Lägre känsla i de senaste svaren'
    else if (label === 'Höga känsloskattningar under perioden') label = 'Höga känsloskattningar just nu'
    else if (label === 'Begränsat underlag för perioden') label = 'Begränsat aktuellt svarsunderlag'
    else if (label === 'Periodens rapporterade känslor') label = 'Senaste rapporterade känslor'
    reason = reason.replaceAll('föregående lika långa period', 'de två föregående svaren per mått').replace('Periodens kropp-', 'De senaste svarens kropp-').replace('Det här är inte en bedömning av formen idag.', 'Självskattningar, inte uppmätt form.')
  }
  const confidence = known.length === 3 && !provisional ? 'gott' : count('body') >= minimumDays && count('feeling') >= minimumDays ? 'måttligt' : 'begränsat'
  if (latest.flags.length) { phase = 'watch'; reason += ' En aktuell uppföljningssignal finns separat nedan.' }
  return { phase, label, reason, provisional, confidence, caption: live ? 'Just nu · de två senaste svaren' : `${days} dagar · ${days === 7 ? 'veckans signaler' : days === 14 ? 'kortsiktig utveckling' : days === 28 ? 'träningsblock' : 'långsiktiga mönster'}` }
}
