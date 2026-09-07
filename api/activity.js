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
    if (role !== 'coach' && !(await getSessionProfile(request))) {
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
    return sendJson(response, 200, { activeProfilesToday: activity.length })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta dagens aktivitet.' })
  }
}
