import { coachWeekAddDays as add } from './coach-week.js'
import { buildTrainingHeart, trainingHeartAfterReports, trainingHeartLoad } from './training-heart.js'
import { illnessDays } from './illness.js'
import { currentFormContext } from './form-context.js'
import { buildFormPeriods, FORM_HISTORY_DAYS } from './form-period.js'

// These are adjustable product heuristics for dialogue, not physiological limits.
export const FORM_RULES = { baselineWeeks: 4, reports: 3, reportDays: 2, coverage: .8, trend: .5 }
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null
const round = n => n == null ? null : Math.round(n * 10) / 10
const valid = n => Number.isFinite(n) && n >= 1 && n <= 5
const enoughLoad = load => load.known >= FORM_RULES.reports && load.days >= FORM_RULES.reportDays && load.total > 0 && load.known / load.total >= FORM_RULES.coverage

function metric(rows, key, start, end) {
  const days = new Map()
  for (const row of rows) if (row.date >= start && row.date <= end && valid(row[key])) {
    if (!days.has(row.date)) days.set(row.date, [])
    days.get(row.date).push(row[key])
  }
  const dates = [...days.keys()].sort()
  return { value: round(mean([...days.values()].map(mean))), days: dates.length, lastDay: dates.at(-1) || null, start, end }
}
const change = (current, previous, minimum) => current.days >= minimum && previous.days >= minimum ? round(current.value - previous.value) : null

