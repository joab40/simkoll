import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardArtifact, awardPoints, getSessionProfile, stockholmDate } from '../server/profile-auth.js'

const mapProgram = (program) => ({ id: program.id, type: program.program_type, title: program.title, description: program.description, content: program.content, startDate: program.start_date, endDate: program.end_date, active: program.active })
const mapSeasonGoal = (goal) => ({ id: goal.id, profileId: goal.profile_id, title: goal.title, target: goal.target_sessions_per_week, startDate: goal.start_date, endDate: goal.end_date, reflection: goal.reflection || '', active: goal.active })
const comparableStrengthValue = (value) => {
  const text = String(value || '').toLocaleLowerCase('sv-SE').replace(',', '.')
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|reps?|sek|s)\b/)
  if (!match) return null
  const unit = /^kilo?$/.test(match[2]) ? 'kg' : /^rep/.test(match[2]) ? 'reps' : 'sek'
  return { unit, value: Number(match[1]) }
}

async function loadTraining(profileId = null) {
  const profileFilter = profileId ? `&profile_id=eq.${profileId}` : ''
  const [goalsResult, crossGoalsResult, sessionsResult, plannedResult, assignmentsResult, programsResult, programGoalsResult, afterResponsesResult, workoutsResult, strengthLogsResult] = await Promise.all([
    supabaseRequest(`season_swim_goals?select=*${profileFilter}&order=start_date.desc`),
    supabaseRequest(`cross_training_goals?select=*${profileFilter}&order=start_date.desc`),
    supabaseRequest(`personal_training_sessions?select=*${profileFilter}&order=completed_at.desc&limit=1000`),
    supabaseRequest(`planned_training_sessions?select=*${profileFilter}&order=planned_date.asc&limit=1000`),
    supabaseRequest(`program_assignments?select=*${profileFilter}&removed_at=is.null`),
    supabaseRequest('training_programs?select=*&order=created_at.desc'),
    supabaseRequest('program_goals?select=*&order=created_at.desc'),
    supabaseRequest(`responses?day_type=eq.after${profileId ? `&profile_id=eq.${profileId}` : ''}&select=profile_id,created_at&order=created_at.asc&limit=10000`),
    supabaseRequest('daily_workouts?select=workout_date,distance_meters,duration_minutes,time_of_day,target_groups&order=workout_date.asc,created_at.asc&limit=1000'),
    supabaseRequest(`strength_program_logs?select=*${profileFilter}&order=session_date.desc,completed_at.desc&limit=2000`),
  ])
  if (![goalsResult, crossGoalsResult, sessionsResult, plannedResult, assignmentsResult, programsResult, programGoalsResult].every((item) => item.ok)) throw new Error('Training data lookup failed')
  const assignments = await assignmentsResult.json()
  const existingSessions = await sessionsResult.json()
  const afterResponses = afterResponsesResult.ok ? await afterResponsesResult.json() : []
  if (profileId) {
    const existingKeys = new Set(existingSessions.map((item) => `${item.profile_id}|${item.session_date}|${item.session_slot}`))
    const missing = afterResponses.map((item) => {
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(item.created_at))
      return { profile_id: profileId, activity_type: 'swim', session_slot: 'afternoon_swim', session_date: date, source: 'checkin' }
    }).filter((item) => { const key = `${item.profile_id}|${item.session_date}|${item.session_slot}`; if (existingKeys.has(key)) return false; existingKeys.add(key); return true })
    if (missing.length) {
      // Komplettering av historiska svar får aldrig blockera veckovyn.
      await Promise.all(missing.map((item) => supabaseRequest('personal_training_sessions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(item) }).catch(() => null)))
    }
  }
  const allowedAssignments = new Set(assignments.map((item) => item.id))
  const programs = Object.fromEntries((await programsResult.json()).map((item) => [item.id, item]))
  const autoSessions = afterResponses.map((item) => ({
    profile_id: item.profile_id || profileId,
    activity_type: 'swim',
    session_slot: 'afternoon_swim',
    session_date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(item.created_at)),
    source: 'checkin',
  })).filter((item) => item.profile_id)
  const sessionRows = existingSessions.concat(autoSessions).filter((item, index, all) => all.findIndex((other) => `${other.profile_id}|${other.session_date}|${other.session_slot}` === `${item.profile_id}|${item.session_date}|${item.session_slot}`) === index)
  const workoutRows = workoutsResult.ok ? await workoutsResult.json() : []
  const swimMetrics = new Map()
  sessionRows.filter((item) => item.activity_type === 'swim').forEach((session) => {
    const expectedTime = session.session_slot === 'morning_swim' ? 'morning' : session.session_slot === 'afternoon_swim' ? 'afternoon' : ''
    const sameDay = workoutRows.filter((workout) => workout.workout_date === session.session_date)
    const timeMatches = expectedTime ? sameDay.filter((workout) => !workout.time_of_day || workout.time_of_day === expectedTime) : sameDay
    const candidates = timeMatches.length ? timeMatches : sameDay
    // En session motsvarar ett pass. Om flera rader finns samma tid väljs den
    // senast synkade/skapade raden i stället för att räkna meter flera gånger.
    const workout = candidates[candidates.length - 1]
    swimMetrics.set(`${session.session_date}|${session.session_slot}`, { distanceMeters: Number(workout?.distance_meters || 0) || null, durationMinutes: Number(workout?.duration_minutes || 0) || null })
  })
  const mappedPrograms = Object.values(programs).map((program) => ({ ...mapProgram(program), assignedCount: assignments.filter((item) => item.program_id === program.id).length }))
  const data = {
    seasonGoals: (await goalsResult.json()).map(mapSeasonGoal),
    crossGoals: (await crossGoalsResult.json()).map((goal) => ({ id: goal.id, profileId: goal.profile_id, strengthTarget: goal.strength_sessions_per_week, drylandTarget: goal.dryland_sessions_per_week, startDate: goal.start_date, endDate: goal.end_date })),
    sessions: sessionRows.map((item) => ({ id: item.id, profileId: item.profile_id, type: item.activity_type, slot: item.session_slot, date: item.session_date, source: item.source, completedAt: item.completed_at, ...(item.activity_type === 'swim' ? (swimMetrics.get(`${item.session_date}|${item.session_slot}`) || {}) : {}) })),
    plannedSessions: (await plannedResult.json()).map((item) => ({ id: item.id, profileId: item.profile_id, weekStart: item.week_start, date: item.planned_date, slot: item.session_slot })),
    programs: mappedPrograms,
    assignments: assignments.map((item) => ({ id: item.id, profileId: item.profile_id, program: mapProgram(programs[item.program_id]) })).filter((item) => item.program),
    strengthLogs: strengthLogsResult.ok ? (await strengthLogsResult.json()).map((item) => ({ id: item.id, assignmentId: item.assignment_id, profileId: item.profile_id, passNumber: item.pass_number, sessionDate: item.session_date, weights: item.weights || {}, notes: item.notes || '', completedAt: item.completed_at })) : [],
    programGoals: (await programGoalsResult.json()).filter((item) => !profileId || allowedAssignments.has(item.assignment_id)).map((item) => ({ id: item.id, assignmentId: item.assignment_id, title: item.title, description: item.description, rewardPoints: item.reward_points, status: item.status, coachFeedback: item.coach_feedback || '', submittedAt: item.submitted_at, approvedAt: item.approved_at })),
  }
  await awardCompletedWeeks(data, profileId)
  return data
}

const addDays = (date, days) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10) }
const mondayOnOrAfter = (date) => { const value = new Date(`${date}T12:00:00Z`); const offset = (value.getUTCDay() + 6) % 7; return offset === 0 ? date : addDays(date, 7 - offset) }

