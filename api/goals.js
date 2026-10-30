import { aiAvailability, getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { coachFromRequest } from '../server/coach-auth.js'
import { awardPoints, getSessionProfile } from '../server/profile-auth.js'
import { queueCategoryPush, queueMessagePush } from '../server/web-push.js'
import { saveGoalImage, removeUnattachedGoalImage, goalImageUrl, improveGoalText } from '../server/goal-support.js'
import { writeAuditLog } from '../server/audit.js'
import { TALK_FIELD_LABELS } from '../shared/development-talk-form.js'
import { proposeTalkAgreement } from '../server/talk-agreement.js'
import { loadTalkAgreementContext } from '../server/talk-agreement-context.js'
import { generateTalkPreparation } from '../server/talk-preparation.js'
import { beginGoalVideo, finishGoalVideo, cancelGoalVideo, replaceGoalImage, clearGoalMedia, signedGoalVideo, cleanupGoalVideo } from '../server/goal-video.js'

const STATUSES = ['planned', 'active', 'paused', 'complete']
const validTalkDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const validTalkText = (value, max) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 50 && Object.values(value).every((text) => typeof text === 'string' && text.length <= max)
const FEEDBACK = {
  progress: { points: 5, event: 'goal_progress' },
  strong_week: { points: 5, event: 'goal_progress' },
  milestone: { points: 10, event: 'goal_progress' },
  goal_complete: { points: 20, event: 'goal_complete' },
}

const mapGoal = (goal, updates = [], imageUrl = null, videoPosterUrl = null) => ({
  id: goal.id, profileId: goal.profile_id, title: goal.title, description: goal.description,
  nextStep: goal.next_step || '', startDate: goal.start_date, targetDate: goal.target_date,
  status: goal.status, createdAt: goal.created_at, updatedAt: goal.updated_at, swimmerSeenAt: goal.swimmer_seen_at || null,
  imageUrl, hasImage: Boolean(goal.image_path),
  hasVideo: Boolean(goal.video_path), videoPosterUrl, videoDurationMs: goal.video_duration_ms || null, videoBytes: goal.video_bytes || null, videoCodec: goal.video_codec || null,
  videoVersion: goal.video_path?.split('/').at(-1) || null,
  updates: updates.filter((item) => item.goal_id === goal.id).map((item) => ({
    id: item.id, authorRole: item.author_role, content: item.content,
    feedbackType: item.feedback_type, points: item.points, createdAt: item.created_at, coachSeenAt: item.coach_seen_at || null,
  })),
})

const mapTalk = (item) => ({ id: item.id, swimmerId: item.swimmer_id, coachId: item.coach_id, groupId: item.group_id, meetingDate: item.meeting_date, status: item.status, enabled: item.enabled !== false, swimmerSeenAt: item.swimmer_seen_at || null, swimmerAnswers: item.swimmer_answers || {}, coachNotes: item.coach_notes || {}, coachPreparation: item.coach_preparation || null, agreement: item.agreement || {}, followUpDate: item.follow_up_date, createdAt: item.created_at, updatedAt: item.updated_at })
async function loadTalks(profileId = null) {
  const filter = profileId ? `&swimmer_id=eq.${profileId}` : ''
  const result = await supabaseRequest(`development_talks?select=*&${filter.slice(1)}&order=meeting_date.desc,created_at.desc&limit=200`)
  if (!result.ok) throw new Error(`Development talks GET failed: ${result.status}`)
  return (await result.json()).map(mapTalk)
}
const swimmerTalk = (talk) => { const { coachNotes, coachPreparation, ...visible } = talk; return visible }
async function talksEnabled() {
  const result = await supabaseRequest("app_settings?setting_key=eq.development_talks&select=setting_value&limit=1")
  if (!result.ok) return true
  return (await result.json())[0]?.setting_value?.enabled !== false
}

async function loadGoals(profileId = null) {
  const filter = profileId ? `&profile_id=eq.${profileId}` : ''
  const goalsResult = await supabaseRequest(`development_goals?select=*${filter}&order=updated_at.desc`)
  if (!goalsResult.ok) throw new Error(`Goals GET failed: ${goalsResult.status} ${await goalsResult.text()}`)
  const goals = await goalsResult.json()
  if (!goals.length) return []
  const updatesResult = await supabaseRequest(`goal_updates?goal_id=in.(${goals.map((goal) => goal.id).join(',')})&select=*&order=created_at.desc`)
  if (!updatesResult.ok) throw new Error(`Goal updates GET failed: ${updatesResult.status}`)
  const updates = await updatesResult.json()
  return Promise.all(goals.map(async (goal) => { const [image, poster] = await Promise.all([goalImageUrl(goal).catch(() => null), signedGoalVideo(goal, true).catch(() => null)]); return mapGoal(goal, updates, image, poster) }))
}

async function findGoal(id, profileId = null) {
  const result = await supabaseRequest(`development_goals?id=eq.${encodeURIComponent(id)}${profileId ? `&profile_id=eq.${encodeURIComponent(profileId)}` : ''}&select=*&limit=1`)
  if (!result.ok) throw new Error(`Goal lookup failed: ${result.status}`)
  return (await result.json())[0] || null
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)
  const coachAccount = role === 'coach' ? coachFromRequest(request) : null
  const isSuperadmin = coachAccount?.role === 'superadmin'
  const isHeadCoach = coachAccount?.role === 'head_coach'
  if (request.method === 'POST' && ['begin-goal-video', 'finish-goal-video', 'cancel-goal-video', 'replace-goal-image', 'clear-goal-media', 'polish-goal', 'propose-talk-agreement', 'talk-agreement-context', 'talk-preparation-context', 'generate-talk-preparation', 'create', 'edit'].includes(request.body?.action) && role !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan skapa och redigera utvecklingsmål och överenskommelser.' })
  try {
    if (request.method === 'GET') {
      if (request.query?.video === 'true') {
        response.setHeader('Cache-Control', 'private, no-store')
        const profile = role === 'coach' ? null : await getSessionProfile(request)
        if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Logga in på din profil för att se videon.' })
        const id = String(request.query.goalId || '')
        if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(response, 400, { error: 'Välj ett giltigt utvecklingsmål.' })
        const goal = await findGoal(id, profile?.id)
        if (!goal?.video_path || (profile && goal.profile_id !== profile.id)) return sendJson(response, 404, { error: 'Videon kunde inte hittas i dina utvecklingsmål.' })
        const url = await signedGoalVideo(goal)
        if (!url) return sendJson(response, 502, { error: 'Videon kunde inte öppnas. Försök igen.' })
        return sendJson(response, 200, { url })
      }
      if (request.query?.home === 'true') {
        const profile = await getSessionProfile(request)
        if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil först.' })
        const result = await supabaseRequest(`development_goals?profile_id=eq.${encodeURIComponent(profile.id)}&swimmer_seen_at=is.null&status=neq.complete&select=id,title,created_at&order=created_at.desc&limit=10`)
        if (!result.ok) throw new Error(`Goal home lookup failed: ${result.status}`)
        return sendJson(response, 200, { goals: (await result.json()).map((goal) => ({ id: goal.id, title: goal.title, createdAt: goal.created_at })) })
      }
      if (request.query?.coachAlerts === 'true') {
        if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan läsa målens svar.' })
        const result = await supabaseRequest('goal_updates?author_role=eq.swimmer&coach_seen_at=is.null&select=id,goal_id&order=created_at.desc&limit=500')
        if (!result.ok) throw new Error(`Goal alert lookup failed: ${result.status}`)
        const updates = await result.json()
        return sendJson(response, 200, { count: updates.length, goalIds: [...new Set(updates.map((item) => item.goal_id))] })
      }
      if (request.query?.settings === 'true') {
        const result = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
        const value = result.ok ? (await result.json())[0]?.setting_value : null
        const full = value || { swimmer: {}, coach: {} }
        // Global/sensitive settings are only exposed to superadmin. Head coaches
        // still receive navigation settings so they can tailor the trainer view.
        const visible = isSuperadmin || role !== 'coach'
          ? full
          : { overview: full.overview || {}, coach: full.coach || {} }
        return sendJson(response, 200, { settings: visible })
      }
      if (request.query?.talks === 'true') {
        if (role === 'coach') return sendJson(response, 200, { talks: await loadTalks(request.query.profileId || null), globalEnabled: await talksEnabled() })
        const profile = await getSessionProfile(request)
        if (!profile) return sendJson(response, 403, { error: 'Utvecklingssamtal visas bara för inloggade profiler.' })
        return sendJson(response, 200, { talks: (await loadTalks(profile.id)).map(swimmerTalk), globalEnabled: await talksEnabled() })
      }
      if (role === 'coach') return sendJson(response, 200, { goals: await loadGoals() })
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Mål visas bara för inloggade profiler.' })
      return sendJson(response, 200, { goals: await loadGoals(profile.id) })
    }

    if (request.method === 'POST' && role === 'coach') {
      if (['begin-goal-video', 'finish-goal-video', 'cancel-goal-video', 'replace-goal-image', 'clear-goal-media'].includes(request.body?.action)) {
        try {
          const id = String(request.body.goalId || '')
          if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(response, 400, { error: 'Spara utvecklingsmålet först.' })
          const goal = await findGoal(id)
          if (!goal) return sendJson(response, 404, { error: 'Utvecklingsmålet kunde inte hittas.' })
          if (request.body.action === 'begin-goal-video') return sendJson(response, 200, await beginGoalVideo(goal, request.body))
          if (request.body.action === 'cancel-goal-video') return sendJson(response, 200, await cancelGoalVideo(goal, request.body))
          const saved = await (request.body.action === 'finish-goal-video' ? finishGoalVideo : request.body.action === 'replace-goal-image' ? replaceGoalImage : clearGoalMedia)(goal, request.body)
          return sendJson(response, 200, { goal: mapGoal(saved, [], await goalImageUrl(saved).catch(() => null), await signedGoalVideo(saved, true).catch(() => null)) })
        } catch (error) { return sendJson(response, error.status || 422, { error: error.message }) }
      }
      if (['talk-preparation-context', 'generate-talk-preparation'].includes(request.body?.action)) {
        try {
          // Check schema before the paid model call, with a useful migration message.
          const schema = await supabaseRequest('development_talks?select=coach_preparation&limit=0')
          if (!schema.ok) return sendJson(response, 503, { error: 'Samtalsunderlag behöver databasuppdatering 108_development_talk_preparation. Be administratören köra den först.' })
          const prepared = await loadTalkAgreementContext(request.body, { purpose: 'preparation' })
          if (request.body.action === 'talk-preparation-context') return sendJson(response, 200, prepared)
          if (prepared.contextHash !== request.body.contextHash) return sendJson(response, 409, { error: 'Underlaget har ändrats. Uppdatera och granska underlaget först.' })
          const availability = await aiAvailability()
          if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? 'Klubbens månadstak för AI är nått.' : 'AI-stöd är avstängt.' })
          const draft = await generateTalkPreparation(request, prepared.context)
          const generatedAt = new Date().toISOString()
          const preparation = { ...draft, generatedAt, period: prepared.context.period, periodChoice: request.body.period || 'since-last', sources: request.body.sources, warnings: prepared.context.warnings, contextHash: prepared.contextHash, sourceVersion: prepared.talkVersion }
          const saved = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(request.body.talkId)}&updated_at=eq.${encodeURIComponent(prepared.talkVersion)}&status=in.(prepared,completed)`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ coach_preparation: preparation, updated_at: generatedAt }) })
          if (!saved.ok) throw new Error('Underlaget kunde inte sparas. Försök igen.')
          const [row] = await saved.json()
          if (!row) return sendJson(response, 409, { error: 'Samtalet ändrades medan analysen skapades. Uppdatera samtalet och försök igen.' })
          return sendJson(response, 200, { talk: mapTalk(row) })
        } catch (error) { return sendJson(response, error.status || 502, { error: error.message }) }
      }
      if (request.body?.action === 'talk-agreement-context') {
        try { return sendJson(response, 200, await loadTalkAgreementContext(request.body)) }
        catch (error) { return sendJson(response, error.status || 502, { error: error.message }) }
      }
      if (['polish-goal', 'propose-talk-agreement'].includes(request.body?.action)) {
        const availability = await aiAvailability()
        if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? 'Klubbens månadstak för AI är nått.' : 'AI-stöd är avstängt.' })
        try {
          if (request.body.action === 'polish-goal') return sendJson(response, 200, await improveGoalText(request, request.body))
          let context
          if (request.body.talkId) {
            const prepared = await loadTalkAgreementContext(request.body)
            if (prepared.contextHash !== request.body.contextHash) return sendJson(response, 409, { error: 'Underlaget har ändrats. Uppdatera och granska AI-underlaget innan du skapar förslaget.' })
            context = prepared.context
          }
          return sendJson(response, 200, await proposeTalkAgreement(request, request.body.notes, { context }))
        } catch (error) { return sendJson(response, error.status || 422, { error: error.message }) }
      }
      const action = request.body?.action
      if (action === 'save-settings' || action === 'reset-settings') {
        if (!isSuperadmin && !isHeadCoach) return sendJson(response, 403, { error: 'Endast huvudtränare eller superadmin kan ändra webapp-inställningar.' })
        const current = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
        const existing = current.ok ? ((await current.json())[0]?.setting_value || {}) : {}
        const submitted = request.body.settings || { swimmer: {}, coach: {} }
        const value = action === 'reset-settings'
          ? (isSuperadmin ? { swimmer: {}, coach: {}, sportAdminCalendars: existing.sportAdminCalendars || [] } : { ...existing, overview: {}, coach: {} })
          : (isSuperadmin ? { ...existing, ...submitted } : { ...existing, overview: submitted.overview || existing.overview || {}, coach: submitted.coach || existing.coach || {} })
        const result = await supabaseRequest('app_settings?on_conflict=setting_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ setting_key: 'webapp', setting_value: value, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Webapp settings save failed: ${result.status}`)
        return sendJson(response, 200, { settings: value })
      }
      if (action === 'create-talk' || action === 'update-talk') {
        const id = String(request.body.id || ''), profileId = String(request.body.profileId || ''), body = request.body
        let current = null
        if (action === 'update-talk') {
          if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(response, 400, { error: 'Samtalet kunde inte hittas.' })
          const existing = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
          if (!existing.ok) throw new Error(`Development talk lookup failed: ${existing.status}`)
          current = (await existing.json())[0]
          if (!current) return sendJson(response, 404, { error: 'Samtalet finns inte längre. Uppdatera sidan.' })
          if (profileId && profileId !== current.swimmer_id) return sendJson(response, 400, { error: 'Samtalet tillhör en annan simmare.' })
        }
        const status = body.status ?? current?.status ?? 'draft'
        const meetingDate = body.meetingDate ?? current?.meeting_date ?? new Date().toISOString().slice(0, 10)
        const followUpDate = body.followUpDate === undefined ? current?.follow_up_date || null : body.followUpDate || null
        if (!(current?.swimmer_id || profileId) || !validTalkDate(meetingDate) || (followUpDate && (!validTalkDate(followUpDate) || followUpDate < meetingDate))) return sendJson(response, 400, { error: 'Välj en simmare, ett giltigt samtalsdatum och eventuell uppföljning tidigast samma dag.' })
        if (!['draft', 'prepared', 'completed'].includes(status)) return sendJson(response, 400, { error: 'Välj en giltig samtalsstatus.' })
        if ((body.coachNotes !== undefined && !validTalkText(body.coachNotes, 10000)) || (body.agreement !== undefined && !validTalkText(body.agreement, 5000))) return sendJson(response, 400, { error: 'Kontrollera anteckningarna (högst 10 000 tecken) och överenskommelsen (högst 5 000 tecken).' })
        const editingAnswers = action === 'update-talk' && body.swimmerAnswers !== undefined
        if (editingAnswers) {
          const answers = body.swimmerAnswers
          const previous = current.swimmer_answers || {}
          if (current.status === 'completed') return sendJson(response, 403, { error: 'Svaren i ett genomfört samtal kan inte längre ändras.' })
          if (!body.expectedUpdatedAt || body.expectedUpdatedAt !== current.updated_at) return sendJson(response, 409, { error: 'Samtalet har ändrats sedan du öppnade det. Uppdatera och granska svaren innan du sparar.' })
          if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length > 50 || Object.keys(answers).some((key) => key === '__step' ? !Object.hasOwn(previous, key) || answers[key] !== previous[key] : (!Object.hasOwn(previous, key) && !Object.hasOwn(TALK_FIELD_LABELS, key)) || typeof answers[key] !== 'string' || answers[key].length > 1000)) return sendJson(response, 400, { error: 'Kontrollera svaren. Fyll i formulärets frågor eller rätta befintliga svar, högst 1 000 tecken per svar.' })
          if (Object.keys(previous).some((key) => !Object.hasOwn(answers, key))) return sendJson(response, 400, { error: 'Något svar saknas. Uppdatera samtalet och försök igen.' })
        }
        const payload = { meeting_date: meetingDate, status, follow_up_date: followUpDate, updated_at: new Date().toISOString(), ...(body.enabled !== undefined ? { enabled: body.enabled !== false } : {}), ...(body.coachNotes !== undefined ? { coach_notes: body.coachNotes } : {}), ...(body.agreement !== undefined ? { agreement: body.agreement } : {}), ...(editingAnswers ? { swimmer_answers: body.swimmerAnswers } : {}) }
        // Ordinary coach saves preserve swimmer answers; explicit joint edits
        // require a matching version and never alter the swimmer's step metadata.
        if (action === 'create-talk') Object.assign(payload, { swimmer_id: profileId, coach_id: 'coach', group_id: body.groupId || null, swimmer_answers: body.swimmerAnswers || {}, enabled: body.enabled !== false })
        const result = action === 'create-talk' ? await supabaseRequest('development_talks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }) : await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}&swimmer_id=eq.${encodeURIComponent(current.swimmer_id)}${body.expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(body.expectedUpdatedAt)}` : ''}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!result.ok) throw new Error(`Development talk save failed: ${result.status} ${await result.text()}`)
        const [row] = await result.json()
        if (!row) return sendJson(response, 409, { error: 'Samtalet har ändrats av någon annan. Uppdatera och granska innan du sparar.' })
        const talk = mapTalk(row)
        if (editingAnswers) {
          const changedFields = Object.keys(body.swimmerAnswers).filter((key) => key !== '__step' && body.swimmerAnswers[key] !== current.swimmer_answers?.[key])
          if (changedFields.length) await writeAuditLog(request, { eventType: 'development_talk_answers_edited', role: 'coach', profileId: current.swimmer_id, details: { talkId: id, changedFields, coachAccountId: coachAccount?.sub || null } })
        }
        if (action === 'create-talk' && talk.enabled && talk.status === 'draft') queueCategoryPush({ category: 'developmentTalks', id: talk.id, profileId: talk.swimmerId })
        return sendJson(response, 200, { talk })
      }
      if (action === 'create-talks') {
        const profileIds = [...new Set((Array.isArray(request.body.profileIds) ? request.body.profileIds : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100)
        const meetingDate = String(request.body.meetingDate || '')
        if (!profileIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return sendJson(response, 400, { error: 'Välj minst en simmare och ett giltigt datum.' })
        const profileResult = await supabaseRequest(`profiles?id=in.(${profileIds.map(encodeURIComponent).join(',')})&select=id`)
        if (!profileResult.ok) throw new Error(`Bulk talk profile lookup failed: ${profileResult.status}`)
        const validIds = new Set((await profileResult.json()).map((profile) => profile.id))
        if (validIds.size !== profileIds.length) return sendJson(response, 400, { error: 'En eller flera simmarprofiler kunde inte hittas. Uppdatera listan och försök igen.' })
        const activeResult = await supabaseRequest(`development_talks?swimmer_id=in.(${profileIds.map(encodeURIComponent).join(',')})&enabled=eq.true&status=in.(draft,prepared)&select=swimmer_id`)
        if (!activeResult.ok) throw new Error(`Bulk talk duplicate lookup failed: ${activeResult.status}`)
        const alreadyActive = new Set((await activeResult.json()).map((talk) => talk.swimmer_id))
        const createIds = profileIds.filter((profileId) => !alreadyActive.has(profileId))
        if (!createIds.length) return sendJson(response, 200, { talks: [], skipped: profileIds.length, message: 'Alla valda simmare har redan ett aktivt samtal.' })
        const payload = createIds.map((profileId) => ({ swimmer_id: profileId, coach_id: 'coach', meeting_date: meetingDate, status: 'draft', enabled: true, swimmer_answers: {}, coach_notes: {}, agreement: {}, updated_at: new Date().toISOString() }))
        const result = await supabaseRequest('development_talks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!result.ok) throw new Error(`Bulk development talk save failed: ${result.status} ${await result.text()}`)
        const talks = (await result.json()).map(mapTalk)
        talks.forEach((talk) => queueCategoryPush({ category: 'developmentTalks', id: talk.id, profileId: talk.swimmerId }))
        return sendJson(response, 201, { talks, skipped: alreadyActive.size })
      }
      if (action === 'delete-talk') {
        const id = String(request.body.id || '')
        if (!id) return sendJson(response, 400, { error: 'Samtal saknas.' })
        const result = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!result.ok) throw new Error(`Development talk delete failed: ${result.status}`)
        return sendJson(response, 200, { ok: true, id })
      }
      if (action === 'toggle-talk') {
        const id = String(request.body.id || ''), enabled = Boolean(request.body.enabled)
        if (!id) return sendJson(response, 400, { error: 'Samtalet saknar id.' })
        let status
        let wasEnabled = null
        if (enabled) {
          const current = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}&select=status,enabled,swimmer_id&limit=1`)
          if (!current.ok) throw new Error(`Development talk lookup failed: ${current.status}`)
          const currentTalk = (await current.json())[0]
          wasEnabled = currentTalk?.enabled === true
          // Reopening an older conversation should make it available in the
          // swimmer view again, even if its previous preparation was marked
          // ready. The home card intentionally only appears for draft talks.
          if (currentTalk?.enabled === false && ['prepared', 'completed'].includes(currentTalk.status)) status = 'draft'
        }
        const result = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ enabled, ...(status ? { status } : {}), updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Development talk setting failed: ${result.status}`)
        const talk = mapTalk((await result.json())[0])
        if (enabled && wasEnabled === false && talk.status !== 'completed') queueCategoryPush({ category: 'developmentTalks', id: talk.id, profileId: talk.swimmerId })
        return sendJson(response, 200, { talk })
      }
      if (action === 'toggle-talk-global') {
        const enabled = Boolean(request.body.enabled)
        const result = await supabaseRequest('app_settings?on_conflict=setting_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ setting_key: 'development_talks', setting_value: { enabled }, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Global development talk setting failed: ${result.status}`)
        return sendJson(response, 200, { globalEnabled: enabled })
      }
      if (action === 'create') {
        const profileId = String(request.body.profileId || '')
        const title = String(request.body.title || '').trim()
        const description = String(request.body.description || '').trim()
        const nextStep = String(request.body.nextStep || '').trim()
        const startDate = String(request.body.startDate || '')
        const targetDate = request.body.targetDate ? String(request.body.targetDate) : null
        if (!profileId || !title || title.length > 100 || !description || description.length > 2000 || nextStep.length > 500 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return sendJson(response, 400, { error: 'Kontrollera målformuläret.' })
        let imagePath = null
        if (request.body.imageData) {
          const owner = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(profileId)}&select=id&limit=1`)
          if (!owner.ok || !(await owner.json()).length) return sendJson(response, 400, { error: 'Simmarprofilen kunde inte hittas.' })
          try { imagePath = await saveGoalImage(profileId, request.body.imageData) } catch (error) { return sendJson(response, 422, { error: error.message }) }
        }
        // Transport failures can occur after the INSERT committed. Only clean
        // up the new image when the database explicitly rejects the insert.
        const result = await supabaseRequest('development_goals', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ profile_id: profileId, title, description, next_step: nextStep || null, start_date: startDate, target_date: targetDate, status: 'active', ...(imagePath ? { image_path: imagePath } : {}) }),
        })
        if (!result.ok) {
          if (imagePath) await removeUnattachedGoalImage(imagePath).catch(() => {})
          return sendJson(response, 422, { error: imagePath ? 'Målet kunde inte sparas. Kontrollera att migration 088 är körd. Ingen ändring har sparats.' : 'Målet kunde inte sparas. Kontrollera formuläret.' })
        }
        const goal = (await result.json())[0]
        queueCategoryPush({ category: 'developmentGoals', id: goal.id, profileId: goal.profile_id })
        return sendJson(response, 201, { goal: mapGoal(goal, [], await goalImageUrl(goal).catch(() => null)) })
      }
      if (action === 'edit') {
        const goalId = String(request.body.goalId || '')
        const title = String(request.body.title || '').trim()
        const description = String(request.body.description || '').trim()
        const nextStep = String(request.body.nextStep || '').trim()
        if (!goalId || !title || title.length > 100 || !description || description.length > 2000 || nextStep.length > 500) return sendJson(response, 400, { error: 'Kontrollera rubrik, beskrivning och nästa steg.' })
        const result = await supabaseRequest(`development_goals?id=eq.${encodeURIComponent(goalId)}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ title, description, next_step: nextStep || null, updated_at: new Date().toISOString() }),
        })
        if (!result.ok) throw new Error(`Goal edit failed: ${result.status}`)
        const [goal] = await result.json()
        if (!goal) return sendJson(response, 404, { error: 'Utvecklingsmålet kunde inte hittas.' })
        return sendJson(response, 200, { goal: mapGoal(goal) })
      }
      if (action === 'status') {
        const status = String(request.body.status || '')
        if (!STATUSES.includes(status)) return sendJson(response, 400, { error: 'Ogiltig status.' })
        const result = await supabaseRequest(`development_goals?id=eq.${request.body.goalId}`, { method: 'PATCH', body: JSON.stringify({ status, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Goal status failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (action === 'feedback') {
        const goal = await findGoal(String(request.body.goalId || ''))
        const feedback = FEEDBACK[request.body.feedbackType]
        const content = String(request.body.content || '').trim()
        if (!goal || !feedback || !content || content.length > 1000) return sendJson(response, 400, { error: 'Kontrollera återkopplingen.' })
        if (request.body.feedbackType === 'goal_complete') {
          const existingResult = await supabaseRequest(`point_events?profile_id=eq.${goal.profile_id}&event_type=eq.goal_complete&source_key=eq.${goal.id}&select=id&limit=1`)
          if (!existingResult.ok) throw new Error(`Goal reward lookup failed: ${existingResult.status}`)
          if ((await existingResult.json()).length) return sendJson(response, 409, { error: 'Slutpoängen för det här målet är redan utdelad.' })
        }
        const result = await supabaseRequest('goal_updates', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ goal_id: goal.id, author_role: 'coach', content, feedback_type: request.body.feedbackType, points: feedback.points }),
        })
        if (!result.ok) throw new Error(`Feedback insert failed: ${result.status} ${await result.text()}`)
        const [update] = await result.json()
        await awardPoints(goal.profile_id, feedback.event, feedback.points, feedback.event === 'goal_complete' ? goal.id : update.id)
        if (request.body.feedbackType === 'goal_complete') await supabaseRequest(`development_goals?id=eq.${goal.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'complete', updated_at: new Date().toISOString() }) })
        return sendJson(response, 201, { ok: true })
      }
      if (action === 'mark-coach-seen') {
        const goalId = String(request.body.goalId || '')
        if (!goalId || !(await findGoal(goalId))) return sendJson(response, 404, { error: 'Målet kunde inte hittas.' })
        const result = await supabaseRequest(`goal_updates?goal_id=eq.${encodeURIComponent(goalId)}&author_role=eq.swimmer&coach_seen_at=is.null`, { method: 'PATCH', body: JSON.stringify({ coach_seen_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Goal reply acknowledgement failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
    }

    if (request.method === 'POST' && request.body?.action === 'save-talk') {
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil först.' })
      if (!(await talksEnabled())) return sendJson(response, 403, { error: 'Utvecklingssamtal är avstängda.' })
      if (request.body.id) {
        const talkId = String(request.body.id)
        if (!/^[0-9a-f-]{36}$/i.test(talkId)) return sendJson(response, 400, { error: 'Samtalet kunde inte hittas.' })
        const existing = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(talkId)}&swimmer_id=eq.${encodeURIComponent(profile.id)}&select=enabled,status,updated_at&limit=1`)
        if (!existing.ok) throw new Error(`Development talk lookup failed: ${existing.status}`)
        const [talk] = await existing.json()
        if (!talk) return sendJson(response, 404, { error: 'Samtalet finns inte i din profil.' })
        if (talk.enabled === false || talk.status === 'completed') return sendJson(response, 403, { error: 'Samtalet är genomfört eller skrivskyddat.' })
        if (request.body.expectedUpdatedAt && request.body.expectedUpdatedAt !== talk.updated_at) return sendJson(response, 409, { error: 'Samtalet ändrades nyligen. Öppna det igen och granska svaren innan du sparar.' })
      }
      const id = String(request.body?.id || ''), answers = request.body?.swimmerAnswers || {}, status = request.body?.status === 'prepared' ? 'prepared' : 'draft'
      const payload = { swimmer_id: profile.id, meeting_date: request.body?.meetingDate || new Date().toISOString().slice(0, 10), status, swimmer_answers: answers, updated_at: new Date().toISOString() }
      const result = id ? await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}&swimmer_id=eq.${encodeURIComponent(profile.id)}${request.body.expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(request.body.expectedUpdatedAt)}` : ''}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }) : await supabaseRequest('development_talks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      if (!result.ok) throw new Error(`Development talk save failed: ${result.status} ${await result.text()}`)
      const [savedTalk] = await result.json()
      if (!savedTalk) return sendJson(response, 409, { error: 'Samtalet ändrades nyligen. Öppna det igen och granska svaren innan du sparar.' })
      return sendJson(response, 200, { talk: swimmerTalk(mapTalk(savedTalk)) })
    }

    if (request.method === 'POST') {
      const profile = await getSessionProfile(request)
      if (request.body?.action === 'mark-talk-viewed') {
        if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil först.' })
        const id = String(request.body.id || '')
        if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(response, 400, { error: 'Samtalet kunde inte hittas.' })
        const result = await supabaseRequest(`development_talks?id=eq.${encodeURIComponent(id)}&swimmer_id=eq.${encodeURIComponent(profile.id)}&enabled=eq.true&swimmer_seen_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ swimmer_seen_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Development talk view acknowledgement failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      if (request.body?.action === 'mark-viewed') {
        if (!profile) return sendJson(response, 403, { error: 'Logga in på din profil först.' })
        const ids = [...new Set((Array.isArray(request.body.goalIds) ? request.body.goalIds : []).filter((id) => /^[0-9a-f-]{36}$/i.test(String(id))))].slice(0, 30)
        if (!ids.length) return sendJson(response, 400, { error: 'Välj ett mål.' })
        const result = await supabaseRequest(`development_goals?id=in.(${ids.map(encodeURIComponent).join(',')})&profile_id=eq.${encodeURIComponent(profile.id)}&swimmer_seen_at=is.null`, { method: 'PATCH', body: JSON.stringify({ swimmer_seen_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Goal view acknowledgement failed: ${result.status}`)
        return sendJson(response, 200, { ok: true })
      }
      const goal = await findGoal(String(request.body?.goalId || ''))
      const content = String(request.body?.content || '').trim()
      if (!profile || !goal || goal.profile_id !== profile.id || goal.status === 'complete' || !content || content.length > 1000) return sendJson(response, 400, { error: 'Kunde inte spara reflektionen.' })
      const result = await supabaseRequest('goal_updates', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ goal_id: goal.id, author_role: 'swimmer', content, points: 0 }) })
      if (!result.ok) throw new Error(`Reflection insert failed: ${result.status}`)
      const [update] = await result.json()
      if (update) queueMessagePush({ kind: 'goal-reflection', id: update.id, toCoaches: true })
      return sendJson(response, 201, { ok: true })
    }

    if (request.method === 'DELETE' && role === 'coach') {
      const goal = await findGoal(String(request.query?.id || ''))
      const result = await supabaseRequest(`development_goals?id=eq.${encodeURIComponent(request.query?.id || '')}`, { method: 'DELETE' })
      if (!result.ok) throw new Error(`Goal delete failed: ${result.status}`)
      if (goal?.image_path && goal.image_path.startsWith(`${goal.profile_id}/`)) await removeUnattachedGoalImage(goal.image_path).catch(() => {})
      if (goal) await cleanupGoalVideo(goal, { includeIncoming: true }).catch(() => {})
      return sendJson(response, 200, { ok: true })
    }
    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hantera utvecklingsmålen.' })
  }
}