export function buildFormKollen(data = {}, asOf, options = {}) {
  // Reuse the existing validated date, report grouping, load estimation and warning rules.
  const heart = buildTrainingHeart(data, asOf), start = add(asOf, 1 - FORM_HISTORY_DAYS)
  const responses = (data.responses || []).filter(row => row.date >= start && row.date <= asOf)
  const swims = trainingHeartAfterReports(responses).filter(row => row.activityType === 'swim')
  const measures = (from, to) => ({ body: metric(responses, 'body', from, to), feeling: metric(responses, 'feeling', from, to), speed: metric(swims, 'speedFeeling', from, to) })
  const current = measures(add(asOf, -2), asOf), earlier = measures(add(asOf, -6), add(asOf, -3))
  const week = measures(add(asOf, -6), asOf), previous = measures(add(asOf, -13), add(asOf, -7))
  const trends = Object.fromEntries(['body', 'feeling', 'speed'].map(key => [key, { short: change(current[key], earlier[key], 2), week: change(week[key], previous[key], 3) }]))
  // Five disjoint weeks BEFORE the current seven days. Never compare a week to itself.
  const baseline = Array.from({ length: 5 }, (_, i) => {
    const end = add(asOf, -7 * (i + 1)), load = buildTrainingHeart(data, end).load
    return { start: add(end, -6), end, ...load, comparable: enoughLoad(load) }
  })
  const baselineWeeks = baseline.filter(item => item.comparable)
  const normalLoad = baselineWeeks.length >= 2 ? round(mean(baselineWeeks.map(item => item.value))) : null
  const loadRatio = normalLoad > 0 && enoughLoad(heart.load) ? heart.load.value / normalLoad : null
  const illness = illnessDays(data.illness || [], start, asOf).at(-1) || null
  const nights = [...new Map((data.sleep || []).filter(row => !row.skipped && row.activity_date >= add(asOf, -2) && row.activity_date <= asOf && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map(row => [row.activity_date, row])).values()]
  const sleep = { nights: nights.length, minutes: round(mean(nights.map(row => row.minutes))), quality: round(mean(nights.map(row => row.quality))), lastDay: nights.map(row => row.activity_date).sort().at(-1) || null,
    positive: nights.length >= 2 && nights.every(row => row.minutes >= 480 && row.quality >= 3) && mean(nights.map(row => row.quality)) >= 4 }
  const history = Array.from({ length: 90 }, (_, i) => {
    const date = add(asOf, i - 89), daily = measures(date, date)
    // Daily load is separate from the seven-day total. Missing remains null.
    const dailyLoad = trainingHeartLoad(responses.filter(row => row.date === date))
    return { date, body: daily.body.value, feeling: daily.feeling.value, speed: daily.speed.value, load: dailyLoad.value, estimated: dailyLoad.estimated }
  })
  return evaluateFormSignals({ asOf, current, week, previous, trends, sleep, illness, illnessAvailable: data.illnessAvailable !== false,
    load: { ...heart.load, baseline, baselineWeeks: baselineWeeks.length, normalLoad, ratio: loadRatio },
    context: currentFormContext(data.context, asOf),
    flags: [...heart.warnings, ...(heart.heavy.persistent ? ['Ihållande tung kropp- eller dagskänsla – ta en dialog.'] : [])], history, periods: buildFormPeriods(data, asOf, options) })
}

export function formMetricDirection(trend, current) {
  const known = [trend.short, trend.week].filter(value => value != null)
  if (!known.length) return { state: 'unknown', preliminary: true, label: current.days ? `${current.days === 1 ? 'Senast' : 'Aktuellt snitt'} ${current.value.toLocaleString('sv-SE')}/5 · ${current.days} svarsdag${current.days === 1 ? '' : 'ar'}` : 'Svar saknas', detail: 'För få svarsdagar för trend. Det aktuella värdet är en observation, inte en riktning.' }
  const up = known.some(value => value >= .5), down = known.some(value => value <= -.5)
  const state = up && down ? 'mixed' : up ? 'up' : down ? 'down' : 'steady'
  const preliminary = known.length < 2
  return { state, preliminary, label: `${({ up: 'Ökar', down: 'Minskar', mixed: 'Blandad', steady: 'Liknande' })[state]}${preliminary ? ' · preliminärt' : ''}`,
    detail: `Kort jämförelse: ${trend.short == null ? 'för få dagar' : `${trend.short > 0 ? '+' : ''}${trend.short.toLocaleString('sv-SE')} /5`}. Veckojämförelse: ${trend.week == null ? 'för få dagar' : `${trend.week > 0 ? '+' : ''}${trend.week.toLocaleString('sv-SE')} /5`}. Riktningen gäller bara detta mått, inte tävlingsprestation.` }
}

export function evaluateFormSignals(observations) {
  const { asOf, current, trends, sleep, illness, illnessAvailable, load } = observations
  const flags = [...observations.flags]
  const decline = ['body', 'feeling', 'speed'].filter(key => trends[key].short <= -.5 && trends[key].week <= -.5)
  if (decline.length >= 2) flags.push('Flera rapporterade känslor har minskat både på kort sikt och mellan veckorna.')
  const illnessCurrent = illnessAvailable && illness && illness.activity_date >= add(asOf, -1)
  const illnessClear = illnessCurrent && illness.status === 'none'
  const currentKnown = ['body', 'feeling', 'speed'].every(key => current[key].days >= 2)
  const baselineKnown = load.baselineWeeks >= FORM_RULES.baselineWeeks && load.normalLoad != null
  const good = currentKnown && sleep.nights >= 2 && illnessCurrent && load.ratio != null && baselineKnown
  const confidence = good ? 'gott' : current.body.days >= 2 && current.feeling.days >= 2 ? 'måttligt' : 'begränsat'
  const rising = ['body', 'feeling', 'speed'].filter(key => trends[key].short >= .5 && trends[key].week >= .5)
  const falling = ['body', 'feeling', 'speed'].filter(key => trends[key].short != null && trends[key].week != null && (trends[key].short <= -.5 || trends[key].week <= -.5))
  const direction = rising.length && falling.length ? 'mixed' : rising.length ? 'up' : decline.length ? 'down' : Object.values(trends).some(trend => trend.short != null && trend.week != null) ? 'steady' : 'unknown'
  const metricDirections = Object.fromEntries(['body', 'feeling', 'speed'].map(key => [key, formMetricDirection(trends[key], current[key])]))
  const provisional = !baselineKnown || !currentKnown || load.ratio == null
  const enoughMood = current.body.days >= 2 && current.feeling.days >= 2
  const fastObservation = current.speed.days >= 1 && current.speed.value >= 4
  const heavy = current.body.days >= 2 && current.body.value <= 2.5 || current.feeling.days >= 2 && current.feeling.value <= 2.5
  const performance = observations.context?.recentPerformance
  let phase = 'unknown', label = 'Begränsat aktuellt underlag', reason = 'Fler aktuella svarsdagar behövs för en tolkning. Det som faktiskt rapporterats visas nedan.'
  if (flags.length) { phase = 'watch'; label = 'Behöver uppföljning'; reason = flags[0] }
  else if (!illnessAvailable) reason = 'Sjukdomskollen kunde inte hämtas. Ingen positiv formtolkning görs från ofullständiga källor.'
  else if (enoughMood) {
    if (heavy) {
      phase = performance || fastObservation ? 'mixed' : 'loaded'
      label = performance ? 'Positiva prestationsuppgifter – kroppen känns tung' : fastObservation ? 'Hög fartkänsla – kroppen känns tung' : 'Kroppen eller dagskänslan känns tung'
      reason = performance ? 'Tränaren rapporterar personbästa den senaste veckan. Det är en tränaruppgift, inte en verifierad resultatjämförelse. Samtidigt skattas kroppen eller dagskänslan lågt.' : fastObservation ? `Senaste fartkänslan är hög, men kroppen eller dagskänslan skattas lågt. ${current.speed.days < 2 ? 'En svarsdag räcker inte för att fastställa en farttrend.' : 'Det är olika signaler, inte en gemensam nedgång i prestation.'}` : 'Låga aktuella känsloskattningar återkommer på flera svarsdagar. Det bekräftar inte nedträning.'
    } else if (illnessClear && sleep.positive && ['body', 'feeling', 'speed'].every(key => current[key].value >= 4.5)) {
      if (currentKnown) { phase = 'positive'; label = 'Starka positiva formsignaler'; reason = 'Hög kropp-, dags- och fartkänsla sammanfaller med positiva sömnsvar. Upplevda signaler – inte verifierad toppform.' }
      else { phase = 'mixed'; label = 'Positiva aktuella observationer'; reason = 'Känslorna skattas högt, men det finns för få svarsdagar för en stark positiv signal.' }
    } else if (illnessClear && currentKnown && direction === 'up' && ['body', 'feeling', 'speed'].every(key => current[key].value >= 3)) {
      phase = 'improving'; label = 'Positiva signaler på väg upp'; reason = 'Minst en känsla har ökat både på kort sikt och mellan veckorna, utan en motsatt trend i de andra. Inte uppmätt fartförbättring.'
    } else if (performance) {
      phase = 'mixed'; label = 'Positiva prestationsuppgifter'; reason = 'Tränaren rapporterar personbästa den senaste veckan. Simmarens aktuella värden visas separat; uppgiften bekräftar inte toppform.'
    } else if (fastObservation) {
      phase = 'mixed'; label = 'Positiv fartobservation'; reason = 'Senaste fartkänslan är hög. Övriga signaler och antalet svarsdagar behöver läsas var för sig; en hög skattning är inte ett verifierat fartresultat.'
    } else { phase = 'mixed'; label = 'Blandade signaler'; reason = 'Kropp, dagskänsla, fart och sömn ger inget entydigt positivt mönster. Läs delvärdena tillsammans med simmaren.' }
  }
  if (!illnessClear && !flags.length) reason += ' Ett aktuellt giltigt Nej i sjukdomskollen saknas; saknat svar betyder inte frisk.'
  return { ...observations, flags, phase, label, reasons: [reason], direction, metricDirections, confidence, baselineKnown, provisional,
    limitations: ['Fartkänsla är subjektiv. Tränaruppgifter är inte verifierade farttester eller en prognos om formtopp.', 'Täckningen avser registrerade efterrapporter, inte bevis på att hela träningsveckan är rapporterad.'] }
}
