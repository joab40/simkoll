import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { buildSwimmerTraffic, validTrafficDay } from '../shared/swimmer-traffic.js'

export async function loadSwimmerTraffic(asOf, read = supabaseRequest) {
  if (!validTrafficDay(asOf)) throw new Error('Ogiltigt datum för trafikljus.')
  const start = coachWeekAddDays(asOf, -13)
  const dated = field => `${field}=gte.${start}&${field}=lte.${asOf}`
  const rows = async query => {
    const result = await analyticsRows(query, read)
    if (!result.ok || result.truncated) throw new Error('Trafikljusunderlaget kunde inte hämtas fullständigt. Försök igen.')
    return result.json()
  }
  const [profiles, responses, sleep, sessions, plans] = await Promise.all([
    rows('profiles?active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id,created_at,active,approval_status,is_test_profile&order=id.asc'),
    rows(`responses?profile_id=not.is.null&${dated('activity_date')}&select=id,profile_id,activity_date,day_type,body,feeling&order=activity_date.asc,id.asc`),
    rows(`profile_daily_sleep?${dated('activity_date')}&select=profile_id,activity_date,minutes,quality,skipped&order=activity_date.asc,profile_id.asc`),
    rows(`personal_training_sessions?${dated('session_date')}&select=profile_id,session_date,session_slot&order=session_date.asc,id.asc`),
    rows(`planned_training_sessions?${dated('planned_date')}&select=profile_id,planned_date,session_slot&order=planned_date.asc,id.asc`),
  ])
  return buildSwimmerTraffic(profiles.map(row => ({ id: row.id, createdAt: row.created_at, active: row.active, approvalStatus: row.approval_status, isTestProfile: row.is_test_profile })), {
    responses: responses.map(row => ({ profileId: row.profile_id, date: row.activity_date, type: row.day_type, body: row.body, feeling: row.feeling })),
    sleep,
    sessions: sessions.map(row => ({ profileId: row.profile_id, date: row.session_date, slot: row.session_slot })),
    plans: plans.map(row => ({ profileId: row.profile_id, date: row.planned_date, slot: row.session_slot })),
  }, asOf)
}
