import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  try {
    if (role === 'coach') {
      const [pointsResult, levelsResult] = await Promise.all([
        supabaseRequest('point_events?select=profile_id,points&limit=10000'),
        supabaseRequest('reward_levels?select=name,emoji,min_points,sort_order&order=sort_order.asc'),
      ])
      if (!pointsResult.ok || !levelsResult.ok) throw new Error('Coach points lookup failed')
      const totals = (await pointsResult.json()).reduce((result, event) => ({ ...result, [event.profile_id]: (result[event.profile_id] || 0) + event.points }), {})
      const levels = await levelsResult.json()
      return sendJson(response, 200, { profiles: Object.entries(totals).map(([profileId, total]) => {
        const current = [...levels].reverse().find((level) => total >= level.min_points) || levels[0]
        return { profileId, total, level: current ? { name: current.name, emoji: current.emoji } : null }
      }) })
    }
    const profile = await getSessionProfile(request)
    if (!profile || role !== 'swimmer') return sendJson(response, 403, { error: 'Poäng visas bara på din egen profil.' })
    const [pointsResult, levelsResult] = await Promise.all([
      supabaseRequest(`point_events?profile_id=eq.${profile.id}&select=points,event_type,created_at&order=created_at.desc&limit=1000`),
      supabaseRequest('reward_levels?select=name,emoji,min_points,sort_order&order=sort_order.asc'),
    ])
    if (!pointsResult.ok || !levelsResult.ok) throw new Error('Points lookup failed')
    const events = await pointsResult.json()
    const levels = await levelsResult.json()
    const total = events.reduce((sum, event) => sum + event.points, 0)
    const current = [...levels].reverse().find((level) => total >= level.min_points) || levels[0]
    const next = levels.find((level) => level.min_points > total) || null
    return sendJson(response, 200, {
      total, current: current ? { name: current.name, emoji: current.emoji, minPoints: current.min_points } : null,
      next: next ? { name: next.name, emoji: next.emoji, minPoints: next.min_points } : null,
    })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta poängen.' })
  }
}
