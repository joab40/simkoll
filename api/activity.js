import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'
import { loadActivityDates } from '../server/activity-history.js'

export default async function handler(request, response) {
  if (!await guardCoachSession(request, response)) return
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  try {
    const sessionProfile = role === 'swimmer' ? await getSessionProfile(request) : null
    if (role !== 'coach' && !sessionProfile) {
      return sendJson(response, 403, { error: 'Aktivitet visas bara för inloggade profiler.' })
    }
    const today = stockholmDate()
    // Register the signed-in profile before reading its streak. Previously this
    // raced a separate workouts request, especially on restored/own-coach views.
    if (sessionProfile && request.query?.streak === 'true') await touchProfileActivity(sessionProfile.id, today)
    const result = await supabaseRequest(`profile_daily_activity?activity_date=eq.${today}&select=profile_id`)
    if (!result.ok) throw new Error(`Activity GET failed: ${result.status} ${await result.text()}`)
    let activity = await result.json()
    if (role === 'coach') {
      const testProfiles = await supabaseRequest('profiles?is_test_profile=eq.true&select=id')
      if (!testProfiles.ok) throw new Error('Test profile lookup failed')
      const testIds = new Set((await testProfiles.json()).map((item) => item.id))
      activity = activity.filter((item) => !testIds.has(item.profile_id))
    }
    if (role === 'swimmer' && request.query?.streak === 'true') {
      return sendJson(response, 200, { activeProfilesToday: activity.length, activityDates: await loadActivityDates(sessionProfile.id, supabaseRequest, today), today })
    }
    return sendJson(response, 200, { activeProfilesToday: activity.length })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta dagens aktivitet.' })
  }
}
import { guardCoachSession } from '../server/coach-session.js'
