import { supabaseRequest } from './supabase.js'
import { loadTrainingDiary } from './training-diary.js'
import { loadSwimTimes } from './swim-times.js'
import { diaryAddDays, diaryMonday } from '../shared/training-diary.js'
import { formatTrainingTime, isTimeDate, parseTrainingTime, swimTimeDescription, swimTimeKey, TIME_STROKES } from '../shared/swim-times.js'
import { racePool } from '../shared/flight-record.js'
import { normalizeAssistantText } from './assistant-chat.js'

const shiftMonth = (day, offset) => {
  const date = new Date(day + 'T12:00:00Z')
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(lastDay, date.getUTCDate()))
  return target.toISOString().slice(0, 10)
}

export function assistantDataPeriod(topic, today) {
  for (const question of topic.split('\n').reverse()) {
    const range = readPeriod(normalizeAssistantText(question), today)
    if (range) return range
  }
  return null
}

function readPeriod(text, today) {
  const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match => match[0]).filter(isTimeDate)
  if (dates.length) {
    const [start, end = start] = dates.slice(-2).sort()
    return { start, end: text.includes('sedan') ? today : end }
  }
  const relative = text.match(/\b(?:senaste|sista)\s+(\d{1,3}|en|ett|tva|tre|fyra|sex|tolv)\s+(dag\w*|veck\w*|manad\w*|ar)\b/)
  if (relative) {
    const count = Number(relative[1]) || { en: 1, ett: 1, tva: 2, tre: 3, fyra: 4, sex: 6, tolv: 12 }[relative[1]]
    if (count > 0) {
      const unit = relative[2]
      const start = unit.startsWith('manad') || unit === 'ar'
        ? shiftMonth(today, -count * (unit === 'ar' ? 12 : 1))
        : diaryAddDays(today, 1 - count * (unit.startsWith('veck') ? 7 : 1))
      if (isTimeDate(start)) return { start, end: today }
    }
  }
  if (/\b(?:igar|i gar)\b/.test(text)) {
    const yesterday = diaryAddDays(today, -1)
    return { start: yesterday, end: yesterday }
  }
  if (/\bidag\b/.test(text)) return { start: today, end: today }
  if (/\b(?:forra|foregaende) veckan\b/.test(text)) return { start: diaryAddDays(diaryMonday(today), -7), end: diaryAddDays(diaryMonday(today), -1) }
  if (/\b(?:den har veckan|denna vecka|i veckan)\b/.test(text)) return { start: diaryMonday(today), end: today }

  const monthStart = today.slice(0, 8) + '01'
  if (/\b(?:forra|foregaende) manaden\b/.test(text)) return { start: shiftMonth(monthStart, -1), end: diaryAddDays(monthStart, -1) }
  if (/\b(?:den har manaden|denna manad|i manaden)\b/.test(text)) return { start: monthStart, end: today }
  const months = 'januari februari mars april maj juni juli augusti september oktober november december'.split(' ')
  const month = text.match(new RegExp(`\\b(?:i|under|for) (${months.join('|')})(?: ((?:19|20)\\d{2}))?\\b`))
  if (month) {
    const currentMonth = Number(today.slice(5, 7)), requestedMonth = months.indexOf(month[1]) + 1
    const year = month[2] || String(Number(today.slice(0, 4)) - Number(requestedMonth > currentMonth))
    const start = `${year}-${String(requestedMonth).padStart(2, '0')}-01`
    return { start, end: diaryAddDays(shiftMonth(start, 1), -1) }
  }
  const year = text.match(/\b(?:19\d{2}|20\d{2})\b/)?.[0]
  if (year || /\b(?:i ar|forra aret|i fjol)\b/.test(text)) {
    const selected = year || String(Number(today.slice(0, 4)) - Number(!text.includes('i ar')))
    return { start: selected + '-01-01', end: selected === today.slice(0, 4) ? today : selected + '-12-31' }
  }
  return null
}

function eventFilter(topic) {
  const text = normalizeAssistantText(topic)
  const names = [...Object.entries(TIME_STROKES), ['freestyle', 'fri'], ['freestyle', 'fritt']]
  const strokes = names.filter(([key, label]) => new RegExp(`\\b(?:${key}|${normalizeAssistantText(label)})\\b`).test(text))
  const poolText = /\b(25|50)\s*m(?:eter)?\s+bassang\b/
  const explicitPool = text.match(poolText)
  const pool = explicitPool ? Number(explicitPool[1]) : /\bkortbana\b/.test(text) ? 25 : /\blangbana\b/.test(text) ? 50 : null
  const distances = [...text.replace(poolText, '').matchAll(/\b(\d{2,4})(?=\s*(?:m\b|meter\b|fri\b|fritt\b|frisim\b|ryggsim\b|brostsim\b|fjarilsim\b|medley\b))/g)].map(m => Number(m[1]))
  return { distances, strokes, pool }
}

function matchesEvent({ distances, strokes, pool }, distance, stroke, course) {
  return (!distances.length || distances.includes(distance)) && (!pool || pool === course)
    && (!strokes.length || strokes.some(([key, label]) => stroke === key || stroke === normalizeAssistantText(label)
      || (key === 'medley' && stroke === 'individual medley')))
}

const invalidPeriod = { status: 'invalid_period' }
const periodOutside = (period, today) => period && (period.start > today || period.start > period.end)
const sortableDate = row => row.result_date || (row.result_year ? String(row.result_year) : '')
const descending = (a, b) => sortableDate(b).localeCompare(sortableDate(a))

