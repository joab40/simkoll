import { waitUntil } from '@vercel/functions'
import { aiAvailability, getRole, isAiEnabled, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAiUsage } from '../server/audit.js'
import { awardPoints, getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'
import { coachFromRequest } from '../server/coach-auth.js'
import { queueMessagePush } from '../server/web-push.js'
import { loadPrivateChatReplies, saveLinkedPrivateReply } from '../server/private-chat-replies.js'
import { proposePrivateReply } from '../server/private-reply-ai.js'

const stockholmDay = (value = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value))
const isSuperadminRequest = (request) => coachFromRequest(request)?.role === 'superadmin'

// Modereringsmodellen är ett viktigt extra skydd, men ska inte vara enda
// spärren för tydliga svordomar och personangrepp på svenska. Kontrollera
// därför även vanliga uttryck lokalt innan texten skickas vidare.
const BLOCKED_PEP_PATTERNS = [
  /\b(?:fan|fanskap|fan helvete|satan|satanist)\b/i,
  /\b(?:jävla|jävlar|jävel|jävligt|jävlig|jävlighet)\b/i,
  /\b(?:helvete|helvetes|förbannad|förbannat|förbannade|förbannelse)\b/i,
  /\b(?:skit|skiten|skitigt|skitsnack|skitstövel|skitunge|skitliv|skitkort)\b/i,
  /\b(?:piss|pissa|pissat|pisshuvud|pissråtta|pissunge)\b/i,
  /\b(?:kuk|kuken|kuks|kukhuvud|kukjävel|kukskalle)\b/i,
  /\b(?:fitta|fittan|fitthuvud|fittjävel)\b/i,
  /\b(?:knull|knulla|knullar|knullade|knullad|knullat|knullare|knulljävel)\b/i,
  /\b(?:hora|horan|horunge|horhus|horjävel|luder|slampa|slyna)\b/i,
  /\b(?:röv|röven|rövhål|rövhålet|rövslickare|arsle|arslet|arsel)\b/i,
  /\b(?:runk|runka|runkare|runkhuvud|onani|onanera)\b/i,
  /\b(?:fitta|pung|pungen|sperma|spermat|snoppjävel)\b/i,
  /\b(?:idiot|idioter|idiotjävel|idiotskalle|dumjävel|dumskalle|dumbom)\b/i,
  /\b(?:mongo|mongoloid|efterbliven|cp[-\s]?unge|cp[-\s]?skalle)\b/i,
  /\b(?:bögjävel|bögskalle|flatajävel|homofobjävel)\b/i,
  /\b(?:gubb\s*jävel|kärring\s*jävel|f##k|fck|fcking|fuck|fucking|shit|bitch)\b/i,
]

const hasBlockedPepLanguage = (content) => {
  const normalized = String(content || '').toLocaleLowerCase('sv-SE').normalize('NFKC').replace(/[.,!?;:()[\]{}"'`´¨~_*+=/\\|-]+/g, ' ')
  return BLOCKED_PEP_PATTERNS.some((pattern) => pattern.test(normalized))
}

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
  if (hasBlockedPepLanguage(content)) return { allowed: false, error: 'Meddelandet kan inte skickas eftersom det innehåller svordomar eller ett personangrepp. Skriv gärna om det med respektfull ton.' }
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

async function finishGroupPepModeration(request, pep) {
  const updateModeration = async (status, { content = pep.content, note = null, pointEligible = status === 'approved' ? pep.point_eligible === true : false } = {}) => {
    const result = await supabaseRequest(`group_pep?id=eq.${encodeURIComponent(pep.id)}&moderation_status=eq.pending`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ moderation_status: status, moderation_note: note, content, point_eligible: pointEligible }),
    })
    if (!result.ok) throw new Error(`Group pep moderation update failed: ${result.status}`)
    return (await result.json()).length > 0
  }

  try {
    const moderation = await moderateCustomPep(request, pep.content)
    if (!moderation.allowed) {
      await updateModeration('rejected', { content: null, note: 'Meddelandet kunde inte publiceras. Skriv om texten och försök igen.' })
      return
    }
    const approved = await updateModeration('approved', { pointEligible: pep.point_eligible === true })
    if (!approved) return
    if (pep.point_eligible) {
      try { await awardPoints(pep.sender_profile_id, 'kudos_sent', 1, `${stockholmDate()}:${pep.id}`) }
      catch (error) { console.warn('Group pep point award failed:', error.message) }
    }
    try { await touchProfileActivity(pep.sender_profile_id) }
    catch (error) { console.warn('Group pep activity update failed:', error.message) }
    if (pep.point_eligible) {
      const resolved = await supabaseRequest(`group_pep?id=eq.${encodeURIComponent(pep.id)}&moderation_status=eq.approved`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ point_eligible: false }),
      })
      if (!resolved.ok) console.warn(`Group pep point status update failed: ${resolved.status}`)
    }
  } catch (error) {
    console.warn('Group pep moderation failed:', error.message)
    try { await updateModeration('rejected', { content: null, note: 'Meddelandet kunde inte kontrolleras. Försök att skicka det igen.' }) }
    catch (updateError) { console.error('Could not close pending group pep:', updateError.message) }
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
const REACTION_EMOJIS = ['👍']

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
  const moderationFilter = table === 'group_pep' ? '&moderation_status=neq.rejected' : ''
  const result = await supabaseRequest(`${table}?${column}=eq.${profileId}${moderationFilter}&select=created_at&order=created_at.desc&limit=100`)
  if (!result.ok) throw new Error(`Daily ${table} count failed: ${result.status}`)
  return (await result.json()).filter((item) => stockholmDay(item.created_at) === stockholmDay()).length
}

