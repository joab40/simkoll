import { coachWeekAddDays } from './coach-week.js'
import { validIllnessDay } from './illness.js'

export const HEAVY_PATTERN_RULE = '2 = segt ger ingen uppföljningsvarning i sig. Rött för ihållande tung kropp eller tung dagskänsla kräver 1/5 på minst fem olika aktivitetsdagar under 14 dagar, i samma mått, med ett spann på minst åtta kalenderdagar och minst två sådana dagar de senaste tre dagarna. Flera svar samma dag räknas en gång. Saknade svar räknas inte som ettor eller som bevis på återhämtning. Detta är en justerbar produktregel för dialog, inte en medicinsk gräns.'

export function heavyTrainingPattern(responses, asOf) {
  if (!validIllnessDay(asOf)) throw new Error('Ogiltigt datum för tungt träningsmönster.')
  const start = coachWeekAddDays(asOf, -13), freshStart = coachWeekAddDays(asOf, -2)
  const date = row => String(row.date || row.activityDate || row.createdAt || '').slice(0, 10)
  const history = responses.filter(row => validIllnessDay(date(row)) && date(row) >= start && date(row) <= asOf)
  const metric = key => {
    const dates = [...new Set(history.filter(row => row[key] === 1).map(date))].sort()
    const freshDays = dates.filter(day => day >= freshStart).length
    const spanDays = dates.length ? Math.round((Date.parse(`${dates.at(-1)}T12:00:00Z`) - Date.parse(`${dates[0]}T12:00:00Z`)) / 86400000) + 1 : 0
    return { dates, freshDays, spanDays, persistent: dates.length >= 5 && spanDays >= 8 && freshDays >= 2 }
  }
  const body = metric('body'), feeling = metric('feeling')
  return { start, end: asOf, freshStart, body, feeling, persistent: body.persistent || feeling.persistent }
}
