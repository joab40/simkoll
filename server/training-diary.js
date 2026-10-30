import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { diaryRange, buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'

async function rows(query, { optional = false, warnings, label }) {
  const all = []
  for (let offset = 0; offset < 6000; offset += 500) {
    const result = await supabaseRequest(`${query}&limit=500&offset=${offset}`)
    if (!result.ok) {
      if (optional) { warnings.push(label); return [] }
      throw new Error(`Dagbokens ${label} kunde inte hämtas.`)
    }
    const page = await result.json()
    all.push(...page)
    if (page.length < 500) return all
  }
  warnings.push(`${label}: underlaget är begränsat, välj en kortare period`)
  return all
}

export async function loadTrainingDiary(profile, start, end, { includeReflections = true } = {}) {
  const range = diaryRange(start, end, stockholmDate())
  const warnings = [], owner = `profile_id=eq.${encodeURIComponent(profile.id)}`
  const within = (field) => `${field}=gte.${range.previousStart}&${field}=lt.${range.endExclusive}`
  const read = (query, label, optional = false) => rows(query, { label, optional, warnings })
  const [sessions, responses, workouts, plans, personalPlans, attendance, strengthLogs, assignments, results, goals, reflections, unlocks] = await Promise.all([
    read(`personal_training_sessions?${owner}&${within('session_date')}&select=*&order=session_date.asc,id.asc`, 'registrerade pass'),
    read(`responses?${owner}&${within('activity_date')}&select=*&order=activity_date.asc,created_at.asc,id.asc`, 'incheckningar'),
    read(`daily_workouts?${within('workout_date')}&select=*&order=workout_date.asc,id.asc`, 'upplagda pass'),
    read(`training_plans?${within('plan_date')}&select=*&order=plan_date.asc,id.asc`, 'grundplanering'),
    read(`planned_training_sessions?${owner}&${within('planned_date')}&select=*&order=planned_date.asc,id.asc`, 'personlig planering'),
    read(`session_attendance?${owner}&${within('attendance_date')}&present=eq.true&select=attendance_date,session_slot,present,marked_at&order=attendance_date.asc,marked_at.asc`, 'tränarens närvaromarkeringar', true),
    read(`strength_program_logs?${owner}&${within('session_date')}&select=*&order=session_date.asc,id.asc`, 'styrkeloggar', true),
    read(`program_assignments?${owner}&select=id,training_programs(title,content)&order=id.asc`, 'styrkeprogram', true),
    read(`competition_results?${owner}&${within('result_date')}&select=id,result_date,event,pool,swim_time,result_time,competition_name,source&order=result_date.asc,id.asc`, 'tävlingsresultat', true),
    read(`development_goals?${owner}&start_date=lte.${end}&select=id,title,description,next_step,start_date,target_date,status&order=start_date.desc,id.asc`, 'utvecklingsmål', true),
    includeReflections ? read(`training_diary_reflections?${owner}&${within('activity_date')}&select=entry_key,activity_date,what_worked,next_time,updated_at&order=activity_date.asc,id.asc`, 'dagboksanteckningar (kräver migration 095)', true) : Promise.resolve([]),
    read(`workout_unlocks?${owner}&workout_date=eq.${stockholmDate()}&select=profile_id&order=profile_id.asc`, 'dagens passåtkomst'),
  ])
  // Older coach attendance may predate personal_training_sessions. Merge it
  // into the same completed-session stream; the diary builder deduplicates by
  // date/type/slot and only links a published pass when the match is unique.
  const attendanceSessions = attendance.map((row) => ({
    id: `attendance-${row.attendance_date}-${row.session_slot}`,
    session_date: row.attendance_date,
    session_slot: row.session_slot,
    activity_type: 'swim',
    source: 'coach-attendance',
  }))
  const entries = buildDiaryEntries({ sessions: [...sessions, ...attendanceSessions], responses, workouts, plans, personalPlans, strengthLogs, assignments, results, reflections, trainingGroup: profile.training_group || profile.trainingGroup, today: stockholmDate(), unlockedToday: unlocks.length > 0 })
  return {
    range,
    entries: entries.filter((entry) => entry.date >= start && entry.date <= end),
    current: summarizeDiary(entries, responses, start, end),
    previous: summarizeDiary(entries, responses, range.previousStart, range.previousEnd),
    raceResults: results.map((row) => ({ date: row.result_date, event: row.event, pool: row.pool, time: row.swim_time, resultTime: row.result_time, source: row.source || 'unknown' })),
    goals: goals.filter((goal) => !goal.target_date || goal.target_date >= start || goal.status === 'active'),
    warnings: [...new Set(warnings)],
    reflectionsAvailable: !warnings.some((warning) => warning.startsWith('dagboksanteckningar')),
  }
}

export async function saveDiaryReflection(profile, body) {
  const entryKey = String(body.entryKey || ''), date = String(body.date || '')
  const whatWorked = typeof body.whatWorked === 'string' ? body.whatWorked.trim() : ''
  const nextTime = typeof body.nextTime === 'string' ? body.nextTime.trim() : ''
  if (!entryKey || entryKey.length > 160 || whatWorked.length > 2000 || nextTime.length > 2000) throw Object.assign(new Error('Anteckningar får vara högst 2 000 tecken per fält.'), { status: 400 })
  try { diaryRange(date, date, stockholmDate()) } catch (error) { throw Object.assign(error, { status: 400 }) }
  const data = await loadTrainingDiary(profile, date, date)
  if (!data.entries.some((entry) => entry.key === entryKey)) throw Object.assign(new Error('Passet finns inte i din dagbok. Uppdatera sidan.'), { status: 404 })
  if (!data.reflectionsAvailable) throw Object.assign(new Error('Anteckningarna behöver databasuppdatering 095. Din text har inte sparats.'), { status: 503 })
  const updatedAt = new Date().toISOString()
  const result = await supabaseRequest('training_diary_reflections?on_conflict=profile_id,entry_key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ profile_id: profile.id, entry_key: entryKey, activity_date: date, what_worked: whatWorked, next_time: nextTime, updated_at: updatedAt }),
  })
  if (!result.ok) throw Object.assign(new Error('Anteckningen kunde inte sparas. Försök igen; din text finns kvar i formuläret.'), { status: 502 })
  return { whatWorked, nextTime, updatedAt }
}