const coachFeedEventLabels = { personal_best: ['personal_best', '🏆 Nytt personbästa'], goal_complete: ['achievement', '🎯 Mål uppnått'], weekly_goal: ['achievement', '✅ Veckomål uppnått'], strength_weekly_goal: ['strength', '🏋️ Styrkemål uppnått'], dryland_weekly_goal: ['strength', '🤸 Landträningsmål uppnått'], strength_progress: ['strength', '🏋️ Styrkeförbättring'] }
async function getCoachFeedVisibility() {
  const result = await supabaseRequest('app_settings?setting_key=eq.coach_feed&select=setting_value&limit=1')
  if (!result.ok) return { hiddenIds: [], clearedAt: null }
  return (await result.json())[0]?.setting_value || { hiddenIds: [], clearedAt: null }
}

async function saveCoachFeedVisibility(value) {
  const result = await supabaseRequest('app_settings?on_conflict=setting_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ setting_key: 'coach_feed', setting_value: value, updated_at: new Date().toISOString() }),
  })
  if (!result.ok) throw new Error(`Coach feed settings failed: ${result.status} ${await result.text()}`)
}

async function getCoachFeed() {
  const [pointsResult, profilesResult, resultsResult, visibility] = await Promise.all([supabaseRequest('point_events?event_type=in.(personal_best,goal_complete,weekly_goal,strength_weekly_goal,dryland_weekly_goal,strength_progress)&select=profile_id,event_type,points,created_at,source_key&order=created_at.desc&limit=100'), supabaseRequest('profiles?select=id,display_name,emoji'), supabaseRequest('competition_results?select=profile_id,event,competition_name,result_date,swim_time&order=result_date.desc&limit=2000'), getCoachFeedVisibility()])
  const profiles = profilesResult.ok ? Object.fromEntries((await profilesResult.json()).map((item) => [item.id, item])) : {}
  const competitionResults = resultsResult.ok ? await resultsResult.json() : []
  const automatic = pointsResult.ok ? (await pointsResult.json()).map((item) => { const [eventType, baseTitle] = coachFeedEventLabels[item.event_type] || ['achievement', '✨ Positiv utveckling']; const source = String(item.source_key || ''); const sourceParts = source.startsWith('pb_competition:') ? source.slice('pb_competition:'.length).split(':') : []; const competitionDate = sourceParts[0] || ''; const competitionName = sourceParts.slice(1).join(':'); const result = item.event_type === 'personal_best' ? competitionResults.find((row) => row.profile_id === item.profile_id && row.result_date === competitionDate && (!competitionName || row.competition_name === competitionName)) : null; const title = result?.event ? `${baseTitle} · ${result.event}` : baseTitle; return { id: `point-${item.created_at}-${item.profile_id}-${item.event_type}`, eventType, profileId: item.profile_id, title, detail: result?.competition_name ? `${result.competition_name} · ${result.swim_time || ''}`.trim() : item.source_key ? `Registrerad i Simkoll · ${item.source_key.split(':')[0]}` : '', points: item.points, sourceKey: item.source_key, stars: null, createdAt: item.created_at, sender: 'Simkoll', profile: profiles[item.profile_id] ? { displayName: profiles[item.profile_id].display_name, emoji: profiles[item.profile_id].emoji } : null } }) : []
  const enrichedAutomatic = automatic.map((item) => {
    if (item.eventType !== 'strength_progress') return item
    const parts = String(item.sourceKey || item.source_key || '').split(':')
    if (parts.length < 4) return item
    try {
      const detail = decodeURIComponent(parts.slice(3).join(':')).split('~').map((entry) => {
        const [exercise, before, after] = entry.split('|')
        return `${exercise}: ${before} → ${after}`
      }).join(' · ')
      return { ...item, title: `🏋️ Styrkeförbättring · Pass ${parts[2]}`, detail }
    } catch { return item }
  })
  const hiddenIds = new Set(Array.isArray(visibility.hiddenIds) ? visibility.hiddenIds : [])
  const clearedAt = visibility.clearedAt ? new Date(visibility.clearedAt).getTime() : 0
  const seen = new Set()
  return enrichedAutomatic.filter((item) => {
    if (hiddenIds.has(item.id) || (clearedAt && new Date(item.createdAt).getTime() <= clearedAt)) return false
    const key = `${item.eventType}|${item.profileId || 'group'}|${item.sourceKey || item.createdAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 150)
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)
  if (request.method === 'POST' && request.body?.action === 'propose-private-reply' && role !== 'coach') return sendJson(response,403,{error:'Endast tränaren kan skapa svarsförslag.'})

  try {
    if (request.method === 'GET') {
      if (role === 'coach' && request.query?.coachFeed === 'true') return sendJson(response, 200, { events: await getCoachFeed() })
      if (request.query?.pepStatus) {
        if (role !== 'swimmer') return sendJson(response, 403, { error: 'Logga in som simmare för att se meddelandestatus.' })
        const profile = await getSessionProfile(request)
        const id = String(request.query.pepStatus)
        if (!profile || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return sendJson(response, 400, { error: 'Ogiltigt meddelande.' })
        const result = await supabaseRequest(`group_pep?id=eq.${encodeURIComponent(id)}&sender_profile_id=eq.${encodeURIComponent(profile.id)}&select=moderation_status,moderation_note,point_eligible&limit=1`)
        if (!result.ok) throw new Error(`Group pep status lookup failed: ${result.status}`)
        const [pep] = await result.json()
        if (!pep) return sendJson(response, 404, { error: 'Meddelandet kunde inte hittas.' })
        return sendJson(response, 200, { status: pep.moderation_status || 'approved', message: pep.moderation_note || null, pointEligible: pep.point_eligible === true })
      }
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Klubbflödet visas bara för profiler.' })
      if (profile) await touchProfileActivity(profile.id)
      const settingsResult = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
      const webappSettings = settingsResult.ok ? ((await settingsResult.json())[0]?.setting_value || {}) : {}
      const openChatEnabled = webappSettings.openChat?.enabled === true
      const openChatCoachOnly = webappSettings.openChat?.coachOnly === true
      const openChatSwimmerPrivate = webappSettings.openChat?.swimmerPrivate !== false
      if (role === 'coach' && request.query?.appFeedback === 'true') {
        const superadmin = isSuperadminRequest(request)
        const columns = superadmin ? 'id,profile_id,submitted_by_role,rating,best_area,improve_area,feature_request,comment,created_at,workflow_status,admin_note,admin_reply,admin_reply_sent_at,archived_at,updated_at' : 'rating,best_area,improve_area,feature_request,comment,created_at'
        const result = await supabaseRequest(`app_feedback?select=${columns}&order=created_at.desc&limit=1000`)
        if (!result.ok) throw new Error(`App feedback GET failed: ${result.status} ${await result.text()}`)
        const rows = await result.json()
        const counts = { ratings: {}, bestAreas: {}, improveAreas: {}, featureRequests: {} }
        rows.forEach((item) => { if (item.rating) counts.ratings[item.rating] = (counts.ratings[item.rating] || 0) + 1; if (item.best_area) counts.bestAreas[item.best_area] = (counts.bestAreas[item.best_area] || 0) + 1; if (item.improve_area) counts.improveAreas[item.improve_area] = (counts.improveAreas[item.improve_area] || 0) + 1; if (item.feature_request) counts.featureRequests[item.feature_request] = (counts.featureRequests[item.feature_request] || 0) + 1 })
        const comments = rows.filter((item) => item.comment?.trim()).map((item) => ({ comment: item.comment.trim(), createdAt: item.created_at }))
        let feedback
        if (superadmin) {
          const profilesResult = await supabaseRequest('profiles?select=id,display_name,username,emoji&limit=10000')
          if (!profilesResult.ok) throw new Error(`App feedback profile lookup failed: ${profilesResult.status}`)
          const profilesById = Object.fromEntries((await profilesResult.json()).map((item) => [item.id, item]))
          feedback = rows.filter((item) => item.comment?.trim()).map((item) => {
            const profile = profilesById[item.profile_id]
            return { id: item.id, profileId: item.profile_id, profileName: profile?.display_name || profile?.username || null, profileEmoji: profile?.emoji || '', submittedByRole: item.submitted_by_role, rating: item.rating, bestArea: item.best_area, improveArea: item.improve_area, featureRequest: item.feature_request, comment: item.comment.trim(), createdAt: item.created_at, status: item.workflow_status || 'new', adminNote: item.admin_note || '', adminReply: item.admin_reply || '', adminReplySentAt: item.admin_reply_sent_at, archivedAt: item.archived_at, updatedAt: item.updated_at }
          })
        }
        return sendJson(response, 200, { total: rows.length, averageRating: rows.length ? (rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length).toFixed(1) : null, counts, comments: comments.slice(0, 100), ...(superadmin ? { feedback } : {}) })
      }
      const actorKey = role === 'coach' ? `coach:${coachFromRequest(request)?.sub || 'legacy'}` : `swimmer:${profile.id}`
      const [postsResult, groupResult, profiles, messagesResult, openChatResult, reactionsResult] = await Promise.all([
        supabaseRequest('community_posts?deleted_at=is.null&select=id,content,created_at,deleted_at&order=created_at.desc&limit=100'),
        supabaseRequest('group_pep?select=*&order=created_at.desc&limit=100'),
        loadProfiles(),
        role === 'coach'
          ? supabaseRequest('private_messages?or=(recipient_role.eq.coach,sender_role.eq.coach)&select=*&order=created_at.desc&limit=200')
          : supabaseRequest(`private_messages?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=*&order=created_at.desc&limit=200`),
        openChatEnabled ? supabaseRequest(`open_chat_messages?deleted_at=is.null${role === 'coach' ? '' : `&or=(visibility.neq.coaches,sender_profile_id.eq.${profile.id})`}&select=id,sender_role,sender_profile_id,content,visibility,created_at&order=created_at.desc&limit=300`) : Promise.resolve({ ok: true, json: async () => [] }),
        supabaseRequest('community_reactions?select=message_type,message_id,actor_key,emoji&limit=20000'),
      ])
      if (!postsResult.ok || !groupResult.ok || !messagesResult.ok || !openChatResult.ok || !reactionsResult.ok) throw new Error('Community feed failed')
      const reactionRows = await reactionsResult.json()
      const reactionsByMessage = new Map()
      reactionRows.forEach((reaction) => {
        const key = `${reaction.message_type}|${reaction.message_id}`
        if (!reactionsByMessage.has(key)) reactionsByMessage.set(key, [])
        reactionsByMessage.get(key).push(reaction)
      })
      const reactionsFor = (messageType, messageId) => REACTION_EMOJIS.map((emoji) => {
        const matches = (reactionsByMessage.get(`${messageType}|${messageId}`) || []).filter((reaction) => reaction.emoji === emoji)
        return { emoji, count: matches.length, reacted: matches.some((reaction) => reaction.actor_key === actorKey) }
      }).filter((reaction) => reaction.count > 0)
      const posts = (await postsResult.json()).filter((item) => !item.deleted_at).map((item) => ({ id: item.id, type: 'coach', content: item.content, createdAt: item.created_at, reactions: reactionsFor('coach_post', item.id) }))
      const groupRows = await groupResult.json()
      const groupPep = groupRows
        .filter((item) => (item.moderation_status || 'approved') === 'approved' || (role === 'swimmer' && item.sender_profile_id === profile?.id))
        .map((item) => {
          const moderationStatus = item.moderation_status || 'approved'
          return {
            id: item.id,
            type: 'group',
            content: moderationStatus === 'rejected' ? '' : item.content || GROUP_TEMPLATES[item.template_key],
            moderationStatus,
            moderationMessage: moderationStatus === 'rejected' ? item.moderation_note || 'Meddelandet kunde inte publiceras. Skriv om texten och försök igen.' : null,
            createdAt: item.created_at,
            sender: profiles[item.sender_profile_id],
            reactions: moderationStatus === 'approved' ? reactionsFor('group_pep', item.id) : [],
          }
        })
        .filter((item) => item.sender && (item.content || item.moderationStatus === 'rejected'))
      const quoteTargets = new Map([...posts, ...groupPep].map((item) => [`${item.type}-${item.id}`, item]))
      for (const type of ['group', 'coach']) {
        const ids = [...new Set(groupRows.filter((row) => (row.moderation_status || 'approved') === 'approved' && row.reply_type === type && row.reply_id && !quoteTargets.has(`${type}-${row.reply_id}`)).map((row) => row.reply_id))]
        if (!ids.length) continue
        const targets = await supabaseRequest(`${type === 'group' ? 'group_pep' : 'community_posts'}?id=in.(${ids.join(',')})${type === 'coach' ? '&deleted_at=is.null' : '&moderation_status=eq.approved'}&select=*`)
        if (!targets.ok) throw new Error('Reply history lookup failed')
        for (const row of await targets.json()) {
          if (row.deleted_at) continue
          quoteTargets.set(`${type}-${row.id}`, { content: row.content || GROUP_TEMPLATES[row.template_key], sender: type === 'group' ? profiles[row.sender_profile_id] : null })
        }
      }
      for (const item of groupPep) {
        const row = groupRows.find((row) => row.id === item.id)
        if (row.reply_id && ['group', 'coach'].includes(row.reply_type)) {
          const target = quoteTargets.get(`${row.reply_type}-${row.reply_id}`)
          item.reply = { id: row.reply_id, type: row.reply_type, senderName: target ? (target.sender?.displayName || 'Tränarna') : null, content: target?.content?.slice(0, 160) || null }
        }
      }
      let privateKudos = []
      if (profile) {
        const privateResult = await supabaseRequest(`kudos?or=(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${profile.id})&select=id,sender_profile_id,recipient_profile_id,template_key,content,created_at&order=created_at.desc&limit=100`)
        if (!privateResult.ok) throw new Error(`Private kudos failed: ${privateResult.status}`)
        privateKudos = (await privateResult.json()).map((item) => ({ id: item.id, type: 'kudos', content: item.content || KUDOS_TEMPLATES[item.template_key], createdAt: item.created_at, sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id] })).filter((item) => item.sender && item.recipient && item.content)
      }
      const messages = (await messagesResult.json()).map((item) => ({ id: item.id, content: item.content, createdAt: item.created_at, fromCoach: item.sender_role === 'coach', toCoach: item.recipient_role === 'coach', sender: profiles[item.sender_profile_id], recipient: profiles[item.recipient_profile_id], readAt: item.read_at }))
const openChatMessages = openChatEnabled ? (await openChatResult.json()).filter((item) => role === 'coach' || item.visibility !== 'coaches' || item.sender_profile_id === profile?.id).map((item) => ({ id: item.id, content: item.content, createdAt: item.created_at, senderRole: item.sender_role, senderProfileId: item.sender_profile_id || null, sender: item.sender_profile_id ? profiles[item.sender_profile_id] : { displayName: 'Tränare', emoji: '🧑‍🏫' } })).filter((item) => item.sender).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : []
      const threaded = await loadPrivateChatReplies(openChatMessages,role,profile?.id)
      return sendJson(response, 200, { items: [...posts, ...groupPep].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), privateKudos, messages, openChat: { enabled: openChatEnabled, coachOnly: openChatCoachOnly, swimmerPrivate: openChatSwimmerPrivate, backgroundImage: webappSettings.openChat?.backgroundImage || '/assets/open-chat-bg.png', messages: threaded.messages, privateRepliesWarning: threaded.warning } })
    }

    if (request.method === 'POST' && ['coach', 'swimmer'].includes(role) && request.body?.action === 'toggle-reaction') {
      const profile = role === 'swimmer' ? await getSessionProfile(request) : null
      if (role === 'swimmer' && !profile) return sendJson(response, 403, { error: 'Logga in på din profil för att reagera.' })
      const messageType = String(request.body?.messageType || '')
      const messageId = String(request.body?.messageId || '')
      const emoji = String(request.body?.emoji || '')
      if (!['coach_post', 'group_pep'].includes(messageType) || !/^[0-9a-f-]{36}$/i.test(messageId) || !REACTION_EMOJIS.includes(emoji)) return sendJson(response, 400, { error: 'Välj ett giltigt meddelande och en emoji.' })
      const table = messageType === 'group_pep' ? 'group_pep' : 'community_posts'
      const target = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(messageId)}${messageType === 'coach_post' ? '&deleted_at=is.null' : '&moderation_status=eq.approved'}&select=id&limit=1`)
      if (!target.ok || !(await target.json()).length) return sendJson(response, 404, { error: 'Meddelandet finns inte längre.' })
      const actorKey = role === 'swimmer' ? `swimmer:${profile.id}` : `coach:${coachFromRequest(request)?.sub || 'legacy'}`
      const existing = await supabaseRequest(`community_reactions?message_type=eq.${messageType}&message_id=eq.${messageId}&actor_key=eq.${encodeURIComponent(actorKey)}&emoji=eq.${encodeURIComponent(emoji)}&select=id&limit=1`)
      if (!existing.ok) throw new Error(`Reaction lookup failed: ${existing.status}`)
      if ((await existing.json()).length) {
        const removed = await supabaseRequest(`community_reactions?message_type=eq.${messageType}&message_id=eq.${messageId}&actor_key=eq.${encodeURIComponent(actorKey)}&emoji=eq.${encodeURIComponent(emoji)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        if (!removed.ok) throw new Error(`Reaction removal failed: ${removed.status}`)
        return sendJson(response, 200, { reacted: false })
      }
      const added = await supabaseRequest('community_reactions?on_conflict=message_type,message_id,actor_key,emoji', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ message_type: messageType, message_id: messageId, actor_key: actorKey, emoji }) })
      if (!added.ok) throw new Error(`Reaction add failed: ${added.status}`)
      return sendJson(response, 200, { reacted: true })
    }

    if (request.method === 'POST' && role === 'coach' && ['update-app-feedback', 'close-app-feedback', 'archive-app-feedback', 'reply-app-feedback'].includes(request.body?.action)) {
      if (!isSuperadminRequest(request)) return sendJson(response, 403, { error: 'Endast superadmin kan hantera appfeedback.' })
      const id = String(request.body?.id || '')
      if (!/^\d+$/.test(id)) return sendJson(response, 400, { error: 'Feedback saknar giltigt id.' })
      const action = request.body.action
      if (action === 'update-app-feedback') {
        const status = String(request.body?.status || '')
        const adminNote = String(request.body?.adminNote || '').trim()
        if (!['new', 'in_progress', 'completed', 'not_implementing'].includes(status) || adminNote.length > 2000) return sendJson(response, 400, { error: 'Kontrollera status och intern kommentar (max 2000 tecken).' })
        const result = await supabaseRequest(`app_feedback?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ workflow_status: status, admin_note: adminNote || null, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`App feedback update failed: ${result.status}`)
        if (!(await result.json()).length) return sendJson(response, 404, { error: 'Feedbacken kunde inte hittas.' })
        return sendJson(response, 200, { ok: true })
      }
      if (action === 'close-app-feedback') {
        const status = String(request.body?.status || '')
        const adminNote = String(request.body?.adminNote || '').trim()
        if (!['completed', 'not_implementing'].includes(status) || adminNote.length > 2000) return sendJson(response, 400, { error: 'Välj ett avslutsbeslut och en intern kommentar på högst 2000 tecken.' })
        const now = new Date().toISOString()
        const result = await supabaseRequest(`app_feedback?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ workflow_status: status, admin_note: adminNote || null, archived_at: now, updated_at: now }) })
        if (!result.ok) throw new Error(`App feedback close failed: ${result.status}`)
        if (!(await result.json()).length) return sendJson(response, 404, { error: 'Feedbacken kunde inte hittas.' })
        return sendJson(response, 200, { ok: true })
      }
      if (action === 'archive-app-feedback') {
        const archived = request.body?.archived === true
        const filter = archived ? '&workflow_status=in.(completed,not_implementing)' : ''
        const result = await supabaseRequest(`app_feedback?id=eq.${id}${filter}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`App feedback archive failed: ${result.status}`)
        if (!(await result.json()).length) return sendJson(response, archived ? 409 : 404, { error: archived ? 'Feedbacken måste vara klarmarkerad eller markerad att den inte ska implementeras innan den arkiveras.' : 'Feedbacken kunde inte hittas.' })
        return sendJson(response, 200, { ok: true })
      }
      const content = String(request.body?.content || '').trim()
      if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Skriv ett meddelande på 1–1000 tecken.' })
      const feedbackResult = await supabaseRequest(`app_feedback?id=eq.${id}&select=id,profile_id,submitted_by_role,admin_reply,admin_reply_sent_at&limit=1`)
      if (!feedbackResult.ok) throw new Error(`App feedback reply lookup failed: ${feedbackResult.status}`)
      const feedback = (await feedbackResult.json())[0]
      if (!feedback) return sendJson(response, 404, { error: 'Feedbacken kunde inte hittas.' })
      if (!feedback.profile_id || feedback.submitted_by_role !== 'swimmer') return sendJson(response, 400, { error: 'Det går bara att svara direkt till feedback från en simmare.' })
      if (feedback.admin_reply_sent_at) return sendJson(response, 409, { error: 'Ett svar har redan skickats för detta förslag.' })
      const recipient = await supabaseRequest(`profiles?id=eq.${feedback.profile_id}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
      if (!recipient.ok || !(await recipient.json()).length) return sendJson(response, 404, { error: 'Simmaren kunde inte hittas eller är inte aktiv.' })
      const messageResult = await supabaseRequest('private_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_role: 'coach', recipient_profile_id: feedback.profile_id, recipient_role: 'swimmer', content: `Svar på ditt förslag: ${content}` }) })
      if (!messageResult.ok) throw new Error(`App feedback reply message failed: ${messageResult.status}`)
      const [message] = await messageResult.json()
      queueMessagePush({ kind: 'private', id: message.id, profileId: feedback.profile_id })
      const sentAt = new Date().toISOString()
      const savedReply = await supabaseRequest(`app_feedback?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ admin_reply: content, admin_reply_sent_at: sentAt, updated_at: sentAt }) })
      if (!savedReply.ok) throw new Error(`App feedback reply save failed: ${savedReply.status}`)
      return sendJson(response, 200, { ok: true, sentAt })
    }

    if (request.method === 'POST' && role === 'coach' && request.body?.action !== 'app-feedback' && request.body?.action !== 'reset-app-feedback') {
      if (request.body?.action === 'propose-private-reply') {
        response.setHeader('Cache-Control','private, no-store')
        try {return sendJson(response,200,await proposePrivateReply(request,request.body))}
        catch(error){return sendJson(response,error.status || 502,{error:error.message})}
      }
      if (request.body?.action === 'delete-private-message') {
        const id = String(request.body?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Meddelandet saknar id.' })
        const result = await supabaseRequest(`private_messages?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        if (!result.ok) throw new Error(`Private message delete failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.action === 'delete-coach-feed-event') {
        const id = String(request.body?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Händelsen saknar id.' })
        const current = await getCoachFeedVisibility()
        const hiddenIds = [...new Set([...(Array.isArray(current.hiddenIds) ? current.hiddenIds : []), id])].slice(-1000)
        await saveCoachFeedVisibility({ ...current, hiddenIds })
        return sendJson(response, 200, { ok: true, deletedId: id })
      }
      if (request.body?.action === 'clear-coach-feed') {
        await saveCoachFeedVisibility({ hiddenIds: [], clearedAt: new Date().toISOString() })
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.action === 'open-chat-message') {
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Meddelandet måste vara 1–1000 tecken.' })
        const [moderation, enabledResult] = await Promise.all([
          moderateCustomPep(request, content),
          supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1'),
        ])
        if (!moderation.allowed) return sendJson(response, 422, { error: moderation.error })
        const settings = enabledResult.ok ? ((await enabledResult.json())[0]?.setting_value || {}) : {}
        if (settings.openChat?.enabled !== true) return sendJson(response, 403, { error: 'Den öppna chatten är avstängd av tränarna.' })
        const result = await supabaseRequest('open_chat_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_role: 'coach', visibility: 'group', content }) })
        if (!result.ok) throw new Error(`Open chat insert failed: ${result.status} ${await result.text()}`)
        const [message] = await result.json()
        queueMessagePush({ kind: 'coach-info', id: message.id, senderCoachId: coachFromRequest(request)?.sub })
        return sendJson(response, 201, { ok: true, message: { id: message.id, content: message.content, createdAt: message.created_at, senderRole: 'coach', senderProfileId: null, sender: { displayName: 'Tränare', emoji: '🧑‍🏫' } } })
      }
      if (request.body?.action === 'delete-open-chat-message') {
        const id = String(request.body?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Meddelandet saknar id.' })
        const result = await supabaseRequest(`open_chat_messages?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ deleted_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Open chat delete failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.action === 'clear-open-chat') {
        if (!coachFromRequest(request)) return sendJson(response, 403, { error: 'Endast en inloggad tränare kan rensa chatten.' })
        const result = await supabaseRequest('open_chat_messages?deleted_at=is.null', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ deleted_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Open chat clear failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.action === 'polish-community-post') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Skriv ett meddelande på högst 1000 tecken.' })
        return sendJson(response, 200, await polishCommunityPost(request, content))
      }
      if (request.body?.action === 'message') {
        if (request.body.replyToMessageId) {
          try {
            const reply = await saveLinkedPrivateReply(request.body)
            queueMessagePush({kind:'private',id:reply.id,profileId:reply.recipientId})
            return sendJson(response,201,{ok:true,privateReply:reply})
          } catch(error) { return sendJson(response,error.status || 502,{error:error.message}) }
        }
        const recipientId = String(request.body?.recipientId || ''), content = String(request.body?.content || '').trim()
        if (!recipientId || !content || content.length > 1000) return sendJson(response, 400, { error: 'Välj simmare och skriv ett meddelande på högst 1000 tecken.' })
        const recipient = await supabaseRequest(`profiles?id=eq.${recipientId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
        if (!recipient.ok || !(await recipient.json()).length) return sendJson(response, 404, { error: 'Simmaren kunde inte hittas.' })
        const result = await supabaseRequest('private_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_role: 'coach', recipient_profile_id: recipientId, recipient_role: 'swimmer', content }) })
        if (!result.ok) throw new Error(`Coach message failed: ${result.status}`)
        const [message] = await result.json()
        queueMessagePush({ kind: 'private', id: message.id, profileId: recipientId })
        return sendJson(response, 201, { ok: true })
      }
      const content = String(request.body?.content || '').trim()
      if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Meddelandet måste vara 1–1000 tecken.' })
      const result = await supabaseRequest('community_posts', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ content, author_role: 'coach' }),
      })
      if (!result.ok) throw new Error(`Post insert failed: ${result.status} ${await result.text()}`)
      const [post] = await result.json()
      queueMessagePush({ kind: 'coach-post', id: post.id, senderCoachId: coachFromRequest(request)?.sub })
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
      const profile = role === 'swimmer' ? await getSessionProfile(request) : null
      if (request.body?.action === 'delete-private-message') {
        const id = String(request.body?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Meddelandet saknar id.' })
        if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Logga in på din profil.' })
        const ownerFilter = role === 'coach' ? '' : `&sender_profile_id=eq.${encodeURIComponent(profile.id)}&sender_role=eq.swimmer`
        const result = await supabaseRequest(`private_messages?id=eq.${encodeURIComponent(id)}${ownerFilter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        if (!result.ok) throw new Error(`Private message delete failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil för att skicka pepp.' })
      if (request.body?.action === 'open-chat-message') {
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Meddelandet måste vara 1–1000 tecken.' })
        const settingsResult = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
        const settings = settingsResult.ok ? ((await settingsResult.json())[0]?.setting_value || {}) : {}
        if (settings.openChat?.enabled !== true || settings.openChat?.coachOnly === true) return sendJson(response, 403, { error: settings.openChat?.coachOnly === true ? 'Chatten är just nu öppen endast för tränare.' : 'Den öppna chatten är avstängd av tränarna.' })
        const moderation = await moderateCustomPep(request, content)
        if (!moderation.allowed) return sendJson(response, 422, { error: moderation.error })
        const result = await supabaseRequest('open_chat_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_role: 'swimmer', sender_profile_id: profile.id, visibility: settings.openChat?.swimmerPrivate !== false ? 'coaches' : 'group', content }) })
        if (!result.ok) throw new Error(`Open chat insert failed: ${result.status} ${await result.text()}`)
        const [message] = await result.json()
        queueMessagePush({ kind: 'question', id: message.id, toCoaches: true })
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true, message: { id: message.id, content: message.content, createdAt: message.created_at, senderRole: 'swimmer', senderProfileId: profile.id, sender: { displayName: profile.display_name || 'Du', emoji: profile.emoji || '🏊' } } })
      }
      if (request.body?.action === 'delete-open-chat-message') {
        const id = String(request.body?.id || '')
        const result = await supabaseRequest(`open_chat_messages?id=eq.${encodeURIComponent(id)}&sender_profile_id=eq.${encodeURIComponent(profile.id)}&deleted_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ deleted_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Open chat delete failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.mode === 'coach') {
        const content = String(request.body?.content || '').trim()
        if (!content || content.length > 1000) return sendJson(response, 400, { error: 'Skriv ett meddelande på högst 1000 tecken.' })
        const result = await supabaseRequest('private_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_profile_id: profile.id, sender_role: 'swimmer', recipient_role: 'coach', content }) })
        if (!result.ok) throw new Error(`Swimmer message failed: ${result.status}`)
        const [message] = await result.json()
        queueMessagePush({ kind: 'private', id: message.id, toCoaches: true })
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true })
      }
      const mode = request.body?.mode === 'group' ? 'group' : 'private'
      const privateSent = await messagesSentToday('kudos', profile.id)
      const groupSent = await messagesSentToday('group_pep', profile.id)
      const earnsPoint = privateSent + groupSent < 4
      if (mode === 'private' && !earnsPoint) return sendJson(response, 429, { error: 'Du har skickat fyra peppmeddelanden idag. Fortsätt gärna prata i den öppna kanalen utan fler poäng.' })
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
        const shouldModerateInBackground = templateKey === 'custom' && customContent !== '🙌'
        if (templateKey === 'custom') {
          if (!customPepEnabled) return sendJson(response, 403, { error: 'Egna peppmeddelanden är avstängda av tränarna.' })
          if (!customContent || customContent.length > 300) return sendJson(response, 400, { error: 'Skriv ett eget peppmeddelande på 1–300 tecken.' })
          if (hasBlockedPepLanguage(customContent)) return sendJson(response, 422, { error: 'Meddelandet kan inte skickas eftersom det innehåller svordomar eller ett personangrepp. Skriv gärna om det med respektfull ton.' })
        } else if (!GROUP_TEMPLATES[templateKey]) return sendJson(response, 400, { error: 'Välj en grupphälsning.' })
        const reply = request.body?.reply
        if (reply && (!['group', 'coach'].includes(reply.type) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reply.id))) return sendJson(response, 400, { error: 'Välj ett giltigt meddelande att svara på.' })
        if (reply) {
          const target = await supabaseRequest(`${reply.type === 'group' ? 'group_pep' : 'community_posts'}?id=eq.${reply.id}${reply.type === 'coach' ? '&deleted_at=is.null' : '&moderation_status=eq.approved'}&select=id&limit=1`)
          if (!target.ok) throw new Error('Reply lookup failed')
          if (!(await target.json()).length) return sendJson(response, 404, { error: 'Meddelandet finns inte längre. Avbryt svaret och skicka utan citat.' })
        }
        const result = await supabaseRequest('group_pep', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sender_profile_id: profile.id, template_key: templateKey, content: templateKey === 'custom' ? customContent : null, ...(shouldModerateInBackground ? { moderation_status: 'pending', point_eligible: earnsPoint } : {}), ...(reply ? { reply_type: reply.type, reply_id: reply.id } : {}) }) })
        if (!result.ok) throw new Error(`Group pep insert failed: ${result.status} ${await result.text()}`)
        const [pep] = await result.json()
        const message = { id: pep.id, type: 'group', content: pep.content || GROUP_TEMPLATES[pep.template_key], moderationStatus: shouldModerateInBackground ? 'pending' : 'approved', createdAt: pep.created_at, sender: { id: profile.id, displayName: profile.display_name || 'Du', emoji: profile.emoji || '🏊' }, reactions: [], ...(reply ? { reply: { id: reply.id, type: reply.type } } : {}) }
        if (shouldModerateInBackground) {
          waitUntil(finishGroupPepModeration(request, pep).catch((error) => console.error('Background group pep moderation failed:', error.message)))
          return sendJson(response, 202, { ok: true, awardedPoints: 0, pointEligible: earnsPoint, moderationPending: true, message })
        }
        if (earnsPoint) await awardPoints(profile.id, 'kudos_sent', 1, `${stockholmDate()}:${pep.id}`)
        await touchProfileActivity(profile.id)
        return sendJson(response, 201, { ok: true, awardedPoints: earnsPoint ? 1 : 0, message })
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
      queueMessagePush({ kind: 'private-pep', id: kudos.id, profileId: recipientId })
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
