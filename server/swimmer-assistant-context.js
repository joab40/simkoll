import { analyticsRows } from './analytics-rows.js'
import { supabaseRequest } from './supabase.js'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { trainingHeartAfterReports } from '../shared/training-heart.js'
import { withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { trainingLoad } from '../shared/training-load.js'
import { SWIMMER_ASSISTANT_CATEGORIES } from '../shared/swimmer-assistant.js'
import { loadTaperGoals } from './taper-kollen.js'
import { coachWeekAddDays } from '../shared/coach-week.js'

const pick = (row, fields) => Object.fromEntries(fields.split(',').filter(key => row[key] !== undefined).map(key => [key, row[key]]))
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const mean = values => { const known = values.filter(value => number(value) !== null); return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length * 100) / 100 : null }

export async function loadSwimmerAssistantContext(profile, selection, read = supabaseRequest) {
  const { categories, start, end, period } = selection, wanted = key => categories.includes(key)
  const owner = `profile_id=eq.${encodeURIComponent(profile.id)}`
  const dates = field => `${field}=gte.${start}&${field}=lte.${end}`
  const cache = new Map(), warnings = []
  const rows = (query, label) => {
    if (!cache.has(query)) cache.set(query, (async () => {
      try {
        const result = await analyticsRows(query, read)
        if (!result.ok || result.truncated) throw new Error('Incomplete')
        return await result.json()
      } catch {
        warnings.push(`${label} kunde inte läsas fullständigt. Det betyder inte att uppgifter saknas.`)
        return null
      }
    })())
    return cache.get(query)
  }
  const responseKeys = ['id,activity_date,created_at,day_type,activity_type,session_slot,competition,planned_completion,workout_reference']
  if (wanted('checkins')) responseKeys.push('feeling,body,energy,temperature,pass_rating,setup_rating,late_entry')
  if (wanted('speed')) responseKeys.push('speed_feeling')
  if (wanted('load')) responseKeys.push('rpe,activity_minutes')
  if (wanted('volume')) responseKeys.push('activity_distance_meters,activity_minutes')
  if (wanted('comments')) responseKeys.push('comment')
  const needsResponses = ['checkins', 'speed', 'load', 'volume', 'comments', 'health'].some(wanted)
  const needsPlans = ['workouts', 'load', 'volume'].some(wanted)
  const needsSessions = wanted('activity') || wanted('volume')
  const [responses, workouts, plans, sessions] = await Promise.all([
    needsResponses ? rows(`responses?${owner}&${dates('activity_date')}&select=${[...new Set(responseKeys.join(',').split(','))].join(',')}&order=activity_date.asc,created_at.asc,id.asc`, 'Incheckningar') : [],
    needsPlans ? rows(`daily_workouts?${dates('workout_date')}&select=id,workout_date,title,focus,distance_meters,duration_minutes,time_of_day,target_groups${wanted('workouts') ? ',content,note' : ''}&order=workout_date.asc,id.asc`, 'Publicerade pass') : [],
    needsPlans ? rows(`training_plans?${dates('plan_date')}&select=id,plan_date,activity_type,title,focus,distance_meters,duration_minutes,time_of_day,target_groups,source_workout_id,calendar_link${wanted('workouts') ? ',notes' : ''}&order=plan_date.asc,id.asc`, 'Grundplanering') : [],
    needsSessions ? rows(`personal_training_sessions?${owner}&${dates('session_date')}&select=session_date,session_slot,activity_type,source,id&order=session_date.asc,id.asc`, 'Registrerade aktiviteter') : [],
  ])
  const sources = []
  const add = (category, label, date, data) => { sources.push({ id: `S${sources.length + 1}`, category, label, date: date || null, data }) }
  const groupMatch = row => !row.target_groups?.length || Boolean(profile.training_group && row.target_groups.includes(profile.training_group))
  const groupWorkouts = (workouts || []).filter(groupMatch), groupPlans = (plans || []).filter(groupMatch)
  const amountsComplete = workouts !== null && plans !== null
  const safeResponses = responses || []
  // Other selected sections must not accidentally reintroduce health data.
  const status = row => row.day_type === 'sick' && !wanted('health') ? 'not_training' : row.day_type
  for (const row of safeResponses) {
    const base = { activity: row.activity_type, slot: row.session_slot, competition: row.competition === true, submittedAt: row.created_at }
    if (wanted('checkins')) add('checkins', 'Incheckning', row.activity_date, { ...base, status: status(row), ...pick(row, 'feeling,body,energy,temperature,pass_rating,setup_rating,late_entry') })
    if (wanted('speed') && row.day_type === 'after' && row.activity_type === 'swim' && !row.competition && row.speed_feeling != null) add('speed', 'Upplevd simfart', row.activity_date, { ...base, value: row.speed_feeling, scale: '1–5, subjektiv fartkänsla' })
    if (wanted('comments') && row.comment) add('comments', 'Kommentar från incheckning', row.activity_date, { ...base, text: row.comment })
    if (wanted('health') && row.day_type === 'sick') add('health', 'Registrerad sjukfrånvaro', row.activity_date, { status: 'sick' })
  }
  if (wanted('load') && responses !== null) {
    const normalized = safeResponses.map(row => ({ id: row.id, date: row.activity_date, createdAt: row.created_at, type: row.day_type, competition: row.competition === true, activityType: row.activity_type, trainingSlot: row.session_slot, plannedCompletion: row.planned_completion, workoutReference: row.workout_reference, activityMinutes: row.activity_minutes, rpe: row.rpe }))
    const enriched = withLinkedTrainingAmounts(normalized, { workouts: amountsComplete ? groupWorkouts : [], plans: amountsComplete ? groupPlans : [], trainingGroup: profile.training_group, asOf: end })
    for (const row of trainingHeartAfterReports(enriched)) {
      const validType = ['swim', 'strength', 'dryland', 'cycling', 'other'].includes(row.activityType)
      const amount = trainingLoad(row.rpe, row.activityMinutes, row.linkedEstimate?.minutes)
      add('load', 'RPE och beräknad sRPE', row.date, { activity: row.activityType, slot: row.trainingSlot, rpe: row.rpe ?? null, reportedMinutes: row.activityMinutes ?? null, estimatedMinutes: row.linkedEstimate?.minutes ?? null, sRpe: validType ? amount.value : null, timeSource: amount.source, missingTimeReason: row.timeIssue || null, basis: 'RPE × minuter. Planerad tid är uppskattad, inte bekräftad faktisk tid. En rapportgrupp per dag/aktivitet/passval; inte säkert antal fysiska pass.' })
    }
  }
  if (wanted('volume') && responses !== null && sessions !== null) {
    const entries = buildDiaryEntries({ sessions: sessions || [], responses: safeResponses, workouts: amountsComplete ? groupWorkouts : [], plans: amountsComplete ? groupPlans : [], trainingGroup: profile.training_group, today: end })
    for (const entry of entries.filter(entry => entry.state === 'completed' && entry.type !== 'competition')) add('volume', 'Mängdunderlag', entry.date, { activity: entry.type, slot: entry.slot, reportedMeters: entry.reportedMeters, estimatedMeters: entry.estimatedMeters, reportedMinutes: entry.reportedMinutes, estimatedMinutes: entry.estimatedMinutes, partial: entry.partial, linked: entry.linked, basis: 'Rapporterad mängd och planerad/uppskattad mängd hålls isär. Mängd som saknas är inte noll. Alternativa upplägg summeras inte.' })
  }
  if (wanted('workouts')) {
    for (const row of groupWorkouts) add('workouts', 'Publicerat gruppass – inte bekräftat deltagande', row.workout_date, pick(row, 'title,focus,distance_meters,duration_minutes,time_of_day,content,note'))
    for (const row of groupPlans) add('workouts', 'Grundplanering – inte bekräftat deltagande', row.plan_date, { ...pick(row, 'activity_type,title,focus,distance_meters,duration_minutes,time_of_day,notes'), complementedByPublishedWorkout: Boolean(row.source_workout_id) })
  }
  if (wanted('activity')) {
    for (const row of sessions || []) add('activity', 'Registrerad aktivitet', row.session_date, pick(row, 'session_slot,activity_type,source'))
    const planned = await rows(`planned_training_sessions?${owner}&${dates('planned_date')}&select=planned_date,session_slot&order=planned_date.asc,session_slot.asc`, 'Personlig planering')
    for (const row of planned || []) add('activity', 'Personligen planerat – inte genomfört', row.planned_date, pick(row, 'session_slot'))
    const attendance = await rows(`session_attendance?${owner}&${dates('attendance_date')}&select=attendance_date,session_slot,present&order=attendance_date.asc,session_slot.asc`, 'Tränarens närvaro')
    for (const row of attendance || []) add('activity', 'Tränarens närvaromarkering – kan avse samma pass som registrerad aktivitet', row.attendance_date, pick(row, 'session_slot,present'))
  }
  if (wanted('results')) {
    const results = await rows(`competition_results?${owner}&${period === 'all' ? '' : `${dates('result_date')}&`}select=result_date,result_year,date_precision,event,pool,swim_time,result_time,aqua_points,competition_name,source,id&order=result_date.asc.nullslast,id.asc`, 'Tävlingsresultat')
    for (const row of results || []) if (!row.result_date || row.result_date <= end) add('results', 'Sparat tävlingsresultat', row.result_date, { ...pick(row, 'result_year,date_precision,event,pool,swim_time,result_time,aqua_points,competition_name,source'), timeUnit: 'result_time är hundradels sekunder', verification: row.source === 'manual' ? 'Manuellt tillagt, inte verifierat av Tempus' : 'Sparad import; ingen ny synk görs' })
    if (period !== 'all') warnings.push('Resultat med endast årtal eller okänt datum ingår bara vid All sparad historik.')
  }
  if (wanted('times')) {
    const times = await rows(`training_swim_times?${owner}&${dates('result_date')}&select=result_date,distance_meters,stroke,pool_length,result_time,kind,start_type,exercise,equipment,timing_method,conditions${wanted('comments') ? ',note' : ''},id&order=result_date.asc,id.asc`, 'Tränings- och testtider')
    for (const row of times || []) add('times', 'Registrerad tränings-/testtid', row.result_date, { ...pick(row, `distance_meters,stroke,pool_length,result_time,kind,start_type,exercise,equipment,timing_method,conditions${wanted('comments') ? ',note' : ''}`), timeUnit: 'hundradels sekunder', basis: 'Jämför endast samma gren, bassäng, startsätt, utrustning, övning och tidtagningsförutsättningar.' })
  }
  if (wanted('programs') || wanted('comments')) {
    const assignments = wanted('programs') ? await rows(`program_assignments?${owner}&select=id,assigned_at,removed_at,training_programs(title,description,content,program_type,start_date,end_date)&order=id.asc`, 'Tilldelade program') : []
    for (const row of assignments || []) if (row.assigned_at?.slice(0, 10) <= end && (!row.removed_at || row.removed_at.slice(0, 10) >= start)) add('programs', 'Tilldelat program – inte bevis på genomförande', row.assigned_at?.slice(0, 10), { assignedAt: row.assigned_at, removedAt: row.removed_at, program: pick(row.training_programs || {}, 'title,description,content,program_type,start_date,end_date') })
    for (const [table, label, values] of [['strength_program_logs', 'Styrkelogg', 'weights'], ['dryland_program_logs', 'Landträningslogg', 'results']]) {
      const logs = await rows(`${table}?${owner}&${dates('session_date')}&select=session_date,pass_number${wanted('programs') ? `,${values}` : ''}${wanted('comments') ? ',notes' : ''},id&order=session_date.asc,id.asc`, label)
      for (const row of logs || []) {
        if (wanted('programs')) add('programs', label, row.session_date, pick(row, `pass_number,${values}`))
        if (wanted('comments') && row.notes) add('comments', `Kommentar från ${label.toLowerCase()}`, row.session_date, { text: row.notes })
      }
    }
  }
  if (wanted('comments')) {
    const reflections = await rows(`training_diary_reflections?${owner}&${dates('activity_date')}&select=activity_date,what_worked,next_time,id&order=activity_date.asc,id.asc`, 'Dagboksreflektioner')
    for (const row of reflections || []) add('comments', 'Dagboksreflektion', row.activity_date, pick(row, 'what_worked,next_time'))
  }
  if (wanted('health')) {
    for (const [table, fields, label] of [['profile_daily_sleep', 'minutes,quality,skipped', 'Sömnrapport'], ['profile_daily_illness', 'status,skipped', 'Sjukdomskoll']]) {
      const reports = await rows(`${table}?${owner}&${dates('activity_date')}&select=activity_date,${fields}&order=activity_date.asc`, label)
      for (const row of reports || []) add('health', label, row.activity_date, pick(row, fields))
    }
  }
  if (wanted('taper')) {
    try {
      const goals = await loadTaperGoals(profile.id, read)
      for (const goal of goals.filter(item => item.enabled && item.targetDate >= start)) add('taper', 'Tränarens individuella måltävling – sparad plan, inte bekräftad toppning', goal.targetDate, { ...pick(goal, 'title,priority,targetDate,taperStart,competitionStart,competitionEnd,events,note,createdAt'), basis: 'Senaste sparade målversion. Kalendern kan ha ändrats efter sparande. Prioritet gäller denna simmare, inte tävlingens officiella status.' })
    } catch { warnings.push('Toppningsmålen kunde inte läsas. Kontrollera SQL 122. Saknade mål antas inte från tävlingars namn.') }
    const futureEnd = coachWeekAddDays(end, 28)
    for (const [table, field, fields, label] of [
      ['training_plans', 'plan_date', 'activity_type,title,focus,distance_meters,duration_minutes,time_of_day,target_groups', 'Framtida grundplan'],
      ['daily_workouts', 'workout_date', 'title,focus,distance_meters,duration_minutes,time_of_day,target_groups', 'Framtida publicerat pass'],
    ]) {
      const planned = await rows(`${table}?${field}=gt.${end}&${field}=lte.${futureEnd}&select=id,${field},${fields}&order=${field}.asc,id.asc`, label)
      for (const row of (planned || []).filter(groupMatch)) add('taper', `${label} – inte registrerad träning`, row[field], { ...pick(row, fields), basis: 'Gruppens kommande planering. Alternativ och grundplan/publicerat pass kan avse samma tillfälle; summera inte råa rader. Dagens grupptillhörighet används.' })
    }
    add('taper', 'Forskningsbakgrund – generell, inte individuell ordination', null, { source: 'Bosquet et al. 2007, metaanalys', url: 'https://pubmed.ncbi.nlm.nih.gov/17762369/', finding: 'Samlat stöd för cirka två veckors toppning med minskad volym och bibehållen intensitet och frekvens. Ingen individuell garanti; använd inte en generell procentsats som automatiskt recept för en ungdom.' })
    add('taper', 'Forskningsbakgrund – individuell respons', null, { source: 'Effect of the pre-taper level of fatigue on the taper-induced changes in performance in elite swimmers (2024)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10915210/', finding: 'Studie av 26 simmare: trötthetsläget före toppning var kopplat till olika prestationssvar. Validerar inte Simkolls produktregler eller en individuell prognos.' })
  }
  if (wanted('coachNotes')) {
    const notes = await rows(`coach_swimmer_notes?${owner}&${dates('note_date')}&select=note_date,content,id&order=note_date.asc,id.asc`, 'Individuella tränaranteckningar')
    for (const row of notes || []) add('coachNotes', 'Tränarens anteckning – observation, inte verifierat resultat', row.note_date, { text: row.content })
    const observations = await rows(`coach_form_observations?${owner}&${dates('observed_on')}&select=observed_on,training_pb_date,competition_pb_date,taper_start,competition_date,note,id&order=observed_on.asc,id.asc`, 'Formobservationer')
    for (const row of observations || []) add('coachNotes', 'Tränarens formobservation – inte verifierat personbästa', row.observed_on, pick(row, 'training_pb_date,competition_pb_date,taper_start,competition_date,note'))
  }
  if (wanted('goals')) {
    for (const [table, fields, label] of [
      ['season_swim_goals', 'title,target_sessions_per_week,start_date,end_date,active', 'Simmål'],
      ['cross_training_goals', 'strength_sessions_per_week,dryland_sessions_per_week,start_date,end_date', 'Land-/styrkemål'],
      ['development_goals', 'title,description,next_step,start_date,target_date,status', 'Utvecklingsmål'],
    ]) {
      const goals = await rows(`${table}?${owner}&start_date=lte.${end}&select=${fields},id&order=start_date.asc,id.asc`, label)
      for (const row of goals || []) if (!(row.end_date && row.end_date < start)) add('goals', label, row.start_date, pick(row, fields))
    }
  }
  if (wanted('goals') || wanted('coachNotes')) {
    const talks = await rows(`development_talks?swimmer_id=eq.${encodeURIComponent(profile.id)}&${dates('meeting_date')}&select=meeting_date,status${wanted('goals') ? ',swimmer_answers,agreement,follow_up_date' : ''}${wanted('coachNotes') ? ',coach_notes' : ''},id&order=meeting_date.asc,id.asc`, 'Utvecklingssamtal')
    for (const row of talks || []) {
      if (wanted('goals')) add('goals', 'Utvecklingssamtal', row.meeting_date, pick(row, 'status,swimmer_answers,agreement,follow_up_date'))
      if (wanted('coachNotes')) add('coachNotes', 'Tränarens samtalsanteckningar', row.meeting_date, { notes: row.coach_notes })
    }
  }
  if (wanted('comments') || wanted('coachNotes')) {
    const localDay = stamp => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(stamp))
    const queryStart = new Date(Date.parse(`${start}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
    const endExclusive = new Date(Date.parse(`${end}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
    const updates = await rows(`goal_updates?development_goals.profile_id=eq.${encodeURIComponent(profile.id)}&created_at=gte.${queryStart}&created_at=lt.${endExclusive}&select=created_at,author_role,content,feedback_type,id,development_goals!inner(title,profile_id)&order=created_at.asc,id.asc`, 'Uppföljningar av utvecklingsmål')
    for (const row of updates || []) {
      const category = row.author_role === 'coach' ? 'coachNotes' : 'comments'
      const date = localDay(row.created_at)
      if (wanted(category) && date >= start && date <= end) add(category, 'Uppföljning av utvecklingsmål', date, { author: row.author_role, goal: row.development_goals?.title, text: row.content, feedbackType: row.feedback_type })
    }
  }
  if (wanted('programs') || wanted('coachNotes')) {
    const programGoals = await rows(`program_goals?program_assignments.profile_id=eq.${encodeURIComponent(profile.id)}&select=title,description,status,submitted_at,approved_at${wanted('coachNotes') ? ',coach_feedback' : ''},id,program_assignments!inner(profile_id)&order=id.asc`, 'Programmål')
    for (const row of programGoals || []) {
      if (wanted('programs')) add('programs', 'Programmål – aktuell status', null, pick(row, 'title,description,status,submitted_at,approved_at'))
      if (wanted('coachNotes') && row.coach_feedback) add('coachNotes', 'Tränarens feedback på programmål – aktuellt sparat värde', null, { title: row.title, text: row.coach_feedback })
    }
    if (programGoals?.length) warnings.push('Programmål utan händelsedatum visas som aktuell sparad status, inte som historiskt bekräftad status under perioden.')
  }
  warnings.sort()
  const daily = []
  const byDay = new Map()
  for (const source of sources) if (source.date && source.date >= start && source.date <= end) { if (!byDay.has(source.date)) byDay.set(source.date, []); byDay.get(source.date).push(source) }
  for (const date of [...byDay.keys()].sort()) {
    const group = byDay.get(date), metric = (cat, key) => mean(group.filter(source => source.category === cat).map(source => source.data[key]))
    const loads = group.filter(source => source.category === 'load'), known = loads.filter(source => number(source.data.sRpe) !== null)
    daily.push({ date, ...(wanted('checkins') ? { body: metric('checkins', 'body'), feeling: metric('checkins', 'feeling') } : {}), ...(wanted('speed') ? { speedFeeling: metric('speed', 'value') } : {}), ...(wanted('load') ? { rpe: metric('load', 'rpe'), sRpeKnownPart: known.length ? Math.round(known.reduce((sum, source) => sum + source.data.sRpe, 0) * 10) / 10 : null, loadReports: loads.length, completeLoadReports: known.length, estimatedTimeReports: known.filter(source => source.data.timeSource === 'estimated').length } : {}), sourceIds: group.map(source => source.id) })
  }
  return { subject: 'Den valda simmaren', selection, categories: categories.map(key => ({ key, label: SWIMMER_ASSISTANT_CATEGORIES.find(item => item.key === key).label, records: sources.filter(source => source.category === key).length })), warnings: [...new Set(warnings)], sources, daily, limitations: ['Saknade svar är inte noll. Dagsmedel gäller svarsdagar, inte varje kalenderdag.', 'Dagens grupp används för gruppass även historiskt. Gruppass är inte bekräftat deltagande.', 'RPE är upplevd ansträngning; sRPE är RPE × minuter. Uppskattad tid/metermängd är inte uppmätt träning.', 'Samband är inte orsakssamband. Ingen diagnos, prognos om toppform eller automatisk träningsändring.', 'Anonyma svar, privata meddelanden, kontakt-/inloggningsuppgifter, bilagor och spelhistorik ingår inte. Fritext kan ändå innehålla namn eller känsliga uppgifter; granska den före sändning.'] }
}
