import { randomInt } from 'node:crypto'
import { getRole, isAiEnabled, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAiUsage, writeAuditLog } from '../server/audit.js'
import {
  clearSessionCookie, createSession, deleteCurrentSession, getSessionProfile, hashPin,
  hashToken, normalizeUsername, publicProfile, touchProfileActivity, validPin, validUsername, verifyPin, awardPoints,
} from '../server/profile-auth.js'

async function runTempusCron() {
  const profilesResult = await supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&tempus_id=not.is.null&select=id,tempus_id')
  if (!profilesResult.ok) throw new Error('Tempus profiles lookup failed')
  let synced = 0; let personalBests = 0
  for (const profile of await profilesResult.json()) {
    const existingResult = await supabaseRequest(`competition_results?profile_id=eq.${profile.id}&select=event,pool,result_time&order=result_time.asc&limit=10000`)
    if (!existingResult.ok) continue
    const best = new Map(); (await existingResult.json()).forEach((item) => { if (Number.isFinite(item.result_time)) { const key = `${item.event}|${item.pool || ''}`; best.set(key, Math.min(best.get(key) ?? Infinity, item.result_time)) } })
    const page = await fetch(`https://www.tempusopen.se/swimmers/${profile.tempus_id}/swimming?best_time_only=0&from_date=2000-01-01&to_date=${new Date().toISOString().slice(0, 10)}`)
    if (!page.ok) continue
    const match = (await page.text()).match(/data-page="([^\"]+)"/); if (!match) continue
    let data; try { data = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')) } catch { continue }
    const all = [...(data.props?.results_short?.data || []), ...(data.props?.results_long?.data || [])]
    const rows = all.filter((item) => item.event_name && item.result_date && item.swim_time).slice(0, 500).map((item) => ({ profile_id: profile.id, event: item.event_name, competition_name: item.competition_name || null, pool: item.pool_type_name || null, result_date: item.result_date, swim_time: item.swim_time, result_time: Number.isFinite(Number(item.result_time)) ? Number(item.result_time) : null, aqua_points: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, synced_at: new Date().toISOString() }))
    if (!rows.length) continue
    const improved = rows.filter((row) => { const previous = best.get(`${row.event}|${row.pool || ''}`); return Number.isFinite(row.result_time) && previous != null && row.result_time < previous })
    const upsert = await supabaseRequest('competition_results?on_conflict=profile_id,event,pool,result_date,swim_time,competition_name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) })
    if (!upsert.ok) continue
    synced += rows.length
    for (const row of improved) { await awardPoints(profile.id, 'personal_best', 3, `${row.event}|${row.pool || ''}|${row.result_date}|${row.swim_time}`); personalBests += 1 }
  }
  return { synced, personalBests }
}

const groupRole = (request) => getRole(String(request.headers['x-simkoll-code'] || ''))
const publicCoachNote = (item) => ({ id: item.id, profileId: item.profile_id, noteDate: item.note_date, content: item.content, createdAt: item.created_at, updatedAt: item.updated_at })

async function polishSwimmerNote(request, content, noteDate) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { text: content, usedAi: false }
  const prompt = `Du är en erfaren simtränarassistent. Förbättra en kort intern tränaranteckning om en ungdoms- eller juniorsimmare på svenska. Gör texten tydlig, saklig och respektfull.
- Behåll alla konkreta observationer och fakta.
- Får gärna göra språket mer strukturerat, men hitta inte på orsaker, diagnoser, resultat eller egenskaper.
- Skriv inte medicinska slutsatser. Använd “kan vara värt att följa upp” om något behöver undersökas.
- Behåll en varm och professionell ton. Returnera endast JSON med nyckeln text.

Datum: ${noteDate}
Tränarens anteckning:
${String(content).slice(0, 3000)}`
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: 500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'swimmer_note', model, role: 'coach', response: null, status: 'failure', error: `HTTP ${result.status}` }); return { text: content, usedAi: false } }
    const payload = await result.json(), raw = String(payload.choices?.[0]?.message?.content || '{}')
    await writeAiUsage(request, { feature: 'swimmer_note', model, role: 'coach', response: payload })
    const first = raw.indexOf('{'), last = raw.lastIndexOf('}'), parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
    const text = String(parsed.text || '').trim().slice(0, 3000)
    return { text: text || content, usedAi: Boolean(text) }
  } catch (error) {
    console.warn('Swimmer note AI fallback:', error.message)
    return { text: content, usedAi: false }
  }
}
const BACKUP_TABLES = ['profiles', 'responses', 'daily_workouts', 'training_plans', 'competition_calendar', 'training_groups', 'profile_daily_activity', 'workout_unlocks', 'season_swim_goals', 'cross_training_goals', 'personal_training_sessions', 'training_programs', 'program_assignments', 'program_goals', 'development_goals', 'goal_updates', 'development_talks', 'group_pep', 'private_messages', 'community_posts', 'kudos', 'point_events', 'reward_levels', 'artifact_catalog', 'profile_artifacts', 'game_scores', 'competition_results', 'session_attendance', 'app_feedback', 'app_settings', 'ai_insights', 'coach_activity_notes', 'coach_swimmer_notes']

