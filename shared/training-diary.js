import { buildSwimmerPasses, responseDay } from '../server/individual-analysis.js'

export const diaryAddDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10)
export const validDiaryDate = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const mean = (values) => { const known = values.filter((value) => number(value) !== null); return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length * 10) / 10 : null }
const sumKnown = (values) => values.some((value) => number(value) !== null) ? values.reduce((sum, value) => sum + (number(value) ?? 0), 0) : null
export const diaryMonday = (day) => diaryAddDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7))

export function diaryRange(start, end, today) {
  if (![start, end, today].every(validDiaryDate) || start > end || end > today) throw new Error('Välj en giltig period till och med idag.')
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
  if (days > 366) throw new Error('Välj högst ett år åt gången.')
  return { start, end, endExclusive: diaryAddDays(end, 1), previousStart: diaryAddDays(start, -days), previousEnd: diaryAddDays(start, -1), days }
}

// One entry per explicitly linked activity/slot. Unknown AM/PM feedback stays
// separate rather than attaching itself to both sessions on the same day.
export function buildDiaryEntries({ sessions = [], responses = [], workouts = [], plans = [], personalPlans = [], strengthLogs = [], assignments = [], results = [], reflections = [], trainingGroup, today, unlockedToday = false }) {
  const entries = new Map()
  const keyFor = (date, type, slot) => `${date}:${type}:${slot || 'day'}`
  const ensure = (key, date, type, slot, state = 'completed') => {
    if (!entries.has(key)) entries.set(key, { key, date, type, slot: slot || null, state, title: '', source: 'reported', responses: [], strengthLogs: [], results: [], content: '', note: '', focus: '', reportedMeters: null, reportedMinutes: null, plannedMeters: null, plannedMinutes: null, linked: false })
    return entries.get(key)
  }
  const afterOnDay = (day) => responses.filter((row) => responseDay(row) === day && row.day_type === 'after' && row.competition !== true)
  sessions.forEach((session) => {
    const day = session.session_date
    let type = session.activity_type
    const after = afterOnDay(day)
    if (session.source === 'checkin' && type === 'swim') {
      const swimFeedback = after.filter((row) => (!row.activity_type || row.activity_type === 'swim') && (!row.session_slot || row.session_slot === session.session_slot))
      // Historical training reads backfilled afternoon sessions for every
      // after-answer, including races and cycling. Do not repeat that guess.
      if (!swimFeedback.length && responses.some((row) => responseDay(row) === day && (row.competition === true || (row.day_type === 'after' && row.activity_type && row.activity_type !== 'swim')))) return
      if (swimFeedback.length && swimFeedback.every((row) => !row.activity_type && !row.session_slot)) type = 'unknown'
    }
    const slot = session.session_slot === 'legacy' ? `legacy-${session.id}` : session.session_slot
    const entry = ensure(keyFor(day, type, slot), day, type, slot)
    entry.source = 'registered'
  })
  responses.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach((row) => {
    const date = responseDay(row), competition = row.competition === true
    const type = competition ? 'competition' : ['rest', 'sick'].includes(row.day_type) ? row.day_type : row.activity_type || (row.session_slot || row.day_type === 'before' ? 'swim' : 'unknown')
    const slot = competition ? 'day' : row.session_slot || (['strength', 'dryland', 'cycling', 'other'].includes(type) ? type : null)
    const state = row.day_type === 'after' ? 'completed' : row.day_type === 'before' ? 'planned' : 'status'
    let entry
    if (competition || ['rest', 'sick'].includes(type) || slot) entry = ensure(keyFor(date, type, slot), date, type, slot, state)
    else {
      const candidates = [...entries.values()].filter((item) => item.date === date && item.type === type && item.state === 'completed')
      entry = candidates.length === 1 ? candidates[0] : ensure(keyFor(date, type, 'unassigned'), date, type, null, state)
      if (candidates.length > 1 || (type === 'unknown' && candidates.length === 0 && [...entries.values()].some((item) => item !== entry && item.date === date && item.state === 'completed'))) { entry.unlinkedFeedback = true; entry.state = 'feedback' }
    }
    entry.responses.push(row)
    if (state === 'completed' && entry.state !== 'feedback') entry.state = 'completed'
  })
  strengthLogs.forEach((log) => {
    const entry = ensure(keyFor(log.session_date, 'strength', 'strength'), log.session_date, 'strength', 'strength')
    entry.state = 'completed'
    const program = assignments.find((item) => item.id === log.assignment_id)?.training_programs
    entry.strengthLogs.push({ pass: log.pass_number, weights: log.weights || {}, notes: log.notes || '', title: program?.title || 'Styrkepass', content: program?.content || '' })
    entry.title = program?.title || 'Styrkepass'
  })
  results.filter((row) => row.result_date).forEach((row) => {
    const entry = ensure(keyFor(row.result_date, 'competition', 'day'), row.result_date, 'competition', 'day')
    entry.state = 'completed'
    entry.title = row.competition_name || 'Tävling'
    entry.results.push({ event: row.event, pool: row.pool, time: row.swim_time, source: row.source })
  })
  const swimEntries = [...entries.values()].filter((item) => item.type === 'swim' && item.state === 'completed')
  // The established pass matcher requires a unique group/time match.
  const passes = buildSwimmerPasses({ sessions: swimEntries.map((item) => ({ session_date: item.date, session_slot: item.slot, activity_type: 'swim' })), responses: responses.filter((row) => row.competition !== true), workouts, plans, trainingGroup })
  swimEntries.forEach((entry) => {
    const pass = passes.find((item) => item.date === entry.date && item.sessionSlot === entry.slot)
    if (!pass || !['slot', 'day_only'].includes(pass.matchStatus)) return
    Object.assign(entry, { title: pass.title, focus: pass.focus || '', plannedMeters: pass.distanceMeters, plannedMinutes: pass.durationMinutes, linked: true, content: entry.date < today || unlockedToday ? pass.content : '', note: entry.date < today || unlockedToday ? pass.note : '', contentLocked: entry.date === today && !unlockedToday })
  })
  personalPlans.forEach((plan) => {
    const type = plan.session_slot.includes('swim') ? 'swim' : plan.session_slot
    const key = keyFor(plan.planned_date, type, plan.session_slot)
    if (entries.has(key)) return
    const entry = ensure(key, plan.planned_date, type, plan.session_slot, 'planned')
    entry.source = 'personal-plan'
    // Planned items expose metadata only, preserving today's workout lock.
    const time = plan.session_slot === 'morning_swim' ? 'morning' : 'afternoon'
    const candidates = workouts.filter((row) => row.workout_date === entry.date && row.time_of_day === time && (!row.target_groups?.length || row.target_groups.includes(trainingGroup)))
    if (type === 'swim' && candidates.length === 1) Object.assign(entry, { title: candidates[0].title, focus: candidates[0].focus, plannedMeters: number(candidates[0].distance_meters), plannedMinutes: number(candidates[0].duration_minutes) })
  })
  // Keep saved notes readable if a later registration changes an older,
  // previously unassigned check-in's linkage.
  reflections.filter((row) => !entries.has(row.entry_key)).forEach((row) => {
    const entry = ensure(row.entry_key, row.activity_date, 'reflection', null, 'feedback')
    entry.title = 'Sparad reflektion till tidigare registrering'
  })
  return [...entries.values()].map((entry) => {
    const after = entry.responses.filter((row) => row.day_type === 'after'), feedback = after.at(-1)
    entry.reportedMeters = feedback ? number(feedback.activity_distance_meters) : null
    entry.reportedMinutes = feedback ? number(feedback.activity_minutes) : null
    entry.rpe = feedback ? number(feedback.rpe) : null
    entry.feeling = mean(entry.responses.map((row) => row.feeling))
    entry.body = mean(entry.responses.map((row) => row.body))
    entry.speedFeeling = feedback ? number(feedback.speed_feeling) : null
    entry.comments = entry.responses.filter((row) => row.comment?.trim()).map((row) => ({ text: row.comment, date: row.created_at, late: row.late_entry === true, phase: row.day_type }))
    entry.reflection = reflections.find((row) => row.entry_key === entry.key) ? (({ what_worked, next_time, updated_at }) => ({ whatWorked: what_worked || '', nextTime: next_time || '', updatedAt: updated_at }))(reflections.find((row) => row.entry_key === entry.key)) : null
    entry.partial = feedback?.planned_completion === 'partial'
    entry.estimatedMeters = entry.state === 'completed' && entry.reportedMeters === null && !entry.partial && feedback?.planned_completion !== 'no' && entry.type === 'swim' ? entry.plannedMeters : null
    entry.estimatedMinutes = entry.state === 'completed' && entry.reportedMinutes === null && !entry.partial && feedback?.planned_completion !== 'no' ? entry.plannedMinutes : null
    delete entry.responses
    return entry
  }).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}

