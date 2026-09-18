import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

function stockholmDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  try {
    const sessionProfile = role === 'swimmer' ? await getSessionProfile(request) : null
    if (role !== 'coach' && !sessionProfile) {
      return sendJson(response, 403, { error: 'Aktivitet visas bara för inloggade profiler.' })
    }
    const result = await supabaseRequest(`profile_daily_activity?activity_date=eq.${stockholmDate()}&select=profile_id`)
    if (!result.ok) throw new Error(`Activity GET failed: ${result.status} ${await result.text()}`)
    let activity = await result.json()
    if (role === 'coach') {
      const testProfiles = await supabaseRequest('profiles?is_test_profile=eq.true&select=id')
      if (!testProfiles.ok) throw new Error('Test profile lookup failed')
      const testIds = new Set((await testProfiles.json()).map((item) => item.id))
      activity = activity.filter((item) => !testIds.has(item.profile_id))
    }
    if (role === 'swimmer' && request.query?.streak === 'true') {
      const history = await supabaseRequest(`profile_daily_activity?profile_id=eq.${sessionProfile.id}&activity_date=gte.${new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)}&select=activity_date&order=activity_date.desc&limit=120`)
      if (!history.ok) throw new Error(`Activity history failed: ${history.status}`)
      return sendJson(response, 200, { activeProfilesToday: activity.length, activityDates: (await history.json()).map((item) => item.activity_date) })
    }
    return sendJson(response, 200, { activeProfilesToday: activity.length })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta dagens aktivitet.' })
  }
}