async function awardCompletedWeeks(data, profileId) {
  const currentMonday = currentWeekStart()
  const filter = profileId ? `&profile_id=eq.${profileId}` : ''
  const result = await supabaseRequest(`point_events?event_type=in.(weekly_goal,strength_weekly_goal,dryland_weekly_goal)${filter}&select=source_key&limit=10000`)
  if (!result.ok) throw new Error('Weekly rewards lookup failed')
  const existing = new Set((await result.json()).map((item) => item.source_key))
  const awards = []
  data.seasonGoals.forEach((goal) => {
    for (let monday = mondayOnOrAfter(goal.startDate); addDays(monday, 6) <= goal.endDate && addDays(monday, 7) <= currentMonday; monday = addDays(monday, 7)) {
      const sourceKey = `weekly:${goal.id}:${monday}`
      const end = addDays(monday, 7)
      const completed = data.sessions.filter((session) => session.profileId === goal.profileId && session.type === 'swim' && session.date >= monday && session.date < end).length
      if (completed >= goal.target && !existing.has(sourceKey)) { existing.add(sourceKey); awards.push(awardPoints(goal.profileId, 'weekly_goal', 5, sourceKey)); awards.push(awardArtifact(goal.profileId, 'goal_minded')) }
    }
  })
  data.crossGoals.forEach((goal) => {
    const goalEnd = goal.endDate || addDays(currentMonday, -1)
    for (let monday = mondayOnOrAfter(goal.startDate); addDays(monday, 6) <= goalEnd && addDays(monday, 7) <= currentMonday; monday = addDays(monday, 7)) {
      ;[['strength', goal.strengthTarget, 'strength_weekly_goal'], ['dryland', goal.drylandTarget, 'dryland_weekly_goal']].forEach(([type, target, eventType]) => {
        if (!target) return
        const sourceKey = `${eventType}:${goal.id}:${monday}`, end = addDays(monday, 7)
        const completed = data.sessions.filter((session) => session.profileId === goal.profileId && session.type === type && session.date >= monday && session.date < end).length
        if (completed >= target && !existing.has(sourceKey)) { existing.add(sourceKey); awards.push(awardPoints(goal.profileId, eventType, 5, sourceKey)) }
      })
    }
  })
  await Promise.all(awards)
}

