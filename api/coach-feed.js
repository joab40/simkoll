import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'

const eventLabels = {
  personal_best: ['personal_best', '🏆 Nytt personbästa'],
  goal_complete: ['achievement', '🎯 Mål uppnått'],
  weekly_goal: ['achievement', '✅ Veckomål uppnått'],
  strength_weekly_goal: ['strength', '🏋️ Styrkemål uppnått'],
  dryland_weekly_goal: ['strength', '🤸 Landträningsmål uppnått'],
  kudos_received: ['achievement', '💬 Pepp mottagen'],
}

export default async function handler(request, response) {
  if (getRole(String(request.headers['x-simkoll-code'] || '')) !== 'coach') return sendJson(response, 403, { error: 'Endast tränare har åtkomst.' })
  try {
    if (request.method === 'GET') {
      const [feedResult, pointsResult, profilesResult] = await Promise.all([
        supabaseRequest('coach_activity_feed?select=*&order=created_at.desc&limit=100'),
        supabaseRequest('point_events?event_type=in.(personal_best,goal_complete,weekly_goal,strength_weekly_goal,dryland_weekly_goal,kudos_received)&select=profile_id,event_type,points,created_at,source_key&order=created_at.desc&limit=100'),
        supabaseRequest('profiles?select=id,display_name,emoji'),
      ])
      if (!feedResult.ok) throw new Error('Coach feed lookup failed')
      const profiles = profilesResult.ok ? Object.fromEntries((await profilesResult.json()).map((item) => [item.id, item])) : {}
      const manual = (await feedResult.json()).map((item) => ({ id: item.id, eventType: item.event_type, profileId: item.profile_id, title: item.title, detail: item.detail || '', points: item.points, stars: item.stars, createdAt: item.created_at, sender: item.created_by || 'Tränare', profile: profiles[item.profile_id] ? { displayName: profiles[item.profile_id].display_name, emoji: profiles[item.profile_id].emoji } : null }))
      const automatic = pointsResult.ok ? (await pointsResult.json()).map((item) => { const [eventType, title] = eventLabels[item.event_type] || ['achievement', '✨ Positiv utveckling']; return { id: `point-${item.created_at}-${item.profile_id}-${item.event_type}`, eventType, profileId: item.profile_id, title, detail: item.source_key ? `Registrerad i Simkoll · ${item.source_key.split(':')[0]}` : '', points: item.points, stars: null, createdAt: item.created_at, sender: 'Simkoll', profile: profiles[item.profile_id] ? { displayName: profiles[item.profile_id].display_name, emoji: profiles[item.profile_id].emoji } : null } }) : []
      return sendJson(response, 200, { events: [...manual, ...automatic].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 150) })
    }
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    const body = request.body || {}
    const eventType = String(body.eventType || 'note')
    const title = String(body.title || '').trim()
    const detail = String(body.detail || '').trim()
    if (!['achievement', 'personal_best', 'strength', 'attendance', 'star', 'note'].includes(eventType) || !title || title.length > 160 || detail.length > 1000) return sendJson(response, 400, { error: 'Kontrollera kategori och text.' })
    const result = await supabaseRequest('coach_activity_feed', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ event_type: eventType, profile_id: body.profileId || null, title, detail: detail || null, points: Number.isFinite(Number(body.points)) ? Math.max(0, Math.min(1000, Number(body.points))) : null, stars: Number.isInteger(Number(body.stars)) ? Math.max(0, Math.min(4, Number(body.stars))) : null, created_by: 'Tränare' }) })
    if (!result.ok) throw new Error(`Coach feed insert failed: ${result.status}`)
    return sendJson(response, 201, { event: (await result.json())[0] })
  } catch (error) { return sendJson(response, 500, { error: error.message || 'Kunde inte läsa tränarflödet.' }) }
}
