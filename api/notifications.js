import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

const GROUP_TEMPLATES = {
  group_energy: 'Bra energi på träningen idag! ⚡',
  group_fun: 'Kul att simma med er! 🌊',
  group_great_job: 'Grymt jobbat allihop! 💪',
  group_thanks: 'Tack för ett bra pass! 🙌',
  group_spirit: 'Härlig stämning idag! 😊',
}

const KUDOS_TEMPLATES = {
  great_job: 'Grymt jobbat idag! 💪',
  great_energy: 'Bra energi! ⚡',
  nice_technique: 'Snygg teknik! 🌊',
  thanks: 'Tack för peppen! 🙌',
  fun_together: 'Kul att träna med dig! 😊',
  strong_effort: 'Stark insats! 🔥',
}

const sinceDate = () => new Date(Date.now() - 14 * 86400000).toISOString()

async function profilesById() {
  const result = await supabaseRequest('profiles?select=id,display_name,emoji&active=eq.true')
  if (!result.ok) throw new Error(`Notification profiles failed: ${result.status}`)
  return Object.fromEntries((await result.json()).map((item) => [item.id, { displayName: item.display_name, emoji: item.emoji }]))
}

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  if (request.method !== 'GET' || role !== 'swimmer') return sendJson(response, 403, { error: 'Notiser visas bara för inloggade simmare.' })

  try {
    const profile = await getSessionProfile(request)
    if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil för att se nya händelser.' })
    const since = sinceDate()
    const [profiles, postsResult, groupResult, kudosResult, goalsResult, artifactsResult] = await Promise.all([
      profilesById(),
      supabaseRequest(`community_posts?deleted_at=is.null&created_at=gte.${encodeURIComponent(since)}&select=id,content,created_at&order=created_at.desc&limit=30`),
      supabaseRequest(`group_pep?created_at=gte.${encodeURIComponent(since)}&select=id,sender_profile_id,template_key,created_at&order=created_at.desc&limit=30`),
      supabaseRequest(`kudos?recipient_profile_id=eq.${profile.id}&created_at=gte.${encodeURIComponent(since)}&select=id,sender_profile_id,template_key,created_at&order=created_at.desc&limit=30`),
      supabaseRequest(`development_goals?profile_id=eq.${profile.id}&updated_at=gte.${encodeURIComponent(since)}&select=id,title,updated_at&order=updated_at.desc&limit=30`),
      supabaseRequest(`profile_artifacts?profile_id=eq.${profile.id}&created_at=gte.${encodeURIComponent(since)}&select=id,created_at,artifact_catalog(name,emoji,description)&order=created_at.desc&limit=30`),
    ])
    if (![postsResult, groupResult, kudosResult, goalsResult, artifactsResult].every((result) => result.ok)) throw new Error('Notification lookup failed')
    const goals = await goalsResult.json()
    const updatesResult = goals.length
      ? await supabaseRequest(`goal_updates?goal_id=in.(${goals.map((item) => item.id).join(',')})&author_role=eq.coach&created_at=gte.${encodeURIComponent(since)}&select=id,goal_id,content,created_at&order=created_at.desc&limit=30`)
      : { ok: true, json: async () => [] }
    if (!updatesResult.ok) throw new Error('Goal notification lookup failed')

    const notifications = []
    for (const item of await postsResult.json()) notifications.push({ id: `coach-${item.id}`, type: 'coach', icon: '📣', title: 'Nytt från tränarna', text: item.content, createdAt: item.created_at })
    for (const item of await groupResult.json()) {
      const sender = profiles[item.sender_profile_id]
      if (sender && GROUP_TEMPLATES[item.template_key]) notifications.push({ id: `group-${item.id}`, type: 'group', icon: sender.emoji, title: `${sender.displayName} skrev i öppna kanalen`, text: GROUP_TEMPLATES[item.template_key], createdAt: item.created_at })
    }
    for (const item of await kudosResult.json()) {
      const sender = profiles[item.sender_profile_id]
      if (sender && KUDOS_TEMPLATES[item.template_key]) notifications.push({ id: `kudos-${item.id}`, type: 'private', icon: sender.emoji, title: `${sender.displayName} skickade privat pepp`, text: KUDOS_TEMPLATES[item.template_key], createdAt: item.created_at })
    }
    const goalTitles = Object.fromEntries(goals.map((item) => [item.id, item.title]))
    for (const item of goals) notifications.push({ id: `goal-${item.id}-${item.updated_at}`, type: 'goal', icon: '🎯', title: 'Ett mål har uppdaterats', text: item.title, createdAt: item.updated_at })
    for (const item of await updatesResult.json()) notifications.push({ id: `goal-update-${item.id}`, type: 'goal', icon: '🎯', title: 'Tränaren har skickat feedback', text: `${goalTitles[item.goal_id] || 'Ditt mål'} · ${item.content}`, createdAt: item.created_at })
    for (const item of await artifactsResult.json()) if (item.artifact_catalog) notifications.push({ id: `artifact-${item.id}`, type: 'artifact', icon: item.artifact_catalog.emoji, title: 'Du har fått en ny artefakt!', text: `${item.artifact_catalog.name} · ${item.artifact_catalog.description}`, createdAt: item.created_at })
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return sendJson(response, 200, { notifications: notifications.slice(0, 20) })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta dina nya händelser.' })
  }
}