async function findProfile(username) {
  const result = await supabaseRequest(`profiles?username=eq.${encodeURIComponent(username)}&select=*&limit=1`)
  if (!result.ok) throw new Error(`Profile lookup failed: ${result.status} ${await result.text()}`)
  return (await result.json())[0] || null
}

async function updateProfile(id, values) {
  const result = await supabaseRequest(`profiles?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(values),
  })
  if (!result.ok) throw new Error(`Profile update failed: ${result.status} ${await result.text()}`)
  return (await result.json())[0]
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET' && request.query?.cron === 'tempus') {
      const secret = process.env.CRON_SECRET
      if (secret && request.headers.authorization !== `Bearer ${secret}`) return sendJson(response, 401, { error: 'Unauthorized' })
      return sendJson(response, 200, { ok: true, ...(await runTempusCron()) })
    }
    if (request.method === 'GET') {
      if (groupRole(request) === 'coach') {
        if (request.query?.backup === 'export') {
          const tables = {}, warnings = []
          for (const table of BACKUP_TABLES) {
            const result = await supabaseRequest(`${table}?select=*&limit=100000`)
            if (!result.ok) { warnings.push(table); continue }
            tables[table] = await result.json()
          }
          const counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]))
          return sendJson(response, 200, { format: 'simkoll-backup', formatVersion: 1, exportedAt: new Date().toISOString(), tables, counts, warnings })
        }
        if (request.query?.audit === 'true') {
          const [logsResult, usageResult] = await Promise.all([
            supabaseRequest('audit_logs?select=id,event_type,role,status,details,created_at&order=created_at.desc&limit=300'),
            supabaseRequest('ai_usage_logs?select=id,feature,model,role,status,prompt_tokens,completion_tokens,total_tokens,error_message,created_at&order=created_at.desc&limit=300'),
          ])
          if (!logsResult.ok || !usageResult.ok) throw new Error('Audit lookup failed')
          const logs = await logsResult.json(), aiUsage = await usageResult.json()
          const totals = aiUsage.reduce((sum, item) => ({ calls: sum.calls + 1, successful: sum.successful + (item.status === 'success' ? 1 : 0), promptTokens: sum.promptTokens + Number(item.prompt_tokens || 0), completionTokens: sum.completionTokens + Number(item.completion_tokens || 0), totalTokens: sum.totalTokens + Number(item.total_tokens || 0) }), { calls: 0, successful: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
          return sendJson(response, 200, { logs, aiUsage, totals })
        }
        if (request.query?.notes === 'true') {
          const profileId = String(request.query.profileId || '')
          if (!profileId) return sendJson(response, 400, { error: 'Simmare saknas.' })
          const result = await supabaseRequest(`coach_swimmer_notes?profile_id=eq.${profileId}&select=*&order=note_date.desc,updated_at.desc&limit=100`)
          if (!result.ok) throw new Error(`Swimmer notes GET failed: ${result.status} ${await result.text()}`)
          return sendJson(response, 200, { notes: (await result.json()).map(publicCoachNote) })
        }
        if (request.query?.groups === 'true') {
          const result = await supabaseRequest('training_groups?select=*&order=active.desc,name.asc')
          if (!result.ok) throw new Error(`Training groups GET failed: ${result.status} ${await result.text()}`)
          return sendJson(response, 200, { groups: await result.json() })
        }
        if (request.query?.attendance === 'true') {
          const date = String(request.query.date || '').slice(0, 10)
          const slot = ['morning_swim', 'afternoon_swim'].includes(request.query.slot) ? request.query.slot : null
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(response, 400, { error: 'Ogiltigt närvarodatum.' })
          const result = await supabaseRequest(`session_attendance?attendance_date=eq.${date}${slot ? `&session_slot=eq.${slot}` : ''}&select=profile_id,present,session_slot,marked_at`)
          if (!result.ok) throw new Error(`Attendance GET failed: ${result.status} ${await result.text()}`)
          return sendJson(response, 200, { attendance: await result.json() })
        }
        if (request.query?.tempusResults === 'true') {
          const result = await supabaseRequest('competition_results?select=*&order=result_date.desc&limit=10000')
          if (!result.ok) throw new Error(`Competition results GET failed: ${result.status} ${await result.text()}`)
          return sendJson(response, 200, { results: await result.json() })
        }
        const result = await supabaseRequest('profiles?select=id,username,display_name,emoji,training_group,tempus_id,active,approval_status,is_test_profile,ai_analysis_status,created_at&active=eq.true&order=display_name.asc')
        if (!result.ok) throw new Error(`Profiles GET failed: ${result.status} ${await result.text()}`)
        const profiles = (await result.json()).map(publicProfile)
        return sendJson(response, 200, { profiles: profiles.filter((item) => item.approvalStatus === 'approved'), pendingProfiles: profiles.filter((item) => item.approvalStatus === 'pending') })
      }
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 401, { error: 'Inte inloggad.' })
      if (request.query?.competitionResults === 'true') {
        const result = await supabaseRequest(`competition_results?profile_id=eq.${profile.id}&select=*&order=result_date.desc&limit=1000`)
        if (!result.ok) throw new Error(`Competition results GET failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { results: await result.json() })
      }
      if (request.query?.directory === 'true') {
        const result = await supabaseRequest(`profiles?id=neq.${profile.id}&active=eq.true&select=id,display_name,emoji&order=display_name.asc`)
        if (!result.ok) throw new Error(`Directory GET failed: ${result.status}`)
        return sendJson(response, 200, { profiles: (await result.json()).map((item) => ({ id: item.id, displayName: item.display_name, emoji: item.emoji })) })
      }
      return sendJson(response, 200, { profile: publicProfile(profile) })
    }

    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    const action = request.body?.action

    if (action === 'backup-import') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan importera en backup.' })
      const backup = request.body?.backup
      if (!backup || backup.format !== 'simkoll-backup' || backup.formatVersion !== 1 || !backup.tables || typeof backup.tables !== 'object') return sendJson(response, 400, { error: 'Filen är inte en giltig Simkoll-backup.' })
      const imported = {}, warnings = []
      for (const table of BACKUP_TABLES) {
        const rows = Array.isArray(backup.tables[table]) ? backup.tables[table].filter((row) => row && typeof row === 'object').slice(0, 100000) : []
        if (!rows.length) continue
        const result = await supabaseRequest(`${table}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) })
        if (!result.ok) warnings.push(table)
        else imported[table] = rows.length
      }
      return sendJson(response, 200, { imported, warnings })
    }

    if (action === 'polish-swimmer-note') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan förbättra observationer.' })
      if (!(await isAiEnabled())) return sendJson(response, 403, { error: 'AI-stöd är avstängt i webapp-inställningarna.' })
      const content = String(request.body.content || '').trim(), noteDate = String(request.body.noteDate || '')
      if (!content || content.length > 3000 || !/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) return sendJson(response, 400, { error: 'Skriv en anteckning och välj datum först.' })
      return sendJson(response, 200, await polishSwimmerNote(request, content, noteDate))
    }

    if (action === 'save-swimmer-note' || action === 'update-swimmer-note') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan skriva observationer.' })
      const profileId = String(request.body.profileId || ''), noteDate = String(request.body.noteDate || ''), content = String(request.body.content || '').trim(), noteId = String(request.body.noteId || '')
      if (!profileId || !/^\d{4}-\d{2}-\d{2}$/.test(noteDate) || !content || content.length > 3000) return sendJson(response, 400, { error: 'Kontrollera datum och anteckning.' })
      const endpoint = action === 'update-swimmer-note' ? `coach_swimmer_notes?id=eq.${noteId}&profile_id=eq.${profileId}` : 'coach_swimmer_notes'
      if (action === 'update-swimmer-note' && !noteId) return sendJson(response, 400, { error: 'Anteckning saknas.' })
      const result = await supabaseRequest(endpoint, { method: action === 'update-swimmer-note' ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ profile_id: profileId, note_date: noteDate, content, updated_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Swimmer note save failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { note: publicCoachNote((await result.json())[0]) })
    }

    if (action === 'delete-swimmer-note') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan radera observationer.' })
      const profileId = String(request.body.profileId || ''), noteId = String(request.body.noteId || '')
      if (!profileId || !noteId) return sendJson(response, 400, { error: 'Anteckning saknas.' })
      const result = await supabaseRequest(`coach_swimmer_notes?id=eq.${noteId}&profile_id=eq.${profileId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      if (!result.ok) throw new Error(`Swimmer note delete failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'set-attendance') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan registrera närvaro.' })
      const profileId = String(request.body.profileId || '')
      const date = String(request.body.date || '').slice(0, 10)
      const slot = String(request.body.slot || '')
      const present = request.body.present === true
      if (!profileId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['morning_swim', 'afternoon_swim'].includes(slot)) return sendJson(response, 400, { error: 'Profil, datum eller simpass saknas.' })
      const result = await supabaseRequest('session_attendance?on_conflict=profile_id,attendance_date,session_slot', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ profile_id: profileId, attendance_date: date, session_slot: slot, present, marked_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error(`Attendance update failed: ${result.status} ${await result.text()}`)
      if (present) {
        const existing = await supabaseRequest(`personal_training_sessions?profile_id=eq.${profileId}&session_date=eq.${date}&session_slot=eq.${slot}&select=id&limit=1`)
        if (existing.ok && !(await existing.json()).length) await supabaseRequest('personal_training_sessions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ profile_id: profileId, activity_type: 'swim', session_slot: slot, session_date: date, source: 'checkin' }) })
      }
      return sendJson(response, 200, { attendance: (await result.json())[0] || null })
    }

    if (action === 'create') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs för att skapa en profil.' })
      const username = normalizeUsername(request.body.username)
      const displayName = String(request.body.displayName || '').trim()
      const emoji = String(request.body.emoji || '🏊').slice(0, 16)
      const pin = String(request.body.pin || '')
      if (!validUsername(username)) return sendJson(response, 400, { error: 'Användarnamnet behöver vara 3–24 tecken: bokstäver, siffror, punkt, streck eller understreck.' })
      if (!displayName || displayName.length > 40) return sendJson(response, 400, { error: 'Välj ett namn med högst 40 tecken.' })
      if (!validPin(pin)) return sendJson(response, 400, { error: 'PIN-koden ska bestå av fyra siffror.' })
      const existing = await findProfile(username)
      if (existing) return sendJson(response, 409, { error: 'Användarnamnet är redan upptaget.' })
      const pinData = await hashPin(pin)
      const result = await supabaseRequest('profiles', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ username, display_name: displayName, emoji, pin_hash: pinData.hash, pin_salt: pinData.salt, approval_status: 'pending' }),
      })
      if (!result.ok) throw new Error(`Profile insert failed: ${result.status} ${await result.text()}`)
      const [profile] = await result.json()
      return sendJson(response, 202, { pending: true })
    }

    if (action === 'login') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs för att logga in.' })
      const username = normalizeUsername(request.body.username)
      const pin = String(request.body.pin || '')
      const profile = await findProfile(username)
      const genericError = { error: 'Fel användarnamn eller PIN-kod.' }
      if (!profile || !profile.active) return sendJson(response, 401, genericError)
      if (profile.locked_until && new Date(profile.locked_until) > new Date()) return sendJson(response, 429, { error: 'För många försök. Vänta 15 minuter och försök igen.' })
      if (!validPin(pin) || !(await verifyPin(pin, profile.pin_salt, profile.pin_hash))) {
        const attempts = profile.failed_attempts + 1
        await updateProfile(profile.id, { failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null })
        return sendJson(response, 401, genericError)
      }
      await updateProfile(profile.id, { failed_attempts: 0, locked_until: null })
      if (profile.approval_status === 'pending') return sendJson(response, 403, { error: 'Din profil väntar på godkännande från en tränare.' })
      if (profile.approval_status === 'rejected') return sendJson(response, 403, { error: 'Profilen har inte godkänts. Prata med en tränare.' })
      await createSession(response, profile.id)
      await touchProfileActivity(profile.id)
      await writeAuditLog(request, { eventType: 'profile_login', role: 'swimmer', profileId: profile.id, details: { alias: profile.display_name || profile.username } })
      return sendJson(response, 200, { profile: publicProfile(profile) })
    }

    if (action === 'logout') {
      await deleteCurrentSession(request)
      clearSessionCookie(response)
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'update-profile') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 403, { error: 'Endast simmaren kan ändra sin profil.' })
      const sessionProfile = await getSessionProfile(request)
      const displayName = String(request.body.displayName || '').trim()
      const emoji = String(request.body.emoji || '').trim().slice(0, 16)
      if (!sessionProfile) return sendJson(response, 401, { error: 'Profilen är inte längre inloggad.' })
      if (!displayName || displayName.length > 40) return sendJson(response, 400, { error: 'Välj ett namn med högst 40 tecken.' })
      if (!emoji || emoji.length > 16) return sendJson(response, 400, { error: 'Välj en emoji.' })
      const updated = await updateProfile(sessionProfile.id, { display_name: displayName, emoji })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-test-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra testprofilstatus.' })
      const profileId = String(request.body.profileId || '')
      if (!profileId) return sendJson(response, 400, { error: 'Profil saknas.' })
      const updated = await updateProfile(profileId, { is_test_profile: request.body.isTestProfile === true })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-training-group') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra träningsgrupp.' })
      const profileId = String(request.body.profileId || '')
      const trainingGroup = request.body.trainingGroup ? String(request.body.trainingGroup) : null
      if (!profileId) return sendJson(response, 400, { error: 'Profil saknas.' })
      if (trainingGroup) {
        const groupResult = await supabaseRequest(`training_groups?id=eq.${encodeURIComponent(trainingGroup)}&active=eq.true&select=id&limit=1`)
        if (!groupResult.ok || !(await groupResult.json()).length) return sendJson(response, 400, { error: 'Ogiltig eller arkiverad träningsgrupp.' })
      }
      const updated = await updateProfile(profileId, { training_group: trainingGroup })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'create-group') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan skapa grupper.' })
      const name = String(request.body.name || '').trim()
      if (!name || name.length > 80) return sendJson(response, 400, { error: 'Gruppnamnet måste vara 1–80 tecken.' })
      const id = String(request.body.id || name).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
      if (!id) return sendJson(response, 400, { error: 'Gruppnamnet kunde inte användas.' })
      const result = await supabaseRequest('training_groups', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id, name, active: true }) })
      if (!result.ok) {
        if (result.status === 409) return sendJson(response, 409, { error: 'En grupp med det namnet finns redan.' })
        throw new Error(`Training group insert failed: ${result.status} ${await result.text()}`)
      }
      return sendJson(response, 201, { group: (await result.json())[0] })
    }

    if (action === 'update-group') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra grupper.' })
      const id = String(request.body.id || '').trim()
      const name = String(request.body.name || '').trim()
      if (!id || !name || name.length > 80) return sendJson(response, 400, { error: 'Grupp och namn saknas.' })
      const updated = await supabaseRequest(`training_groups?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, updated_at: new Date().toISOString() }) })
      if (!updated.ok) throw new Error(`Training group update failed: ${updated.status} ${await updated.text()}`)
      return sendJson(response, 200, { group: (await updated.json())[0] || null })
    }

    if (action === 'archive-group') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan arkivera grupper.' })
      const id = String(request.body.id || '').trim()
      if (!id) return sendJson(response, 400, { error: 'Grupp saknas.' })
      const updated = await supabaseRequest(`training_groups?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }) })
      if (!updated.ok) throw new Error(`Training group archive failed: ${updated.status} ${await updated.text()}`)
      return sendJson(response, 200, { group: (await updated.json())[0] || null })
    }

    if (action === 'set-ai-analysis-status') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra AI-analysens status.' })
      const profileId = String(request.body.profileId || '')
      const status = String(request.body.status || '')
      if (!profileId || !['not_requested', 'pending', 'approved', 'revoked'].includes(status)) return sendJson(response, 400, { error: 'Ogiltig AI-status.' })
      const updated = await updateProfile(profileId, { ai_analysis_status: status })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-tempus-id') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra Tempus-ID.' })
      const profileId = String(request.body.profileId || '')
      const rawId = String(request.body.tempusId || '').trim()
      if (!profileId || (rawId && !/^\d{1,12}$/.test(rawId))) return sendJson(response, 400, { error: 'Tempus-ID ska vara ett numeriskt ID.' })
      const updated = await updateProfile(profileId, { tempus_id: rawId || null })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'get-tempus-results') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan hämta Tempus-resultat.' })
      const tempusId = String(request.body.tempusId || '').trim()
      if (!/^\d{1,12}$/.test(tempusId)) return sendJson(response, 400, { error: 'Ogiltigt Tempus-ID.' })
      const to = new Date()
      const params = new URLSearchParams({ best_time_only: '0', from_date: '2000-01-01', to_date: to.toISOString().slice(0, 10) })
      const page = await fetch(`https://www.tempusopen.se/swimmers/${tempusId}/swimming?${params}`)
      if (!page.ok) return sendJson(response, 502, { error: 'Tempus Open kunde inte hämtas just nu.' })
      const html = await page.text()
      const match = html.match(/data-page="([^\"]+)"/)
      if (!match) return sendJson(response, 502, { error: 'Tempus-resultaten kunde inte läsas.' })
      const decoded = match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')
      let pageData
      try { pageData = JSON.parse(decoded) } catch { return sendJson(response, 502, { error: 'Tempus-resultaten hade ett oväntat format.' }) }
      const swimmer = pageData.props?.swimmer || {}
      const byEvent = new Map()
      const allResults = [...(pageData.props?.results_short?.data || []), ...(pageData.props?.results_long?.data || [])]
      for (const item of allResults) {
        const pool = item.pool_type_name || ''
        const result = { event: item.event_name || '', date: item.result_date || '', time: item.swim_time || '', aquaPoints: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, pool, timeValue: Number(item.result_time) }
        if (!result.event || !result.date || !result.time) continue
        const key = `${result.event}|${result.pool}`
        const previous = byEvent.get(key)
        if (!previous || (Number.isFinite(result.timeValue) && result.timeValue < previous.timeValue)) byEvent.set(key, result)
      }
      const results = [...byEvent.values()].sort((a, b) => a.event.localeCompare(b.event, 'sv') || a.pool.localeCompare(b.pool, 'sv')).map(({ timeValue, ...result }) => result).slice(0, 100)
      const historyMap = new Map()
      for (const item of allResults) {
        const date = String(item.result_date || '')
        if (!item.event_name || !item.swim_time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
        const key = `${item.event_name}|${item.pool_type_name || ''}`
        if (!historyMap.has(key)) historyMap.set(key, { event: item.event_name, pool: item.pool_type_name || '', items: [] })
        historyMap.get(key).items.push({ date, time: item.swim_time, aquaPoints: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null })
      }
      const history = [...historyMap.values()].map((group) => ({ ...group, items: group.items.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => a.event.localeCompare(b.event, 'sv') || a.pool.localeCompare(b.pool, 'sv'))
      return sendJson(response, 200, { swimmer: { name: swimmer.name || '', license: swimmer.license || '', club: swimmer.club_name || '' }, results, history })
    }

    if (action === 'sync-tempus-results') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan synka Tempus-resultat.' })
      const requested = request.body.profileId ? [String(request.body.profileId)] : null
      const profilesResult = await supabaseRequest(`profiles?active=eq.true&approval_status=eq.approved&tempus_id=not.is.null&select=id,tempus_id${requested ? `&id=in.(${requested.join(',')})` : ''}`)
      if (!profilesResult.ok) throw new Error(`Tempus profiles lookup failed: ${profilesResult.status}`)
      let synced = 0, attempted = 0, failures = []
      for (const profile of await profilesResult.json()) {
        const to = new Date()
        const params = new URLSearchParams({ best_time_only: '0', from_date: '2000-01-01', to_date: to.toISOString().slice(0, 10) })
        const page = await fetch(`https://www.tempusopen.se/swimmers/${profile.tempus_id}/swimming?${params}`)
        if (!page.ok) continue
        const html = await page.text(), match = html.match(/data-page="([^\"]+)"/)
        if (!match) continue
        let pageData
        try { pageData = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')) } catch { continue }
        const all = [...(pageData.props?.results_short?.data || []), ...(pageData.props?.results_long?.data || [])]
        const rows = all.filter((item) => item.event_name && item.result_date && item.swim_time).sort((a, b) => String(b.result_date).localeCompare(String(a.result_date))).slice(0, 500).map((item) => ({ profile_id: profile.id, event: item.event_name, competition_name: item.competition_name || null, pool: item.pool_type_name || null, result_date: item.result_date, swim_time: item.swim_time, result_time: Number.isFinite(Number(item.result_time)) ? Number(item.result_time) : null, aqua_points: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, synced_at: new Date().toISOString() }))
        attempted += rows.length
        if (rows.length) {
          const existingResult = await supabaseRequest(`competition_results?profile_id=eq.${profile.id}&select=event,pool,result_time&limit=10000`)
          const best = new Map()
          if (existingResult.ok) (await existingResult.json()).forEach((item) => { if (Number.isFinite(item.result_time)) { const key = `${item.event}|${item.pool || ''}`; best.set(key, Math.min(best.get(key) ?? Infinity, item.result_time)) } })
          const improved = rows.filter((row) => { const previous = best.get(`${row.event}|${row.pool || ''}`); return Number.isFinite(row.result_time) && previous != null && row.result_time < previous })
          const upsert = await supabaseRequest('competition_results?on_conflict=profile_id,event,pool,result_date,swim_time,competition_name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); if (upsert.ok) { synced += rows.length; for (const row of improved) await awardPoints(profile.id, 'personal_best', 3, `${row.event}|${row.pool || ''}|${row.result_date}|${row.swim_time}`) } else failures.push(`${profile.id}: ${upsert.status} ${(await upsert.text()).slice(0, 180)}`)
        }
      }
      return sendJson(response, 200, { synced, attempted, failures })
    }

    if (action === 'delete-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ta bort profiler.' })
      const profileId = String(request.body.profileId || '')
      if (!profileId) return sendJson(response, 400, { error: 'Profil saknas.' })
      const result = await supabaseRequest(`profiles?id=eq.${profileId}`, { method: 'DELETE' })
      if (result.ok) return sendJson(response, 200, { ok: true })
      // Äldre profiler kan ha svar, poäng eller meddelanden som hindrar fysisk radering.
      // Inaktivering ger samma synliga resultat utan att förlora historiken.
      const archived = await updateProfile(profileId, { active: false, approval_status: 'rejected' })
      return sendJson(response, 200, { ok: true, archived: Boolean(archived) })
    }

    if (action === 'approve-profile' || action === 'reject-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan granska profiler.' })
      const profileId = String(request.body.profileId || '')
      const result = await supabaseRequest(`profiles?id=eq.${profileId}&approval_status=eq.pending`, action === 'approve-profile'
        ? { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ approval_status: 'approved' }) }
        : { method: 'DELETE', headers: { Prefer: 'return=representation' } })
      if (!result.ok) throw new Error(`Profile approval failed: ${result.status} ${await result.text()}`)
      if (!(await result.json()).length) return sendJson(response, 409, { error: 'Profilen är redan granskad.' })
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'create-reset') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan återställa en PIN-kod.' })
      const profileId = String(request.body.profileId || '')
      const resetCode = String(randomInt(10000000, 100000000))
      await supabaseRequest(`profile_reset_tokens?profile_id=eq.${profileId}&used_at=is.null`, { method: 'DELETE' })
      const result = await supabaseRequest('profile_reset_tokens', {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileId, token_hash: hashToken(resetCode), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      })
      if (!result.ok) throw new Error(`Reset insert failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 201, { resetCode, expiresInMinutes: 30 })
    }

    if (action === 'reset-pin') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs.' })
      const username = normalizeUsername(request.body.username)
      const resetCode = String(request.body.resetCode || '').replace(/\s/g, '')
      const newPin = String(request.body.newPin || '')
      if (!validPin(newPin)) return sendJson(response, 400, { error: 'Den nya PIN-koden ska bestå av fyra siffror.' })
      const profile = await findProfile(username)
      if (!profile) return sendJson(response, 400, { error: 'Återställningskoden är inte giltig.' })
      const tokenResult = await supabaseRequest(`profile_reset_tokens?profile_id=eq.${profile.id}&token_hash=eq.${hashToken(resetCode)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`)
      if (!tokenResult.ok) throw new Error(`Reset lookup failed: ${tokenResult.status}`)
      const [token] = await tokenResult.json()
      if (!token) return sendJson(response, 400, { error: 'Återställningskoden är inte giltig eller har gått ut.' })
      const pinData = await hashPin(newPin)
      await updateProfile(profile.id, { pin_hash: pinData.hash, pin_salt: pinData.salt, failed_attempts: 0, locked_until: null })
      await supabaseRequest(`profile_reset_tokens?id=eq.${token.id}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) })
      await supabaseRequest(`profile_sessions?profile_id=eq.${profile.id}`, { method: 'DELETE' })
      return sendJson(response, 200, { ok: true })
    }

    return sendJson(response, 400, { error: 'Okänd åtgärd.' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Något gick fel. Försök igen.' })
  }
}
