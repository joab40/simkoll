import { aiAvailability, getRole, isAiEnabled, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAiUsage } from '../server/audit.js'
import { awardPoints, getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

const stockholmDay = (value = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value))

async function polishCommunityPost(request, content) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { text: content, usedAi: false }
  const prompt = `Du hjälper en simtränare att skriva ett kort meddelande till ungdoms- och juniorsimmare i ett klubbflöde. Förbättra tydlighet, flyt och ton, men behåll tränarens budskap, fakta och personliga röst.
- Lägg till en varm tränare-till-simmare-känsla bara när det passar.
- Undvik klyschor, överdrivet pepp, utropstecken och barnsligt språk.
- Hitta inte på tider, tävlingar, resultat, krav eller annan information.
- Ändra inte innehållet mer än nödvändigt. Returnera endast JSON med nyckeln text.

Tränarens utkast:
${String(content).slice(0, 1000)}`
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.25, max_tokens: 350, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'community_post', model, role: 'coach', response: null, status: 'failure', error: `HTTP ${result.status}` }); return { text: content, usedAi: false } }
    const payload = await result.json(), raw = String(payload.choices?.[0]?.message?.content || '{}')
    await writeAiUsage(request, { feature: 'community_post', model, role: 'coach', response: payload })
    const first = raw.indexOf('{'), last = raw.lastIndexOf('}'), parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
    const text = String(parsed.text || '').trim().slice(0, 1000)
    return { text: text || content, usedAi: Boolean(text) }
  } catch (error) {
    console.warn('Community post AI fallback:', error.message)
    return { text: content, usedAi: false }
  }
}

