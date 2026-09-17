import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints, getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

const stockholmDay = (value = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value))

export const KUDOS_TEMPLATES = {
  great_job: 'Grymt jobbat idag! 💪',
  great_energy: 'Bra energi! ⚡',
  nice_technique: 'Snygg teknik! 🌊',
  thanks: 'Tack för peppen! 🙌',
  fun_together: 'Kul att träna med dig! 😊',
  strong_effort: 'Stark insats! 🔥',
}

const GROUP_TEMPLATES = {
  group_start: 'Nu kör vi! 🔥',
  group_energy: 'Bra energi i gruppen idag ⚡',
  group_great_job: 'Det blir ett grymt pass idag 💪',
  group_build: 'Idag bygger vi vidare 🌊',
  group_focus: 'Håll ihop hela vägen 🎯',
  group_next: 'Ser fram emot nästa pass 🙌',
  group_fun: 'Kul att simma med er! 😊',
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

async function messagesSentToday(table, profileId) {
  const column = table === 'kudos' ? 'sender_profile_id' : 'sender_profile_id'
  const result = await supabaseRequest(`${table}?${column}=eq.${profileId}&select=created_at&order=created_at.desc&limit=100`)
  if (!result.ok) throw new Error(`Daily ${table} count failed: ${result.status}`)
  return (await result.json()).filter((item) => stockholmDay(item.created_at) === stockholmDay()).length
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Klubbflödet visas bara för profiler.' })
      if (profile) await touchProfileActivity(profile.id)
      if (role === 'coach' && request.query?.appFeedback === 'true') {
        const result = await supabaseRequest('app_feedback?select=rating,best_area,improve_area,feature_request,comment,created_at&order=created_at.desc&limit=1000')
        if (!result.ok) throw new Error(`App feedback GET failed: ${result.status} ${await result.text()}`)
        const rows = await result.json()
        const counts = { ratings: {}, bestAreas: {}, improveAreas: {}, featureRequests: {} }
        rows.forEach((item) => { if (item.rating) counts.ratings[item.rating] = (counts.ratings[item.rating] || 0) + 1; if (item.best_area) counts.bestAreas[item.best_area] = (counts.bestAreas[item.best_area] || 0) + 1; if (item.improve_area) counts.improveAreas[item.improve_area] = (counts.improveAreas[item.improve_area] || 0) + 1; if (item.feature_request) counts.featureRequests[item.feature_request] = (counts.featureRequests[item.feature_request] || 0) + 1 })
        return sendJson(response, 200, { total: rows.length, averageRating: rows.length ? (rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length).toFixed(1) : null, counts, comments: rows.filter((item) => item.comment?.trim()).map((item) => ({ comment: item.comment.trim(), createdAt: item.created_at })).slice(0, 100) })
      }
      const [postsResult, groupResult, profiles, messagesResult] = await Promise.all([
        supabaseRequest('community_posts?deleted_at=is.null&select=id,content,created_at&order=created_at.desc&limit=100'),
        supabaseRequest('group_pep?select=id,sender_profile_id,template_key,created_at&order=created_at.desc&limit=100'),
        loadProfiles(),
        role === 'coach'
          ? supabaseRequest('private_messages?or=(recipient_role.eq.coach,sender_role.eq.coach)&select=*&order=created_at.desc&limit=200')
          : supabaseRequest(`private_messages?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=*&order=created_at.desc&limit=200`),
      ])
      if (!postsResult.ok || !groupResult.ok || !messagesResult.ok) throw new Error('Community feed failed')
      const posts = (await postsResult.json()).map((item) => ({ id: item.id, type: 'coach', content: item.content, createdAt: item.created_at }))
      const groupPep = (await groupResult.json()).map((item) => ({ id: item.id, type: 'group', content: GROUP_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id] })).filter((item) => item.sender)
      let privateKudos = []
      if (profile) {
        const privateResult = await supabaseRequest(`kudos?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=id,sender_profile_id,recipient_profile_id,template_key,created_at&order=created_at.desc&limit=100`)
        if (!privateResult.ok) throw new Error(`Private kudos failed: ${privateResult.status}`)
        privateKudos = (await privateResult.json()).map((item) => ({ id: item.id, type: 'kudos', content: KUDOS_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id] })).filter((item) => item.sender && item.recipient)
      }
      const messages = (await messagesResult.json()).map((item) => ({ id: item.id, content: item.content, createdAt: item.created_at, fromCoach: item.sender_role === 'coach', toCoach: item.recipient_role === 'coach', sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id], readAt: item.read_at }))
      return sendJson(response, 200, { items: [...posts, ...groupPep].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), privateKudos, messages })
    }

    if (request.method === 'POST' && role === 'coach') {
      if (request.body?.action === 'message') {
        const recipientId = String(request.body?.recipientId || ''), content = String(request.body?.content || '').trim()
        if (!recipientId || !content || content.length > 1000) return sendJson(response, 400, { error: 'Välj simmare och skriv ett meddelande på högst 1000 tecken.' })
        const recipient = await supabaseRequest(`profiles?id=eq.${recipientId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
        if (!recipient.ok || !(await recipient.json()).length) return sendJson(response, 404, { error: 'Simmaren kunde inte hittas.' })
        const result = await supabaseRequest('private_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_role: 'coach', recipient_profile_id: recipientId, recipient_role: 'swimmer', content }) })
        if (!result.ok) throw new Error(`Coach message failed: ${result.status}`)
        return sendJson(response, 201, { ok: true })
      }
      const content = String(request.body?.content || '').trim()
      if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Meddelandet måste vara 1–1000 tecken.' })
      const result = await supabaseRequest('community_posts', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ content, author_role: 'coach' }),
      })
      if (!result.ok) throw new Error(`Post insert failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 201, { ok: true })
    }

    if (request.method === 'POST' && role !== 'coach') {
      if (request.body?.action === 'app-feedback') {
        const profile = await getSessionProfile(request)
        if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil för att lämna appfeedback.' })
        const rating = Number(request.body.rating)
        const allowed = (value, list) => value == null || value === '' || list.includes(String(value))
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !allowed(request.body.bestArea, ['checkin', 'goals', 'games', 'planning', 'messages', 'other']) || !allowed(request.body.improveArea, ['speed', 'design', 'content', 'features', 'other']) || !allowed(request.body.featureRequest, ['statistics', 'games', 'messages', 'planning', 'other'])) return sendJson(response, 400, { error: 'Välj giltiga svar.' })
        const result = await supabaseRequest('app_feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ profile_id: profile.id, rating, best_area: request.body.bestArea || null, improve_area: request.body.improveArea || null, feature_request: request.body.featureRequest || null, comment: String(request.body.comment || '').trim().slice(0, 500) || null }) })
        if (!result.ok) throw new Error(`App feedback POST failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 201, { ok: true })
      }
    }

    if (request.method === 'POST') {
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil för att skicka pepp.' })
      if (request.body?.mode === 'coach') {
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Skriv ett meddelande på högst 1000 tecken.' })
        const result = await supabaseRequest('private_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_profile_id: profile.id, sender_role: 'swimmer', recipient_role: 'coach', content }) })
        if (!result.ok) throw new Error(`Swimmer message failed: ${result.status}`)
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true })
      }
      const mode = request.body?.mode === 'group' ? 'group' : 'private'
      const privateSent = await messagesSentToday('kudos', profile.id)
      const groupSent = await messagesSentToday('group_pep', profile.id)
      if (privateSent + groupSent >= 4) return sendJson(response, 429, { error: 'Du har skickat fyra peppmeddelanden idag. Du kan skicka mer imorgon!' })
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
