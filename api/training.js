import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints, getSessionProfile } from '../server/profile-auth.js'

const mapProgram = (program) => ({ id: program.id, type: program.program_type, title: program.title, description: program.description, content: program.content, startDate: program.start_date, endDate: program.end_date, active: program.active })
const mapSeasonGoal = (goal) => ({ id: goal.id, profileId: goal.profile_id, title: goal.title, target: goal.target_sessions_per_week, startDate: goal.start_date, endDate: goal.end_date, reflection: goal.reflection || '', active: goal.active })

async function loadTraining(profileId = null) {
  const profileFilter = profileId ? `&profile_id=eq.${profileId}` : ''
  const [goalsResult, sessionsResult, assignmentsResult, programsResult, programGoalsResult] = await Promise.all([
    supabaseRequest(`season_swim_goals?select=*${profileFilter}&order=start_date.desc`),
    supabaseRequest(`personal_training_sessions?select=*${profileFilter}&order=completed_at.desc&limit=1000`),
    supabaseRequest(`program_assignments?select=*${profileFilter}`),
    supabaseRequest('training_programs?select=*&order=created_at.desc'),
    supabaseRequest('program_goals?select=*&order=created_at.desc'),
  ])
  if (![goalsResult, sessionsResult, assignmentsResult, programsResult, programGoalsResult].every((item) => item.ok)) throw new Error('Training data lookup failed')
  const assignments = await assignmentsResult.json()
  const allowedAssignments = new Set(assignments.map((item) => item.id))
  const programs = Object.fromEntries((await programsResult.json()).map((item) => [item.id, item]))
  return {
    seasonGoals: (await goalsResult.json()).map(mapSeasonGoal),
    sessions: (await sessionsResult.json()).map((item) => ({ id: item.id, profileId: item.profile_id, type: item.activity_type, source: item.source, completedAt: item.completed_at })),
    assignments: assignments.map((item) => ({ id: item.id, profileId: item.profile_id, program: mapProgram(programs[item.program_id]) })).filter((item) => item.program),
    programGoals: (await programGoalsResult.json()).filter((item) => !profileId || allowedAssignments.has(item.assignment_id)).map((item) => ({ id: item.id, assignmentId: item.assignment_id, title: item.title, description: item.description, rewardPoints: item.reward_points, status: item.status, coachFeedback: item.coach_feedback || '', submittedAt: item.submitted_at, approvedAt: item.approved_at })),
  }
}

async function findAssignment(id) {
  const result = await supabaseRequest(`program_assignments?id=eq.${id}&select=*,training_programs(program_type)&limit=1`)
  if (!result.ok) throw new Error('Assignment lookup failed')
  return (await result.json())[0] || null
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
        const result = await supabaseRequest('personal_training_sessions', { method: 'POST', body: JSON.stringify({ profile_id: profile.id, activity_type: type, source: 'program' }) })
        if (!result.ok) throw new Error(`Program completion failed: ${result.status}`)
        return sendJson(response, 201, { ok: true })
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
    if (action === 'assign') {
      const result = await supabaseRequest('program_assignments?on_conflict=program_id,profile_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ program_id: request.body.programId, profile_id: request.body.profileId }) })
      if (!result.ok) throw new Error(`Assignment failed: ${result.status}`)
      return sendJson(response, 201, { ok: true })
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
