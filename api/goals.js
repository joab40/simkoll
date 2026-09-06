import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints, getSessionProfile } from '../server/profile-auth.js'

const STATUSES = ['planned', 'active', 'paused', 'complete']
const FEEDBACK = {
  progress: { points: 5, event: 'goal_progress' },
  strong_week: { points: 5, event: 'goal_progress' },
  milestone: { points: 10, event: 'goal_progress' },
  goal_complete: { points: 20, event: 'goal_complete' },
}

const mapGoal = (goal, updates = []) => ({
  id: goal.id, profileId: goal.profile_id, title: goal.title, description: goal.description,
  nextStep: goal.next_step || '', startDate: goal.start_date, targetDate: goal.target_date,
  status: goal.status, createdAt: goal.created_at, updatedAt: goal.updated_at,
  updates: updates.filter((item) => item.goal_id === goal.id).map((item) => ({
    id: item.id, authorRole: item.author_role, content: item.content,
    feedbackType: item.feedback_type, points: item.points, createdAt: item.created_at,
  })),
})

async function loadGoals(profileId = null) {
  const filter = profileId ? `&profile_id=eq.${profileId}` : ''
  const goalsResult = await supabaseRequest(`development_goals?select=*${filter}&order=updated_at.desc`)
  if (!goalsResult.ok) throw new Error(`Goals GET failed: ${goalsResult.status} ${await goalsResult.text()}`)
  const goals = await goalsResult.json()
  if (!goals.length) return []
  const updatesResult = await supabaseRequest(`goal_updates?goal_id=in.(${goals.map((goal) => goal.id).join(',')})&select=*&order=created_at.desc`)
  if (!updatesResult.ok) throw new Error(`Goal updates GET failed: ${updatesResult.status}`)
  const updates = await updatesResult.json()
  return goals.map((goal) => mapGoal(goal, updates))
}

async function findGoal(id) {
  const result = await supabaseRequest(`development_goals?id=eq.${id}&select=*&limit=1`)
  if (!result.ok) throw new Error(`Goal lookup failed: ${result.status}`)
  return (await result.json())[0] || null
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)
  try {
    if (request.method === 'GET') {
      if (role === 'coach') return sendJson(response, 200, { goals: await loadGoals() })
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Mål visas bara för inloggade profiler.' })
      return sendJson(response, 200, { goals: await loadGoals(profile.id) })
    }

    if (request.method === 'POST' && role === 'coach') {
      const action = request.body?.action
      if (action === 'create') {
        const profileId = String(request.body.profileId || '')
        const title = String(request.body.title || '').trim()
        const description = String(request.body.description || '').trim()
        const nextStep = String(request.body.nextStep || '').trim()
        const startDate = String(request.body.startDate || '')
        const targetDate = request.body.targetDate ? String(request.body.targetDate) : null
        if (!profileId || !title || title.length > 100 || !description || description.length > 2000 || nextStep.length > 500 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return sendJson(response, 400, { error: 'Kontrollera målformuläret.' })
        const result = await supabaseRequest('development_goals', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ profile_id: profileId, title, description, next_step: nextStep || null, start_date: startDate, target_date: targetDate, status: 'active' }),
        })
        if (!result.ok) throw new Error(`Goal insert failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 201, { goal: mapGoal((await result.json())[0]) })
      }
      if (action === 'status') {
        const status = String(request.body.status || '')
        if (!STATUSES.includes(status)) return sendJson(response, 400, { error: 'Ogiltig status.' })
        const result = await supabaseRequest(`development_goals?id=eq.${request.body.goalId}`, { method: 'PATCH', body: JSON.stringify({ status, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Goal status failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (action === 'feedback') {
        const goal = await findGoal(String(request.body.goalId || ''))
        const feedback = FEEDBACK[request.body.feedbackType]
        const content = String(request.body.content || '').trim()
        if (!goal || !feedback || !content || content.length > 1000) return sendJson(response, 400, { error: 'Kontrollera återkopplingen.' })
        if (request.body.feedbackType === 'goal_complete') {
          const existingResult = await supabaseRequest(`point_events?profile_id=eq.${goal.profile_id}&event_type=eq.goal_complete&source_key=eq.${goal.id}&select=id&limit=1`)
          if (!existingResult.ok) throw new Error(`Goal reward lookup failed: ${existingResult.status}`)
          if ((await existingResult.json()).length) return sendJson(response, 409, { error: 'Slutpoängen för det här målet är redan utdelad.' })
        }
        const result = await supabaseRequest('goal_updates', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ goal_id: goal.id, author_role: 'coach', content, feedback_type: request.body.feedbackType, points: feedback.points }),
        })
        if (!result.ok) throw new Error(`Feedback insert failed: ${result.status} ${await result.text()}`)
        const [update] = await result.json()
        await awardPoints(goal.profile_id, feedback.event, feedback.points, feedback.event === 'goal_complete' ? goal.id : update.id)
        if (request.body.feedbackType === 'goal_complete') await supabaseRequest(`development_goals?id=eq.${goal.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'complete', updated_at: new Date().toISOString() }) })
        return sendJson(response, 201, { ok: true })
      }
    }

    if (request.method === 'POST') {
      const profile = await getSessionProfile(request)
      const goal = await findGoal(String(request.body?.goalId || ''))
      const content = String(request.body?.content || '').trim()
      if (!profile || !goal || goal.profile_id !== profile.id || !content || content.length > 1000) return sendJson(response, 400, { error: 'Kunde inte spara reflektionen.' })
      const result = await supabaseRequest('goal_updates', { method: 'POST', body: JSON.stringify({ goal_id: goal.id, author_role: 'swimmer', content, points: 0 }) })
      if (!result.ok) throw new Error(`Reflection insert failed: ${result.status}`)
      return sendJson(response, 201, { ok: true })
    }

    if (request.method === 'DELETE' && role === 'coach') {
      const result = await supabaseRequest(`development_goals?id=eq.${request.query?.id || ''}`, { method: 'DELETE' })
      if (!result.ok) throw new Error(`Goal delete failed: ${result.status}`)
      return sendJson(response, 200, { ok: true })
    }
    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hantera utvecklingsmålen.' })
  }
}
