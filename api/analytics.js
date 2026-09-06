import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'

const stockholmKey = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const mean = (rows, key) => {
  const values = rows.map((row) => row[key]).filter((value) => typeof value === 'number')
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
}
const metrics = (responses, sessions, activities, privateView) => {
  const after = responses.filter((item) => item.day_type === 'after')
  const enough = privateView || responses.length >= 3
  return {
    checkins: responses.length,
    activeDays: new Set(activities.map((item) => item.activity_date)).size,
    swimSessions: sessions.filter((item) => item.activity_type === 'swim').length,
    strengthSessions: sessions.filter((item) => item.activity_type === 'strength').length,
    drylandSessions: sessions.filter((item) => item.activity_type === 'dryland').length,
    feeling: enough ? mean(responses, 'feeling') : null,
    body: enough ? mean(responses, 'body') : null,
    energy: enough ? mean(responses, 'energy') : null,
    rpe: enough ? mean(after, 'rpe') : null,
    passRating: enough ? mean(after, 'pass_rating') : null,
    setupRating: enough ? mean(after, 'setup_rating') : null,
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  if (getRole(String(request.headers['x-simkoll-code'] || '')) !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan se analysen.' })
  const start = String(request.query?.start || ''), end = String(request.query?.end || ''), previousStart = String(request.query?.previousStart || '')
  const profileId = request.query?.profileId ? String(request.query.profileId) : null
  if ([start, end, previousStart].some((value) => Number.isNaN(Date.parse(value))) || !(previousStart < start && start < end)) return sendJson(response, 400, { error: 'Ogiltig period.' })
  const profileFilter = profileId ? `&profile_id=eq.${encodeURIComponent(profileId)}` : ''
  const timestampRange = `&created_at=gte.${encodeURIComponent(previousStart)}&created_at=lt.${encodeURIComponent(end)}`
  const previousStartDay = stockholmKey(previousStart), endDay = stockholmKey(end)
  try {
    const [responsesResult, sessionsResult, activityResult] = await Promise.all([
      supabaseRequest(`responses?select=created_at,day_type,feeling,energy,body,rpe,pass_rating,setup_rating,comment${profileFilter}${timestampRange}&order=created_at.asc&limit=10000`),
      supabaseRequest(`personal_training_sessions?select=profile_id,activity_type,completed_at,session_date${profileFilter}&session_date=gte.${previousStartDay}&session_date=lt.${endDay}&limit=10000`),
      supabaseRequest(`profile_daily_activity?select=profile_id,activity_date${profileFilter}&activity_date=gte.${stockholmKey(previousStart)}&activity_date=lt.${stockholmKey(end)}&limit=10000`),
    ])
    if (![responsesResult, sessionsResult, activityResult].every((result) => result.ok)) throw new Error('Analytics lookup failed')
    const responses = await responsesResult.json(), sessions = await sessionsResult.json(), activities = await activityResult.json()
    const currentResponses = responses.filter((item) => item.created_at >= start), previousResponses = responses.filter((item) => item.created_at < start)
    const currentStartDay = stockholmKey(start)
    const currentSessions = sessions.filter((item) => item.session_date >= currentStartDay), previousSessions = sessions.filter((item) => item.session_date < currentStartDay)
    const currentActivities = activities.filter((item) => item.activity_date >= currentStartDay), previousActivities = activities.filter((item) => item.activity_date < currentStartDay)
    const spanDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000))
    const buckets = new Map()
    currentResponses.forEach((item) => {
      const date = new Date(item.created_at)
      let key = stockholmKey(date)
      if (spanDays > 14) {
        const weekday = (date.getUTCDay() + 6) % 7
        const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - weekday)
        key = stockholmKey(monday)
      }
      buckets.set(key, [...(buckets.get(key) || []), item])
    })
    const privateView = Boolean(profileId)
    return sendJson(response, 200, {
      current: metrics(currentResponses, currentSessions, currentActivities, privateView),
      previous: metrics(previousResponses, previousSessions, previousActivities, privateView),
      trend: [...buckets.entries()].map(([date, rows]) => ({ date, count: rows.length, feeling: privateView || rows.length >= 3 ? mean(rows, 'feeling') : null, body: privateView || rows.length >= 3 ? mean(rows, 'body') : null, rpe: privateView || rows.length >= 3 ? mean(rows.filter((item) => item.day_type === 'after'), 'rpe') : null })),
      recent: privateView ? currentResponses.filter((item) => item.comment).slice(-10).reverse().map((item) => ({ date: item.created_at, feeling: item.feeling, comment: item.comment })) : [],
      privacyLimited: !privateView && currentResponses.length > 0 && currentResponses.length < 3,
    })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta analysen.' })
  }
}
