import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints, getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

export const KUDOS_TEMPLATES = {
  great_job: 'Grymt jobbat idag! 💪',
  great_energy: 'Bra energi! ⚡',
  nice_technique: 'Snygg teknik! 🌊',
  thanks: 'Tack för peppen! 🙌',
  fun_together: 'Kul att träna med dig! 😊',
  strong_effort: 'Stark insats! 🔥',
}

const GROUP_TEMPLATES = {
  group_energy: 'Bra energi på träningen idag! ⚡',
  group_fun: 'Kul att simma med er! 🌊',
  group_great_job: 'Grymt jobbat allihop! 💪',
  group_thanks: 'Tack för ett bra pass! 🙌',
  group_spirit: 'Härlig stämning idag! 😊',
}

async function loadProfiles() {
  const result = await supabaseRequest('profiles?select=id,display_name,emoji&active=eq.true')
  if (!result.ok) throw new Error(`Community profiles failed: ${result.status}`)
  return Object.fromEntries((await result.json()).map((profile) => [profile.id, { id: profile.id, displayName: profile.display_name, emoji: profile.emoji }]))
}

async function pointsToday(profileId, eventType) {
  const result = await supabaseRequest(`point_events?profile_id=eq.${profileId}&event_type=eq.${eventType}&source_key=like.${stockholmDate()}:*&select=id`)
  if (!result.ok) throw new Error(`Point count failed: ${result.status}`)
  return (await result.json()).length
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Klubbflödet visas bara för profiler.' })
      if (profile) await touchProfileActivity(profile.id)
      const [postsResult, groupResult, profiles] = await Promise.all([
        supabaseRequest('community_posts?deleted_at=is.null&select=id,content,created_at&order=created_at.desc&limit=100'),
        supabaseRequest('group_pep?select=id,sender_profile_id,template_key,created_at&order=created_at.desc&limit=100'),
        loadProfiles(),
      ])
      if (!postsResult.ok || !groupResult.ok) throw new Error('Community feed failed')
      const posts = (await postsResult.json()).map((item) => ({ id: item.id, type: 'coach', content: item.content, createdAt: item.created_at }))
      const groupPep = (await groupResult.json()).map((item) => ({ id: item.id, type: 'group', content: GROUP_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id] })).filter((item) => item.sender)
      let privateKudos = []
      if (profile) {
        const privateResult = await supabaseRequest(`kudos?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=id,sender_profile_id,recipient_profile_id,template_key,created_at&order=created_at.desc&limit=100`)
        if (!privateResult.ok) throw new Error(`Private kudos failed: ${privateResult.status}`)
        privateKudos = (await privateResult.json()).map((item) => ({ id: item.id, type: 'kudos', content: KUDOS_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id] })).filter((item) => item.sender && item.recipient)
      }
      return sendJson(response, 200, { items: [...posts, ...groupPep].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), privateKudos })
    }

    if (request.method === 'POST' && role === 'coach') {
      const content = String(request.body?.content || '').trim()
      if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Meddelandet måste vara 1–1000 tecken.' })
      const result = await supabaseRequest('community_posts', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ content, author_role: 'coach' }),
      })
      if (!result.ok) throw new Error(`Post insert failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 201, { ok: true })
    }

    if (request.method === 'POST') {
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil för att skicka pepp.' })
      const mode = request.body?.mode === 'group' ? 'group' : 'private'
      if ((await pointsToday(profile.id, 'kudos_sent')) >= 2) return sendJson(response, 429, { error: 'Du har fått dagens två pepp-poäng. Du kan skicka mer pepp imorgon!' })
      if (mode === 'group') {
        const templateKey = String(request.body?.templateKey || '')
        if (!GROUP_TEMPLATES[templateKey]) return sendJson(response, 400, { error: 'Välj en grupphälsning.' })
        const result = await supabaseRequest('group_pep', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_profile_id: profile.id, template_key: templateKey }) })
        if (!result.ok) throw new Error(`Group pep insert failed: ${result.status} ${await result.text()}`)
        const [pep] = await result.json()
        await awardPoints(profile.id, 'kudos_sent', 1, `${stockholmDate()}:${pep.id}`)
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true })
      }
      const recipientId = String(request.body?.recipientId || '')
      const templateKey = String(request.body?.templateKey || '')
      if (recipientId === profile.id || !KUDOS_TEMPLATES[templateKey]) return sendJson(response, 400, { error: 'Välj en simmare och en pepphälsning.' })
      const recipientResult = await supabaseRequest(`profiles?id=eq.${recipientId}&active=eq.true&select=id&limit=1`)
      if (!recipientResult.ok || !(await recipientResult.json()).length) return sendJson(response, 404, { error: 'Simmaren kunde inte hittas.' })
      const result = await supabaseRequest('kudos', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ sender_profile_id: profile.id, recipient_profile_id: recipientId, template_key: templateKey }),
      })
      if (!result.ok) throw new Error(`Kudos insert failed: ${result.status} ${await result.text()}`)
      const [kudos] = await result.json()
      const sourceKey = `${stockholmDate()}:${kudos.id}`
      await awardPoints(profile.id, 'kudos_sent', 1, sourceKey)
      if ((await pointsToday(recipientId, 'kudos_received')) < 2) await awardPoints(recipientId, 'kudos_received', 1, sourceKey)
      await touchProfileActivity(profile.id)
      return sendJson(response, 201, { ok: true })
    }

    if (request.method === 'DELETE' && role === 'coach') {
      const id = String(request.query?.id || '')
      const result = await supabaseRequest(`community_posts?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Post delete failed: ${result.status}`)
      return sendJson(response, 200, { ok: true })
    }

    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte ladda klubbflödet.' })
  }
}