async function findAssignment(id) {
  const result = await supabaseRequest(`program_assignments?id=eq.${id}&select=*,training_programs(program_type)&limit=1`)
  if (!result.ok) throw new Error('Assignment lookup failed')
  return (await result.json())[0] || null
}

function currentWeekStart() {
  const today = new Date(`${stockholmDate()}T12:00:00Z`)
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7))
  return today.toISOString().slice(0, 10)
}

async function trainingCheer(profileId, slot) {
  const type = slot.includes('swim') ? 'swim' : slot
  const targetResult = type === 'swim'
    ? await supabaseRequest(`season_swim_goals?profile_id=eq.${profileId}&active=eq.true&start_date=lte.${stockholmDate()}&end_date=gte.${stockholmDate()}&select=target_sessions_per_week&limit=1`)
    : await supabaseRequest(`cross_training_goals?profile_id=eq.${profileId}&start_date=lte.${stockholmDate()}&or=(end_date.is.null,end_date.gte.${stockholmDate()})&select=strength_sessions_per_week,dryland_sessions_per_week&order=start_date.desc&limit=1`)
  if (!targetResult.ok) return null
  const [goal] = await targetResult.json()
  const target = type === 'swim' ? goal?.target_sessions_per_week : type === 'strength' ? goal?.strength_sessions_per_week : goal?.dryland_sessions_per_week
  const sessionsResult = await supabaseRequest(`personal_training_sessions?profile_id=eq.${profileId}&activity_type=eq.${type}&session_date=gte.${currentWeekStart()}&session_date=lt.${addDays(currentWeekStart(), 7)}&select=id`)
  if (!sessionsResult.ok) return null
  const count = (await sessionsResult.json()).length
  const label = type === 'swim' ? 'simpass' : type === 'strength' ? 'styrkepass' : 'landträningar'
  if (target && count >= target) return `Grymt jobbat! Veckans mål är klart: ${count} av ${target} ${label}. 🎉`
  if (target) return `Bra jobbat! ${count} av ${target} ${label} klara den här veckan. ${target - count} kvar. 💪`
  return `Passet är registrerat. Bra att du håller koll på din träning! ✓`
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)
  try {
    if (request.method === 'GET') {
      if (role === 'coach') return sendJson(response, 200, await loadTraining())
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Träningsplanering visas bara för profiler.' })
      return sendJson(response, 200, await loadTraining(profile.id))
    }

    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    const action = request.body?.action

    if (role !== 'coach') {
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil.' })
      if (action === 'season-goal') {
        return sendJson(response, 403, { error: 'Tränaren sätter simmålet i dialog med simmaren.' })
        /* Kept below as documentation of the original validation contract. */
        const target = Number(request.body.target)
        const title = String(request.body.title || 'Mitt simmål').trim()
        const startDate = String(request.body.startDate || '')
        const endDate = String(request.body.endDate || '')
        const reflection = String(request.body.reflection || '').trim()
        if (!Number.isInteger(target) || target < 1 || target > 14 || !title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || reflection.length > 1000) return sendJson(response, 400, { error: 'Kontrollera ditt simmål.' })
        await supabaseRequest(`season_swim_goals?profile_id=eq.${profile.id}&active=eq.true`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
        const result = await supabaseRequest('season_swim_goals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ profile_id: profile.id, title, target_sessions_per_week: target, start_date: startDate, end_date: endDate, reflection: reflection || null }) })
        if (!result.ok) throw new Error(`Season goal insert failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 201, { goal: mapSeasonGoal((await result.json())[0]) })
      }
      if (action === 'complete-program') {
        const assignment = await findAssignment(String(request.body.assignmentId || ''))
        if (!assignment || assignment.profile_id !== profile.id) return sendJson(response, 403, { error: 'Programmet tillhör inte din profil.' })
        const type = assignment.training_programs?.program_type
        if (!['strength', 'dryland'].includes(type)) return sendJson(response, 400, { error: 'Ogiltig programtyp.' })
        const result = await supabaseRequest('personal_training_sessions', { method: 'POST', body: JSON.stringify({ profile_id: profile.id, activity_type: type, session_slot: type, session_date: stockholmDate(), source: 'program' }) })
        if (!result.ok && result.status !== 409) throw new Error(`Program completion failed: ${result.status}`)
        return sendJson(response, 201, { ok: true })
      }
      if (action === 'log-strength-pass') {
        const assignment = await findAssignment(String(request.body.assignmentId || ''))
        const passNumber = Number(request.body.passNumber)
        const sessionDate = String(request.body.sessionDate || stockholmDate())
        const weights = request.body.weights && typeof request.body.weights === 'object' && !Array.isArray(request.body.weights) ? request.body.weights : {}
        if (!assignment || assignment.profile_id !== profile.id) return sendJson(response, 403, { error: 'Programmet tillhör inte din profil.' })
        if (assignment.training_programs?.program_type !== 'strength' || !Number.isInteger(passNumber) || passNumber < 1 || passNumber > 3 || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate > stockholmDate()) return sendJson(response, 400, { error: 'Kontrollera passet och datumet.' })
        const safeWeights = Object.fromEntries(Object.entries(weights).slice(0, 40).map(([key, value]) => [String(key).slice(0, 120), String(value).trim().slice(0, 40)]).filter(([, value]) => value))
        const previousResult = await supabaseRequest(`strength_program_logs?assignment_id=eq.${assignment.id}&pass_number=eq.${passNumber}&session_date=lt.${sessionDate}&select=session_date,weights&order=session_date.desc&limit=1`)
        const previousLog = previousResult.ok ? (await previousResult.json())[0] : null
        const result = await supabaseRequest('strength_program_logs?on_conflict=assignment_id,pass_number,session_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ assignment_id: assignment.id, profile_id: profile.id, pass_number: passNumber, session_date: sessionDate, weights: safeWeights, notes: String(request.body.notes || '').trim().slice(0, 1000) || null, completed_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Strength log failed: ${result.status}`)
        const improvements = Object.entries(safeWeights).map(([exercise, value]) => {
          const before = comparableStrengthValue(previousLog?.weights?.[exercise]); const after = comparableStrengthValue(value)
          return before && after && before.unit === after.unit && after.value > before.value ? { exercise, before: String(previousLog.weights[exercise]), after: String(value) } : null
        }).filter(Boolean).slice(0, 6)
        if (improvements.length) {
          const details = encodeURIComponent(improvements.map((item) => `${item.exercise}|${item.before}|${item.after}`).join('~'))
          await awardPoints(profile.id, 'strength_progress', 3, `strength_progress:${sessionDate}:${passNumber}:${details}`)
        }
        const session = await supabaseRequest('personal_training_sessions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ profile_id: profile.id, activity_type: 'strength', session_slot: 'strength', session_date: sessionDate, source: 'program' }) })
        if (!session.ok && session.status !== 409) throw new Error(`Strength session failed: ${session.status}`)
        return sendJson(response, 201, { ok: true, log: (await result.json())[0] || null })
      }
      if (action === 'toggle-session') {
        const date = String(request.body.date || ''), slot = String(request.body.slot || '')
        const slots = { morning_swim: 'swim', afternoon_swim: 'swim', strength: 'strength', dryland: 'dryland' }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slots[slot] || date < currentWeekStart() || date > stockholmDate()) return sendJson(response, 400, { error: 'Du kan bara registrera pass under den pågående veckan.' })
        const filter = `profile_id=eq.${profile.id}&session_date=eq.${date}&session_slot=eq.${slot}`
        if (request.body.completed === true) {
          const existing = await supabaseRequest(`personal_training_sessions?${filter}&select=id&limit=1`)
          if (!existing.ok) throw new Error('Session lookup failed')
          if (!(await existing.json()).length) {
            const result = await supabaseRequest('personal_training_sessions', { method: 'POST', body: JSON.stringify({ profile_id: profile.id, activity_type: slots[slot], session_slot: slot, session_date: date, source: 'manual' }) })
            if (!result.ok && result.status !== 409) throw new Error(`Session insert failed: ${result.status}`)
          }
        } else {
          const result = await supabaseRequest(`personal_training_sessions?${filter}`, { method: 'DELETE' })
          if (!result.ok) throw new Error(`Session delete failed: ${result.status}`)
        }
        return sendJson(response, 200, { ok: true, message: request.body.completed === true && request.body.skipCheer !== true ? await trainingCheer(profile.id, slot) : null })
      }
      if (action === 'toggle-plan') {
        const date = String(request.body.date || ''), slot = String(request.body.slot || ''), weekStart = currentWeekStart()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['morning_swim', 'afternoon_swim', 'strength', 'dryland'].includes(slot) || date < stockholmDate() || date >= addDays(weekStart, 7)) return sendJson(response, 400, { error: 'Planeringen kan bara ändras för återstående dagar den här veckan.' })
        const filter = `profile_id=eq.${profile.id}&planned_date=eq.${date}&session_slot=eq.${slot}`
        if (request.body.planned === true) {
          const result = await supabaseRequest('planned_training_sessions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ profile_id: profile.id, week_start: weekStart, planned_date: date, session_slot: slot }) })
          if (!result.ok && result.status !== 409) throw new Error(`Plan insert failed: ${result.status}`)
        } else {
          const result = await supabaseRequest(`planned_training_sessions?${filter}`, { method: 'DELETE' })
          if (!result.ok) throw new Error(`Plan delete failed: ${result.status}`)
          return sendJson(response, 200, { ok: true, message: 'Planeringen är uppdaterad.' })
        }
        const planned = await supabaseRequest(`planned_training_sessions?profile_id=eq.${profile.id}&week_start=eq.${weekStart}&select=planned_date`)
        if (!planned.ok) throw new Error('Plan lookup failed')
        const plannedDays = new Set((await planned.json()).map((item) => item.planned_date)).size
        let message = plannedDays >= 3 ? `Bra planerat! Du har en plan för ${plannedDays} dagar den här veckan. 🗓️` : `Veckoplan: ${plannedDays} dagar planerade.`
        if (plannedDays >= 3) {
          const sourceKey = `planning:${profile.id}:${weekStart}`
          const existing = await supabaseRequest(`point_events?profile_id=eq.${profile.id}&event_type=eq.planning_weekly_goal&source_key=eq.${sourceKey}&select=id&limit=1`)
          if (existing.ok && !(await existing.json()).length) { await awardPoints(profile.id, 'planning_weekly_goal', 2, sourceKey); await awardArtifact(profile.id, 'proactive'); message = `${message} +2 poäng för proaktiv planering! ✨` }
        }
        return sendJson(response, 200, { ok: true, message })
      }
      if (action === 'submit-program-goal') {
        const result = await supabaseRequest(`program_goals?id=eq.${request.body.goalId}&status=in.(active,continue)&select=assignment_id&limit=1`)
        if (!result.ok) throw new Error('Program goal lookup failed')
        const [goal] = await result.json()
        const assignment = goal ? await findAssignment(goal.assignment_id) : null
        if (!assignment || assignment.profile_id !== profile.id) return sendJson(response, 403, { error: 'Målet tillhör inte din profil.' })
        await supabaseRequest(`program_goals?id=eq.${request.body.goalId}`, { method: 'PATCH', body: JSON.stringify({ status: 'submitted', submitted_at: new Date().toISOString() }) })
        return sendJson(response, 200, { ok: true })
      }
      return sendJson(response, 400, { error: 'Okänd åtgärd.' })
    }

    if (action === 'create-program') {
      const type = String(request.body.type || '')
      const title = String(request.body.title || '').trim(), description = String(request.body.description || '').trim(), content = String(request.body.content || '').trim()
      const startDate = String(request.body.startDate || ''), endDate = request.body.endDate || null
      const profileIds = [...new Set(Array.isArray(request.body.profileIds) ? request.body.profileIds : [])]
      if (!['strength', 'dryland'].includes(type) || !title || title.length > 100 || !description || description.length > 1000 || !content || content.length > 5000 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) || !profileIds.length) return sendJson(response, 400, { error: 'Kontrollera programmet och välj minst en simmare.' })
      const programResult = await supabaseRequest('training_programs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ program_type: type, title, description, content, start_date: startDate, end_date: endDate }) })
      if (!programResult.ok) throw new Error(`Program insert failed: ${programResult.status} ${await programResult.text()}`)
      const [program] = await programResult.json()
      if (profileIds.length) {
        const assignmentResult = await supabaseRequest('program_assignments', { method: 'POST', body: JSON.stringify(profileIds.map((profileId) => ({ program_id: program.id, profile_id: profileId }))) })
        if (!assignmentResult.ok) throw new Error(`Program assignment failed: ${assignmentResult.status}`)
      }
      return sendJson(response, 201, { program: mapProgram(program) })
    }
    if (action === 'cross-goals') {
      const profileId = String(request.body.profileId || ''), strength = Number(request.body.strengthTarget), dryland = Number(request.body.drylandTarget)
      if (!profileId || !Number.isInteger(strength) || strength < 0 || strength > 7 || !Number.isInteger(dryland) || dryland < 0 || dryland > 7) return sendJson(response, 400, { error: 'Målen ska vara mellan 0 och 7 pass per vecka.' })
      const startDate = addDays(currentWeekStart(), 7), previousEnd = addDays(startDate, -1)
      const closeResult = await supabaseRequest(`cross_training_goals?profile_id=eq.${profileId}&start_date=lt.${startDate}&end_date=is.null`, { method: 'PATCH', body: JSON.stringify({ end_date: previousEnd }) })
      if (!closeResult.ok) throw new Error('Cross goal close failed')
      const result = await supabaseRequest('cross_training_goals?on_conflict=profile_id,start_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ profile_id: profileId, strength_sessions_per_week: strength, dryland_sessions_per_week: dryland, start_date: startDate, end_date: null }) })
      if (!result.ok) throw new Error(`Cross goal insert failed: ${result.status}`)
      return sendJson(response, 201, { ok: true, startDate })
    }
    if (action === 'coach-season-goal') {
      const profileId = String(request.body.profileId || ''), target = Number(request.body.target)
      const title = String(request.body.title || 'Mitt simmål').trim(), startDate = String(request.body.startDate || stockholmDate()), endDate = String(request.body.endDate || `${new Date().getFullYear()}-12-20`), reflection = String(request.body.reflection || '').trim()
      if (!profileId || !Number.isInteger(target) || target < 1 || target > 14 || !title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || reflection.length > 1000) return sendJson(response, 400, { error: 'Kontrollera simmålet.' })
      const closeResult = await supabaseRequest(`season_swim_goals?profile_id=eq.${profileId}&active=eq.true`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
      if (!closeResult.ok) throw new Error('Season goal close failed')
      const result = await supabaseRequest('season_swim_goals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ profile_id: profileId, title, target_sessions_per_week: target, start_date: startDate, end_date: endDate, reflection: reflection || null }) })
      if (!result.ok) throw new Error(`Season goal insert failed: ${result.status}`)
      return sendJson(response, 201, { goal: mapSeasonGoal((await result.json())[0]) })
    }
    if (action === 'assign') {
      const programId = String(request.body.programId || ''), profileId = String(request.body.profileId || '')
      const programResult = await supabaseRequest(`training_programs?id=eq.${encodeURIComponent(programId)}&program_type=eq.strength&active=eq.true&select=id,program_type&limit=1`)
      if (!programResult.ok || !(await programResult.json()).length) return sendJson(response, 404, { error: 'Programmet finns inte eller är arkiverat.' })
      const existing = await supabaseRequest(`program_assignments?profile_id=eq.${encodeURIComponent(profileId)}&removed_at=is.null&select=id,training_programs!inner(program_type)`)
      if (!existing.ok) throw new Error('Existing assignment lookup failed')
      const oldStrength = (await existing.json()).filter((item) => item.training_programs?.program_type === 'strength')
      if (oldStrength.length) await Promise.all(oldStrength.map((item) => supabaseRequest(`program_assignments?id=eq.${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ removed_at: new Date().toISOString() }) })))
      const result = await supabaseRequest('program_assignments?on_conflict=program_id,profile_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ program_id: programId, profile_id: profileId }) })
      if (!result.ok) throw new Error(`Assignment failed: ${result.status}`)
      return sendJson(response, 201, { ok: true })
    }
    if (action === 'remove-assignment') {
      const assignmentId = String(request.body.assignmentId || '')
      if (!assignmentId) return sendJson(response, 400, { error: 'Tilldelningen saknas.' })
      const result = await supabaseRequest(`program_assignments?id=eq.${encodeURIComponent(assignmentId)}`, { method: 'PATCH', body: JSON.stringify({ removed_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Assignment removal failed: ${result.status}`)
      return sendJson(response, 200, { ok: true })
    }
    if (action === 'archive-program') {
      const programId = String(request.body.programId || '')
      if (!programId) return sendJson(response, 400, { error: 'Programmet saknas.' })
      const result = await supabaseRequest(`training_programs?id=eq.${encodeURIComponent(programId)}&program_type=eq.strength`, { method: 'PATCH', body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Program archive failed: ${result.status}`)
      return sendJson(response, 200, { ok: true })
    }
    if (action === 'delete-program') {
      const programId = String(request.body.programId || '')
      if (!programId) return sendJson(response, 400, { error: 'Programmet saknas.' })
      const assignmentsResult = await supabaseRequest(`program_assignments?program_id=eq.${encodeURIComponent(programId)}&select=id&limit=1`)
      if (!assignmentsResult.ok) throw new Error('Assignment lookup failed')
      if ((await assignmentsResult.json()).length) return sendJson(response, 409, { error: 'Programmet används fortfarande av en eller flera simmare. Ta bort tilldelningarna först.' })
      const logsResult = await supabaseRequest(`strength_program_logs?assignment_id=is.not.null&select=id,program_assignments!inner(program_id)&program_assignments.program_id=eq.${encodeURIComponent(programId)}&limit=1`)
      if (logsResult.ok && (await logsResult.json()).length) return sendJson(response, 409, { error: 'Programmet har träningshistorik och kan inte raderas permanent. Arkivera det i stället.' })
      const result = await supabaseRequest(`training_programs?id=eq.${encodeURIComponent(programId)}&program_type=eq.strength`, { method: 'DELETE' })
      if (!result.ok) throw new Error(`Program deletion failed: ${result.status}`)
      return sendJson(response, 200, { ok: true })
    }
    if (action === 'update-program') {
      const programId = String(request.body.programId || ''), title = String(request.body.title || '').trim(), description = String(request.body.description || '').trim(), content = String(request.body.content || '').trim()
      if (!programId || !title || title.length > 100 || !description || description.length > 1000 || !content || content.length > 5000) return sendJson(response, 400, { error: 'Kontrollera programmets namn, beskrivning och innehåll.' })
      const result = await supabaseRequest(`training_programs?id=eq.${encodeURIComponent(programId)}&program_type=eq.strength`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title, description, content, updated_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Program update failed: ${result.status}`)
      const [program] = await result.json()
      return sendJson(response, 200, { program: mapProgram(program) })
    }
    if (action === 'program-goal') {
      const points = Number(request.body.rewardPoints), title = String(request.body.title || '').trim(), description = String(request.body.description || '').trim()
      if (![5, 10, 20].includes(points) || !title || !description) return sendJson(response, 400, { error: 'Kontrollera programmålet.' })
      const assignment = await findAssignment(String(request.body.assignmentId || ''))
      if (!assignment) return sendJson(response, 404, { error: 'Tilldelningen finns inte.' })
      const result = await supabaseRequest('program_goals', { method: 'POST', body: JSON.stringify({ assignment_id: request.body.assignmentId, title, description, reward_points: points }) })
      if (!result.ok) throw new Error(`Program goal insert failed: ${result.status}`)
      return sendJson(response, 201, { ok: true })
    }
    if (action === 'review-program-goal') {
      const goalResult = await supabaseRequest(`program_goals?id=eq.${request.body.goalId}&status=eq.submitted&select=*,program_assignments(profile_id)&limit=1`)
      if (!goalResult.ok) throw new Error(`Goal review lookup failed: ${goalResult.status}`)
      const [goal] = await goalResult.json()
      if (!goal) return sendJson(response, 409, { error: 'Målet väntar inte på godkännande.' })
      const approved = request.body.approved === true
      const feedback = String(request.body.feedback || '').trim()
      const result = await supabaseRequest(`program_goals?id=eq.${goal.id}`, { method: 'PATCH', body: JSON.stringify({ status: approved ? 'approved' : 'continue', approved_at: approved ? new Date().toISOString() : null, coach_feedback: feedback || null }) })
      if (!result.ok) throw new Error('Goal review failed')
      if (approved) await awardPoints(goal.program_assignments.profile_id, 'program_goal', goal.reward_points, goal.id)
      return sendJson(response, 200, { ok: true })
    }
    return sendJson(response, 400, { error: 'Okänd åtgärd.' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hantera träningsplaneringen.' })
  }
}
