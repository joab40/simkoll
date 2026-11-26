import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { diaryRange, buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'

async function rows(query, { optional = false, warnings, label }) {
  const all = []
  for (let offset = 0; offset < 6000; offset += 500) {
    let result
    try { result = await supabaseRequest(`${query}&limit=500&offset=${offset}`) }
    catch (error) { if (optional) { warnings.push(label); return [] }; throw error }
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

export async function loadTrainingDiary(profile, start, end, { includeReflections = true, includeComparison = true, includeResults = true,
  includeGoals = true, includeCheckinSignals = false, summaryOnly = false, planningCache } = {}) {
  const today = stockholmDate()
  const range = diaryRange(start, end, today)
  const warnings = [], owner = `profile_id=eq.${encodeURIComponent(profile.id)}`
  const within = (field) => `${field}=gte.${includeComparison ? range.previousStart : start}&${field}=lt.${range.endExclusive}`
  const read = (query, label, optional = false) => rows(query, { label, optional, warnings })
  const readPlanning = async (query, label) => {
    if (!planningCache) return read(query, label)
    if (!planningCache.has(query)) {
      const notes = []
      planningCache.set(query, rows(query, { label, warnings: notes }).then(value => ({ value, notes })))
    }
    const { value, notes } = await planningCache.get(query)
    warnings.push(...notes)
    return value
  }
  const [sessions, responses, workouts, plans, personalPlans, attendance, strengthLogs, assignments, results, goals, reflections, unlocks, drylandLogs] = await Promise.all([
    read(`personal_training_sessions?${owner}&${within('session_date')}&select=${summaryOnly ? 'id,session_date,session_slot,activity_type,source,workout_reference,personal_details' : '*'}&order=session_date.asc,id.asc`, 'registrerade pass'),
    read(`responses?${owner}&${within('activity_date')}&select=${summaryOnly ? 'id,activity_date,created_at,day_type,activity_type,session_slot,competition,workout_reference,activity_distance_meters,activity_minutes,planned_completion,feeling,body,energy,motivation,rpe,speed_feeling,pass_rating,setup_rating,temperature' : '*'}&order=activity_date.asc,created_at.asc,id.asc`, 'incheckningar'),
    readPlanning(`daily_workouts?${within('workout_date')}&select=${summaryOnly ? 'id,workout_date,title,focus,distance_meters,duration_minutes,time_of_day,target_groups' : '*'}&order=workout_date.asc,id.asc`, 'upplagda pass'),
    readPlanning(`training_plans?${within('plan_date')}&select=${summaryOnly ? 'id,plan_date,activity_type,title,focus,distance_meters,duration_minutes,time_of_day,target_groups,source_workout_id,calendar_link,location,sync_status' : '*'}&order=plan_date.asc,id.asc`, 'grundplanering'),
    read(`planned_training_sessions?${owner}&${within('planned_date')}&select=*&order=planned_date.asc,id.asc`, 'personlig planering'),
    read(`session_attendance?${owner}&${within('attendance_date')}&present=eq.true&select=attendance_date,session_slot,present,marked_at&order=attendance_date.asc,marked_at.asc`, 'tränarens närvaromarkeringar', true),
    read(`strength_program_logs?${owner}&${within('session_date')}&select=${summaryOnly ? 'session_date,pass_number' : '*'}&order=session_date.asc,id.asc`, 'styrkeloggar', true),
    summaryOnly ? [] : read(`program_assignments?${owner}&select=id,training_programs(title,content)&order=id.asc`, 'styrkeprogram', true),
    includeResults ? read(`competition_results?${owner}&${within('result_date')}&select=id,result_date,event,pool,swim_time,result_time,competition_name,source&order=result_date.asc,id.asc`, 'tävlingsresultat', true) : [],
    includeGoals ? read(`development_goals?${owner}&start_date=lte.${end}&select=id,title,description,next_step,start_date,target_date,status&order=start_date.desc,id.asc`, 'utvecklingsmål', true) : [],
    includeReflections ? read(`training_diary_reflections?${owner}&${within('activity_date')}&select=entry_key,activity_date,what_worked,next_time,updated_at&order=activity_date.asc,id.asc`, 'dagboksanteckningar (kräver migration 095)', true) : Promise.resolve([]),
    summaryOnly ? [] : read(`workout_unlocks?${owner}&workout_date=eq.${today}&select=profile_id&order=profile_id.asc`, 'dagens passåtkomst'),
    read(`dryland_program_logs?${owner}&${within('session_date')}&select=${summaryOnly ? 'session_date,pass_number' : '*'}&order=session_date.asc,id.asc`, 'landträningsloggar (kräver SQL 111)', true),
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
  const entries = buildDiaryEntries({ sessions: [...sessions, ...attendanceSessions], responses, workouts, plans, personalPlans, strengthLogs, drylandLogs, assignments, results, reflections, trainingGroup: profile.training_group || profile.trainingGroup, today, unlockedToday: unlocks.length > 0 })
  const current = summarizeDiary(entries, responses, start, end, { includeCheckinSignals }), previous = (!summaryOnly || includeComparison) ? summarizeDiary(entries, responses, range.previousStart, range.previousEnd) : null
  if (warnings.some(warning => /^(registrerade pass|incheckningar|upplagda pass|grundplanering|tränarens närvaromarkeringar)/.test(warning))) {
    for (const summary of [current, previous].filter(Boolean)) summary.days = summary.days.map(day => ({ ...day, swimMetersPlot: null, swimMeterPlotSource: 'Ofullständigt mängdunderlag' }))
  }
  return {
    range,
    entries: entries.filter((entry) => entry.date >= start && entry.date <= end),
    current,
    previous,
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