export function summarizeDiary(entries, responses, start, end) {
  const selected = entries.filter((entry) => entry.date >= start && entry.date <= end)
  const training = selected.filter((entry) => entry.state === 'completed' && !['competition', 'rest', 'sick'].includes(entry.type))
  const days = []
  for (let date = start; date <= end; date = diaryAddDays(date, 1)) {
    const dayEntries = selected.filter((entry) => entry.date === date)
    const dayTraining = training.filter((entry) => entry.date === date)
    const dayResponses = responses.filter((row) => responseDay(row) === date)
    days.push({ date, sessions: dayTraining.length, competition: dayEntries.some((entry) => entry.type === 'competition'), swimMeters: sumKnown(dayTraining.filter((entry) => entry.type === 'swim').map((entry) => entry.reportedMeters)), estimatedSwimMeters: sumKnown(dayTraining.filter((entry) => entry.type === 'swim').map((entry) => entry.estimatedMeters)), minutes: sumKnown(dayTraining.map((entry) => entry.reportedMinutes)), feeling: mean(dayResponses.map((row) => row.feeling)), body: mean(dayResponses.map((row) => row.body)), rpe: mean(dayEntries.filter((entry) => ['completed', 'feedback'].includes(entry.state)).map((entry) => entry.rpe)), speedFeeling: mean(dayEntries.filter((entry) => ['completed', 'feedback'].includes(entry.state)).map((entry) => entry.speedFeeling)) })
  }
  return { sessions: training.length, byType: Object.fromEntries([...new Set(training.map((entry) => entry.type))].map((type) => [type, training.filter((entry) => entry.type === type).length])), activeDays: new Set(training.map((entry) => entry.date)).size, competitionDays: new Set(selected.filter((entry) => entry.type === 'competition' && entry.state === 'completed').map((entry) => entry.date)).size, plannedCompetitionDays: new Set(selected.filter((entry) => entry.type === 'competition' && entry.state === 'planned').map((entry) => entry.date)).size, swimMeters: sumKnown(training.filter((entry) => entry.type === 'swim').map((entry) => entry.reportedMeters)), estimatedSwimMeters: sumKnown(training.filter((entry) => entry.type === 'swim').map((entry) => entry.estimatedMeters)), minutes: sumKnown(training.map((entry) => entry.reportedMinutes)), estimatedMinutes: sumKnown(training.map((entry) => entry.estimatedMinutes)), rpe: mean(days.map((row) => row.rpe)), feeling: mean(days.map((row) => row.feeling)), speedFeeling: mean(days.map((row) => row.speedFeeling)), days }
}