async function moderateCustomPep(request, content) {
  const availability = await aiAvailability()
  if (!availability.allowed) return { allowed: false, error: 'Peppkontrollen är inte tillgänglig just nu. Försök igen senare.' }
  const key = process.env.OPENAI_API_KEY
  if (!key) return { allowed: false, error: 'Peppmeddelandet kunde inte kontrolleras just nu. Försök igen senare.' }
  const model = 'omni-moderation-latest'
  try {
    const result = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: content }),
    })
    if (!result.ok) {
      await writeAiUsage(request, { feature: 'pep_moderation', model, role: 'swimmer', response: null, status: 'failure', error: `HTTP ${result.status}` })
      return { allowed: false, error: 'Peppmeddelandet kunde inte kontrolleras just nu. Försök igen senare.' }
    }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'pep_moderation', model, role: 'swimmer', response: payload })
    const flagged = payload.results?.[0]?.flagged === true
    return flagged
      ? { allowed: false, error: 'Meddelandet kan inte skickas eftersom språket inte känns schysst nog. Skriv gärna om det med respektfull ton.' }
      : { allowed: true }
  } catch (error) {
    console.warn('Pep moderation failed:', error.message)
    return { allowed: false, error: 'Peppmeddelandet kunde inte kontrolleras just nu. Försök igen senare.' }
  }
}

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
        supabaseRequest('community_posts?deleted_at=is.null&select=id,content,created_at,deleted_at&order=created_at.desc&limit=100'),
        supabaseRequest('group_pep?select=id,sender_profile_id,template_key,content,created_at&order=created_at.desc&limit=100'),
        loadProfiles(),
        role === 'coach'
          ? supabaseRequest('private_messages?or=(recipient_role.eq.coach,sender_role.eq.coach)&select=*&order=created_at.desc&limit=200')
          : supabaseRequest(`private_messages?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=*&order=created_at.desc&limit=200`),
      ])
      if (!postsResult.ok || !groupResult.ok || !messagesResult.ok) throw new Error('Community feed failed')
      const posts = (await postsResult.json()).filter((item) => !item.deleted_at).map((item) => ({ id: item.id, type: 'coach', content: item.content, createdAt: item.created_at }))
        const groupPep = (await groupResult.json()).map((item) => ({ id: item.id, type: 'group', content: item.content || GROUP_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id] })).filter((item) => item.sender && item.content)
      let privateKudos = []
      if (profile) {
        const privateResult = await supabaseRequest(`kudos?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=id,sender_profile_id,recipient_profile_id,template_key,content,created_at&order=created_at.desc&limit=100`)
        if (!privateResult.ok) throw new Error(`Private kudos failed: ${privateResult.status}`)
        privateKudos = (await privateResult.json()).map((item) => ({ id: item.id, type: 'kudos', content: item.content || KUDOS_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id] })).filter((item) => item.sender && item.recipient && item.content)
      }
      const messages = (await messagesResult.json()).map((item) => ({ id: item.id, content: item.content, createdAt: item.created_at, fromCoach: item.sender_role === 'coach', toCoach: item.recipient_role === 'coach', sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id], readAt: item.read_at }))
      return sendJson(response, 200, { items: [...posts, ...groupPep].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), privateKudos, messages })
    }

    if (request.method === 'POST' && role === 'coach' && request.body?.action !== 'app-feedback' && request.body?.action !== 'reset-app-feedback') {
      if (request.body?.action === 'polish-community-post') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Skriv ett meddelande på högst 1000 tecken.' })
        return sendJson(response, 200, await polishCommunityPost(request, content))
      }
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

    if (request.method === 'POST' && role === 'coach' && request.body?.action === 'reset-app-feedback') {
      const result = await supabaseRequest('app_feedback?id=not.is.null', { method: 'DELETE' })
      if (!result.ok) throw new Error(`App feedback reset failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { ok: true })
    }

    if (request.method === 'POST' && (role === 'coach' || role === 'swimmer')) {
      if (request.body?.action === 'app-feedback') {
        const profile = role === 'coach' ? null : await getSessionProfile(request)
        if (role === 'swimmer' && !profile) return sendJson(response, 403, { error: 'Logga in på din profil för att lämna appfeedback.' })
        const rating = Number(request.body.rating)
        const allowed = (value, list) => value == null || value === '' || list.includes(String(value))
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !allowed(request.body.bestArea, ['checkin', 'goals', 'games', 'planning', 'messages', 'other']) || !allowed(request.body.improveArea, ['speed', 'design', 'content', 'features', 'other']) || !allowed(request.body.featureRequest, ['statistics', 'games', 'messages', 'planning', 'other'])) return sendJson(response, 400, { error: 'Välj giltiga svar.' })
        const result = await supabaseRequest('app_feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ profile_id: profile?.id || null, submitted_by_role: role, rating, best_area: request.body.bestArea || null, improve_area: request.body.improveArea || null, feature_request: request.body.featureRequest || null, comment: String(request.body.comment || '').trim().slice(0, 500) || null }) })
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
      const settingsResult = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
      let webappSettings = {}
      if (settingsResult.ok) {
        const rows = await settingsResult.json()
        webappSettings = rows[0]?.setting_value || {}
      }
      const customPepEnabled = webappSettings.swimmer?.customPep !== false
      if (mode === 'group') {
        const templateKey = String(request.body?.templateKey || '')
        const customContent = String(request.body?.content || '').trim()
        if (templateKey === 'custom') {
          if (!customPepEnabled) return sendJson(response, 403, { error: 'Egna peppmeddelanden är avstängda av tränarna.' })
          if (!customContent || customContent.length > 300) return sendJson(response, 400, { error: 'Skriv ett eget peppmeddelande på 1–300 tecken.' })
          const moderation = await moderateCustomPep(request, customContent)
          if (!moderation.allowed) return sendJson(response, 422, { error: moderation.error })
        } else if (!GROUP_TEMPLATES[templateKey]) return sendJson(response, 400, { error: 'Välj en grupphälsning.' })
        const result = await supabaseRequest('group_pep', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_profile_id: profile.id, template_key: templateKey, content: templateKey === 'custom' ? customContent : null }) })
        if (!result.ok) throw new Error(`Group pep insert failed: ${result.status} ${await result.text()}`)
        const [pep] = await result.json()
        await awardPoints(profile.id, 'kudos_sent', 1, `${stockholmDate()}:${pep.id}`)
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true })
      }
      const recipientId = String(request.body?.recipientId || '')
      const templateKey = String(request.body?.templateKey || '')
      const customContent = String(request.body?.content || '').trim()
      if (recipientId === profile.id) return sendJson(response, 400, { error: 'Välj en annan simmare.' })
      if (templateKey === 'custom') {
        if (!customPepEnabled) return sendJson(response, 403, { error: 'Egna peppmeddelanden är avstängda av tränarna.' })
        if (!customContent || customContent.length > 300) return sendJson(response, 400, { error: 'Skriv ett eget peppmeddelande på 1–300 tecken.' })
        const moderation = await moderateCustomPep(request, customContent)
        if (!moderation.allowed) return sendJson(response, 422, { error: moderation.error })
      } else if (!KUDOS_TEMPLATES[templateKey]) return sendJson(response, 400, { error: 'Välj en simmare och en pepphälsning.' })
      const recipientResult = await supabaseRequest(`profiles?id=eq.${recipientId}&active=eq.true&select=id&limit=1`)
      if (!recipientResult.ok || !(await recipientResult.json()).length) return sendJson(response, 404, { error: 'Simmaren kunde inte hittas.' })
      const result = await supabaseRequest('kudos', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ sender_profile_id: profile.id, recipient_profile_id: recipientId, template_key: templateKey, content: templateKey === 'custom' ? customContent : null }),
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
      if (!id) return sendJson(response, 400, { error: 'Meddelandet saknar id.' })
      const result = await supabaseRequest(`community_posts?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ deleted_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Post delete failed: ${result.status}`)
      const deleted = await result.json().catch(() => [])
      if (!deleted.length) return sendJson(response, 404, { error: 'Meddelandet finns inte längre.' })
      return sendJson(response, 200, { ok: true, deletedId: id })
    }

    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte ladda klubbflödet.' })
  }
}
