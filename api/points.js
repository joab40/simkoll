import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

const POINT_RULES = [
  { activity: 'Daglig aktivitet', points: 1, limit: 'En gång per dag' },
  { activity: 'Lämna feedback', points: 3, limit: 'En gång per dag' },
  { activity: 'Skicka eller få pepp', points: 1, limit: 'Högst två av varje per dag' },
  { activity: 'Bra framsteg / stark vecka', points: 5, limit: 'Efter tränarens bedömning' },
  { activity: 'Delmål klart', points: 10, limit: 'Efter tränarens bedömning' },
  { activity: 'Utvecklingsmål klart', points: 20, limit: 'Efter tränarens bedömning' },
  { activity: 'Programmål klart', points: '5, 10 eller 20', limit: 'Efter tränarens godkännande' },
]

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  try {
    if (request.method === 'POST') {
      if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra nivåer.' })
      const action = request.body?.action
      if (action === 'add-level') {
        const name = String(request.body.name || '').trim(), emoji = String(request.body.emoji || '').trim(), minPoints = Number(request.body.minPoints)
        if (!name || name.length > 30 || !emoji || emoji.length > 16 || !Number.isInteger(minPoints) || minPoints < 1 || minPoints > 100000) return sendJson(response, 400, { error: 'Kontrollera den nya nivån.' })
        const orderResult = await supabaseRequest('reward_levels?select=sort_order&order=sort_order.desc&limit=1')
        if (!orderResult.ok) throw new Error('Level order lookup failed')
        const [last] = await orderResult.json()
        const result = await supabaseRequest('reward_levels', { method: 'POST', body: JSON.stringify({ name, emoji, min_points: minPoints, sort_order: (last?.sort_order || 0) + 1 }) })
        if (!result.ok) return sendJson(response, 409, { error: 'Namnet eller poänggränsen används redan.' })
        return sendJson(response, 201, { ok: true })
      }
      if (action === 'update-level') {
        const id = Number(request.body.id), name = String(request.body.name || '').trim(), emoji = String(request.body.emoji || '').trim(), minPoints = Number(request.body.minPoints)
        if (!Number.isInteger(id) || !name || name.length > 30 || !emoji || emoji.length > 16 || !Number.isInteger(minPoints) || minPoints < 0 || minPoints > 100000) return sendJson(response, 400, { error: 'Kontrollera nivån.' })
        const result = await supabaseRequest(`reward_levels?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ name, emoji, min_points: minPoints }) })
        if (!result.ok) return sendJson(response, 409, { error: 'Namnet eller poänggränsen används redan.' })
        return sendJson(response, 200, { ok: true })
      }
      if (action === 'delete-level') {
        const id = Number(request.body.id)
        const lookup = await supabaseRequest(`reward_levels?id=eq.${id}&select=min_points&limit=1`)
        if (!lookup.ok) throw new Error('Level lookup failed')
        const [level] = await lookup.json()
        if (!level) return sendJson(response, 404, { error: 'Nivån finns inte.' })
        if (level.min_points === 0) return sendJson(response, 400, { error: 'Startnivån kan inte tas bort.' })
        const result = await supabaseRequest(`reward_levels?id=eq.${id}`, { method: 'DELETE' })
        if (!result.ok) throw new Error('Level delete failed')
        return sendJson(response, 200, { ok: true })
      }
      return sendJson(response, 400, { error: 'Okänd åtgärd.' })
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
    if (role === 'coach') {
      const [pointsResult, levelsResult, profilesResult] = await Promise.all([
        supabaseRequest('point_events?select=profile_id,points&limit=10000'),
        supabaseRequest('reward_levels?select=id,name,emoji,min_points,sort_order&order=min_points.asc'),
        supabaseRequest('profiles?select=id&active=eq.true&approval_status=eq.approved'),
      ])
      if (!pointsResult.ok || !levelsResult.ok || !profilesResult.ok) throw new Error('Coach points lookup failed')
      const totals = (await pointsResult.json()).reduce((result, event) => ({ ...result, [event.profile_id]: (result[event.profile_id] || 0) + event.points }), {})
      const levels = await levelsResult.json()
      return sendJson(response, 200, { rules: POINT_RULES, levels: levels.map((level) => ({ id: level.id, name: level.name, emoji: level.emoji, minPoints: level.min_points })), profiles: (await profilesResult.json()).map(({ id: profileId }) => {
        const total = totals[profileId] || 0
        const current = [...levels].reverse().find((level) => total >= level.min_points) || levels[0]
        const next = levels.find((level) => level.min_points > total) || null
        return { profileId, total, level: current ? { name: current.name, emoji: current.emoji, minPoints: current.min_points } : null, next: next ? { name: next.name, emoji: next.emoji, minPoints: next.min_points, remaining: next.min_points - total } : null }
      }) })
    }
    const profile = await getSessionProfile(request)
    if (!profile || role !== 'swimmer') return sendJson(response, 403, { error: 'Poäng visas bara på din egen profil.' })
    const [pointsResult, levelsResult] = await Promise.all([
      supabaseRequest(`point_events?profile_id=eq.${profile.id}&select=points,event_type,created_at&order=created_at.desc&limit=1000`),
      supabaseRequest('reward_levels?select=name,emoji,min_points,sort_order&order=min_points.asc'),
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
