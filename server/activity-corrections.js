import { coachFromRequest } from './coach-auth.js'
import { sendJson, supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { analyticsRows } from './analytics-rows.js'
import { loadActivityDates } from './activity-history.js'
import { validActivityDay, activityStreak, stockholmActivityDay } from '../shared/activity-streak.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function handleActivityCorrections(request, response, { read = supabaseRequest, today = stockholmDate() } = {}) {
  // The enclosing API also checks active account, role and session version.
  const actor = coachFromRequest(request)
  if (actor?.role !== 'superadmin' || !actor.sub) return sendJson(response, 403, { error: 'Endast superadmin kan rätta aktivitetsdagar.' })
  if (!['GET', 'POST'].includes(request.method)) return sendJson(response, 405, { error: 'Metoden stöds inte.' })
  const profileId = request.method === 'GET' ? request.query?.profileId : request.body?.profileId
  if (typeof profileId !== 'string' || !uuid.test(profileId)) return sendJson(response, 400, { error: 'Välj en giltig simmarprofil.' })
  try {
    const lookup = await read(`profiles?id=eq.${profileId}&select=id,display_name,username,emoji,created_at&limit=1`)
    if (!lookup.ok) throw new Error('Profile lookup unavailable')
    const [profile] = await lookup.json()
    if (!profile) return sendJson(response, 404, { error: 'Simmarprofilen finns inte längre.' })
    const createdDay = profile.created_at ? stockholmActivityDay(new Date(profile.created_at)) : '1900-01-01'
    if (request.method === 'GET') {
      const [activityDates, correctionResult] = await Promise.all([
        loadActivityDates(profileId, read, today),
        analyticsRows(`profile_activity_corrections?profile_id=eq.${profileId}&select=activity_date,reason,created_at&order=activity_date.desc`, read),
      ])
      if (!correctionResult.ok || correctionResult.truncated) return sendJson(response, 503, { error: 'Rättelsehistoriken kunde inte hämtas. Kontrollera att SQL 123 är körd.' })
      return sendJson(response, 200, { profile: { id: profile.id, displayName: profile.display_name || profile.username, emoji: profile.emoji }, today, createdDay, activityDates, corrections: await correctionResult.json(), streak: activityStreak(activityDates, today) })
    }
    const { activityDate, reason, confirmed } = request.body || {}
    if (!validActivityDay(activityDate) || activityDate > today || activityDate < createdDay) return sendJson(response, 400, { error: 'Välj en dag från profilens skapandedatum till och med idag. Framtida dagar kan inte läggas till.' })
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) return sendJson(response, 400, { error: 'Ange en anledning på 5–500 tecken.' })
    if (confirmed !== true) return sendJson(response, 400, { error: 'Bekräfta simmare och datum innan rättelsen sparas.' })
    // One database transaction: recheck actor/version, insert missing day and
    // provenance/audit together. No activity/points helper, training or check-in.
    const saved = await read('rpc/correct_profile_activity_day', { method: 'POST', body: JSON.stringify({ p_actor_id: actor.sub, p_session_version: actor.ver || 0, p_profile_id: profileId, p_activity_date: activityDate, p_reason: reason.trim() }) })
    if (!saved.ok) {
      if ([401, 403].includes(saved.status)) return sendJson(response, 403, { error: 'Superadminbehörigheten är inte längre giltig. Logga in igen.' })
      return sendJson(response, 503, { error: 'Rättelsen kunde inte bekräftas. Läs historiken innan du försöker igen. Kontrollera att SQL 123 är körd.' })
    }
    const result = await saved.json()
    return sendJson(response, 200, { added: result.added === true, activityDate, message: result.added ? 'Aktivitetsdagen är tillagd och rättelsen loggad. Ingen träningsrapport eller extra poäng har skapats av rättelsen.' : 'Dagen var redan registrerad. Inget ändrades och inga poäng lades till.' })
  } catch {
    return sendJson(response, 503, { error: 'Aktivitetshistoriken eller rättelsen kunde inte bekräftas. Hämta historiken på nytt innan du försöker igen.' })
  }
}