function timeSelections(rows, key, centis, present) {
  const ordered = [...rows].sort(descending)
  const best = new Map()
  for (const row of ordered) {
    const time = centis(row), category = key(row)
    if (time > 0 && category && (!best.has(category) || centis(best.get(category)) > time)) best.set(category, row)
  }
  const bestRows = [...best.values()].sort(descending)
  return {
    matchingCount: rows.length,
    recent: ordered.slice(0, 24).map(present),
    bestByCategory: bestRows.slice(0, 36).map(present),
    recentLimited: ordered.length > 24,
    bestLimited: bestRows.length > 36,
  }
}

export async function assistantCompetitionResults(profile, topic, today, period) {
  if (periodOutside(period, today)) return invalidPeriod
  const range = period ? `&result_date=gte.${period.start}&result_date=lte.${period.end < today ? period.end : today}` : ''
  const rows = [], owner = encodeURIComponent(profile.id)
  let limited = true
  for (let offset = 0; offset < 6000; offset += 500) {
    const result = await supabaseRequest(`competition_results?profile_id=eq.${owner}${range}&select=event,pool,swim_time,result_time,result_date,result_year,competition_name,source,aqua_points&order=result_date.desc.nullslast,id.desc&limit=500&offset=${offset}`)
    if (!result.ok) throw new Error('Competition results unavailable')
    const page = await result.json()
    rows.push(...page)
    if (page.length < 500) { limited = false; break }
  }
  const filter = eventFilter(topic)
  const parts = row => normalizeAssistantText(row.event || '').trim().match(/^(\d+)\s*(?:meter\s+|m\s+)?(.+)$/)
  const shorterNames = rows.map(row => normalizeAssistantText(row.competition_name || '').trim())
  const normalizedTopic = normalizeAssistantText(topic)
  const namedMeets = new Set(shorterNames.filter(name => name.length >= 4 && normalizedTopic.includes(name)))
  const matched = rows.filter(row => {
    if (namedMeets.size && !namedMeets.has(normalizeAssistantText(row.competition_name || '').trim())) return false
    const match = parts(row)
    return matchesEvent(filter, Number(match?.[1]), match?.[2], racePool(row.pool))
  })
  const present = row => ({ event: row.event, pool: row.pool, time: row.swim_time, date: row.result_date, year: row.result_year, competition: row.competition_name, source: row.source || 'unknown', aquaPoints: row.aqua_points })
  const centis = row => Number(row.result_time) || parseTrainingTime(row.swim_time)
  const key = row => `${parts(row)?.slice(1).join(':') || normalizeAssistantText(row.event || '')}:${racePool(row.pool) || row.pool || 'okand'}:${row.source || 'unknown'}`
  return { status: limited ? 'incomplete' : 'available', period, ...timeSelections(matched, key, centis, present) }
}

export async function assistantPracticeTimes(profile, topic, today, period) {
  if (periodOutside(period, today)) return invalidPeriod
  const { times, limited } = await loadSwimTimes(profile.id, period?.start || '1900-01-01', period?.end < today ? period.end : today)
  const filter = eventFilter(topic)
  const text = normalizeAssistantText(topic)
  const tests = /\btestlopp\w*\b/.test(text), practice = /\btraningstid\w*\b/.test(text)
  const kind = tests === practice ? null : tests ? 'test' : 'training'
  const matched = times.filter(row => (!kind || row.kind === kind) && matchesEvent(filter, row.distance_meters, row.stroke, row.pool_length))
  return { status: limited ? 'incomplete' : 'available', period, ...timeSelections(matched, swimTimeKey, row => row.result_time,
    row => ({ date: row.result_date, time: formatTrainingTime(row.result_time), conditions: swimTimeDescription(row) })) }
}

const shortText = (text, limit = 280) => text?.length > limit ? text.slice(0, limit) + '…' : text

export async function assistantDiary(profile, today, period, notes) {
  if (periodOutside(period, today)) return invalidPeriod
  const end = period?.end < today ? period.end : today
  const earliest = diaryAddDays(end, -365)
  const start = period ? (period.start < earliest ? earliest : period.start) : diaryAddDays(end, -27)
  const diary = await loadTrainingDiary(profile, start, end, {
    summaryOnly: true, includeComparison: true, includeReflections: notes, includeEntryComments: notes, includeCheckinSignals: true,
    includeResults: false, includeGoals: false,
  })
  const { days, ...current } = diary.current
  const { days: _previousDays, ...previous } = diary.previous
  const activeDays = days.filter(row => row.sessions || row.feeling != null || row.body != null || row.rpe != null || row.speedFeeling != null || row.energy != null || row.motivation != null || row.completedCompetition)
  const entries = diary.entries.filter(entry => notes ? entry.reflection || entry.comments.length : true)
  return {
    status: diary.warnings.length ? 'incomplete' : 'available',
    range: diary.range, requestedPeriodLimited: Boolean(period && period.start < start), warnings: diary.warnings,
    current, previous,
    dailyValues: activeDays.slice(-45),
    dailyValuesLimited: activeDays.length > 45,
    entriesLimited: entries.length > 18,
    entries: entries.slice(0, 18).map(entry => ({
      date: entry.date, type: entry.type, state: entry.state, slot: entry.slot, title: entry.title, focus: entry.focus,
      origin: entry.origin, sport: entry.sport, reportedMeters: entry.reportedMeters, estimatedMeters: entry.estimatedMeters,
      reportedMinutes: entry.reportedMinutes, estimatedMinutes: entry.estimatedMinutes, rpe: entry.rpe, speedFeeling: entry.speedFeeling,
      ...(notes ? {
        reflection: entry.reflection && { whatWorked: shortText(entry.reflection.whatWorked), nextTime: shortText(entry.reflection.nextTime) },
        comments: entry.comments.slice(-2).map(comment => shortText(comment.text)),
      } : {}),
    })),
  }
}
