import { diaryAddDays } from './training-diary.js'

export const TALK_PERIODS = [['since-last', 'Sedan förra samtalet · högst 12 månader'], ['3', 'Senaste 3 månaderna'], ['6', 'Senaste 6 månaderna'], ['12', 'Senaste 12 månaderna']]

export function talkHistoryStart(end, months) {
  const date = new Date(`${end}T12:00:00Z`), day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return diaryAddDays(date.toISOString().slice(0, 10), 1)
}

export const talkAgreementText = (agreement = {}) => typeof agreement.summary === 'string' ? agreement.summary : Object.values(agreement).filter((value) => typeof value === 'string').join('\n\n')
