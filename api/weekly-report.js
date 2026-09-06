import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'

const average = (items, key) => {
  const values = items.map((item) => item[key]).filter((value) => typeof value === 'number')
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  if (getRole(String(request.headers['x-simkoll-code'] || '')) !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan se veckorapporten.' })
  const start = String(request.query?.start || '')
  const end = String(request.query?.end || '')
  const startDay = String(request.query?.startDay || '')
  const endDay = String(request.query?.endDay || '')
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || end <= start || !/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return sendJson(response, 400, { error: 'Ogiltig vecka.' })
  const range = `&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}`
  try {
    const [responsesResult, activityResult, kudosResult, sessionsResult, programGoalsResult, goalUpdatesResult] = await Promise.all([
      supabaseRequest(`responses?select=feeling,body,rpe,pass_rating,setup_rating,day_type${range}&limit=5000`),
      supabaseRequest(`profile_daily_activity?select=profile_id,activity_date&activity_date=gte.${startDay}&activity_date=lt.${endDay}&limit=5000`),
      supabaseRequest(`kudos?select=id${range}&limit=5000`),
      supabaseRequest(`personal_training_sessions?select=activity_type&session_date=gte.${startDay}&session_date=lt.${endDay}&limit=5000`),
      supabaseRequest(`program_goals?select=id,reward_points&approved_at=gte.${encodeURIComponent(start)}&approved_at=lt.${encodeURIComponent(end)}&limit=1000`),
      supabaseRequest(`goal_updates?select=id,points,feedback_type${range}&author_role=eq.coach&limit=1000`),
    ])
    const results = [responsesResult, activityResult, kudosResult, sessionsResult, programGoalsResult, goalUpdatesResult]
    if (!results.every((result) => result.ok)) throw new Error('Weekly report lookup failed')
    const checkins = await responsesResult.json()
    const activities = await activityResult.json()
    const kudos = await kudosResult.json()
    const sessions = await sessionsResult.json()
    const programGoals = await programGoalsResult.json()
    const goalUpdates = await goalUpdatesResult.json()
    const after = checkins.filter((item) => item.day_type === 'after')
    const activeProfiles = new Set(activities.map((item) => item.profile_id)).size
    const activeDays = new Set(activities.map((item) => item.activity_date)).size
    const lowBody = checkins.filter((item) => item.body != null && item.body <= 2).length
    const highRpe = after.filter((item) => item.rpe != null && item.rpe >= 9).length
    const lowPass = after.filter((item) => item.pass_rating != null && item.pass_rating <= 1).length
    const approvedGoals = programGoals.length + goalUpdates.filter((item) => item.feedback_type === 'goal_complete').length
    return sendJson(response, 200, {
      checkins: checkins.length, afterSessions: after.length, activeProfiles, activeDays, kudos: kudos.length,
      swims: sessions.filter((item) => item.activity_type === 'swim').length,
      strength: sessions.filter((item) => item.activity_type === 'strength').length,
      dryland: sessions.filter((item) => item.activity_type === 'dryland').length,
      approvedGoals, feeling: average(checkins, 'feeling'), body: average(checkins, 'body'), rpe: average(after, 'rpe'), passRating: average(after, 'pass_rating'), setupRating: average(after, 'setup_rating'),
      signals: { lowBody, highRpe, lowPass },
    })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte skapa veckorapporten.' })
  }
}
