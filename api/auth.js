import { getRole, isDatabaseConfigured, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'
import { coachFromRequest, countCoaches, createCoach, createCoachToken, findCoach, verifyCoachPassword, readCoachToken, COACH_TERMS_VERSION } from '../server/coach-auth.js'
import { getSessionDays } from '../server/session-settings.js'
import { getSessionProfile, normalizeUsername, validPin, verifyPin } from '../server/profile-auth.js'

const getCookie = (request, name) => { const match = String(request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : null }
const setCookie = (response, name, value, maxAge) => response.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge ? `; Max-Age=${maxAge}` : ''}`)
const clearCookie = (response, name) => response.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!isDatabaseConfigured()) return sendJson(response, 503, { error: 'Databasen är inte konfigurerad.' })

  const action = request.body?.action
  if (action === 'restore') {
    const coachToken = getCookie(request, 'simkoll_coach_session')
    const groupCode = getCookie(request, 'simkoll_group_code')
    const restoredCode = coachToken || groupCode || ''
    const role = getRole(restoredCode)
    if (role === 'coach') { const account = readCoachToken(coachToken); return sendJson(response, 200, { role, accountRole: account?.role || 'coach', code: restoredCode, displayName: account?.name || '' }) }
    if (role === 'swimmer' && await getSessionProfile(request)) return sendJson(response, 200, { role, code: restoredCode })
    return sendJson(response, 200, { role: null })
  }
  if (action === 'logout') { response.setHeader('Set-Cookie', ['simkoll_coach_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0', 'simkoll_group_code=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']); return sendJson(response, 200, { ok: true }) }
  if (action === 'coach-bootstrap-status') {
    return sendJson(response, 200, { available: (await countCoaches()) === 0 })
  }
  if (action === 'coach-bootstrap') {
    const { email, displayName, password, bootstrapToken, acceptedTerms } = request.body || {}
    if (!process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN || bootstrapToken !== process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN) return sendJson(response, 403, { error: 'Bootstrap-koden är inte giltig.' })
    if (await countCoaches() > 0) return sendJson(response, 409, { error: 'Det finns redan ett tränarkonto.' })
    if (acceptedTerms !== true) return sendJson(response, 400, { error: 'Du måste läsa och godkänna tränarvillkoren.' })
    if (!String(email || '').includes('@') || String(password || '').length < 10 || String(displayName || '').trim().length < 2) return sendJson(response, 400, { error: 'Ange namn, e-post och ett lösenord med minst 10 tecken.' })
    const account = await createCoach({ email, displayName, password, role: 'superadmin', status: 'active', termsAccepted: true })
    await writeAuditLog(request, { eventType: 'coach_account_bootstrap', role: 'coach', details: { actorEmail: account.email, actorName: account.display_name, role: account.role } })
    const token = createCoachToken(account, (await getSessionDays('coach')) * 86400)
    setCookie(response, 'simkoll_coach_session', token, (await getSessionDays('coach')) * 86400)
    return sendJson(response, 201, { role: 'coach', accountRole: account.role, code: token, displayName: account.display_name })
  }

  if (action === 'coach-login') {
    const account = await findCoach(request.body?.email || '')
    if (!account || account.status !== 'active' || !(await verifyCoachPassword(request.body?.password || '', account.password_salt, account.password_hash))) {
      await writeAuditLog(request, { eventType: 'coach_login', role: 'coach', status: 'failure', details: { login: 'personal-account', email: String(request.body?.email || '').slice(0, 120) } })
      return sendJson(response, 401, { error: 'E-post eller lösenord stämmer inte.' })
    }
    await writeAuditLog(request, { eventType: 'coach_login', role: 'coach', profileId: null, details: { login: 'personal-account', actorEmail: account.email, actorName: account.display_name, role: account.role } })
    const days = await getSessionDays('coach')
    const token = createCoachToken(account, days * 86400)
    setCookie(response, 'simkoll_coach_session', token, request.body?.remember === false ? undefined : days * 86400)
    return sendJson(response, 200, { role: 'coach', accountRole: account.role, code: token, displayName: account.display_name })
  }

  if (action === 'coach-register') {
    const { email, displayName, password, acceptedTerms } = request.body || {}
    if (!String(email || '').includes('@') || String(password || '').length < 10 || String(displayName || '').trim().length < 2) return sendJson(response, 400, { error: 'Ange namn, e-post och ett lösenord med minst 10 tecken.' })
    if (acceptedTerms !== true) return sendJson(response, 400, { error: 'Du måste läsa och godkänna tränarvillkoren.' })
    if (await findCoach(email)) return sendJson(response, 409, { error: 'Det finns redan ett konto med den e-postadressen.' })
    await createCoach({ email, displayName, password, role: 'coach', status: 'pending', termsAccepted: true })
    await writeAuditLog(request, { eventType: 'coach_account_registration', role: 'coach', details: { email: String(email).slice(0, 120), displayName: String(displayName).slice(0, 80) } })
    return sendJson(response, 201, { pending: true })
  }

  const actor = coachFromRequest(request)
  if (action === 'coach-profile') {
    if (!actor) return sendJson(response, 403, { error: 'Tränarsession saknas.' })
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&select=id,email,display_name,role,status,managed_groups,personal_settings_enabled,personal_settings,linked_profile_id&limit=1`)
    if (!result.ok) throw new Error(`Coach profile lookup failed: ${result.status}`)
    const account = (await result.json())[0]
    if (!account) return sendJson(response, 404, { error: 'Tränarkontot hittades inte.' })
    if (request.body?.update) {
      if (actor.role === 'coach') return sendJson(response, 403, { error: 'Vanliga tränare kan inte ändra konto- eller vyinställningar.' })
      const groups = Array.isArray(request.body.managedGroups) ? [...new Set(request.body.managedGroups.map(String))].slice(0, 50) : []
      const personalSettings = request.body.personalSettings && typeof request.body.personalSettings === 'object' ? request.body.personalSettings : {}
      const save = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ managed_groups: groups, personal_settings_enabled: request.body.personalSettingsEnabled === true, personal_settings: personalSettings }) })
      if (!save.ok) throw new Error(`Coach profile save failed: ${save.status} ${await save.text()}`)
      return sendJson(response, 200, { account: (await save.json())[0] })
    }
    let linkedProfile = null
    if (account.linked_profile_id) {
      const linked = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(account.linked_profile_id)}&select=id,display_name,emoji,training_group,active,approval_status&limit=1`)
      if (linked.ok) {
        const [profile] = await linked.json()
        if (profile?.active && profile?.approval_status === 'approved') linkedProfile = { id: profile.id, displayName: profile.display_name, emoji: profile.emoji, trainingGroup: profile.training_group || null }
      }
    }
    return sendJson(response, 200, { account, linkedProfile })
  }
  if (action === 'coach-link-swimmer-profile' || action === 'coach-unlink-swimmer-profile' || action === 'coach-swimmer-preview') {
    if (!actor || !['head_coach', 'superadmin'].includes(actor.role)) return sendJson(response, 403, { error: 'Endast huvudtränare och superadmin kan koppla och förhandsvisa sin egen simmarprofil.' })
    const accountResult = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&select=id,role,linked_profile_id&limit=1`)
    if (!accountResult.ok) throw new Error(`Coach profile lookup failed: ${accountResult.status}`)
    const [account] = await accountResult.json()
    if (!account || account.role !== actor.role) return sendJson(response, 403, { error: 'Tränarkontot kunde inte verifieras.' })

    if (action === 'coach-unlink-swimmer-profile') {
      const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ linked_profile_id: null }) })
      if (!result.ok) throw new Error(`Coach profile unlink failed: ${result.status}`)
      return sendJson(response, 200, { linkedProfile: null })
    }

    if (action === 'coach-link-swimmer-profile') {
      const username = normalizeUsername(request.body?.username || '')
      const pin = String(request.body?.pin || '')
      if (!/^[a-z0-9._-]{3,24}$/.test(username) || !validPin(pin)) return sendJson(response, 400, { error: 'Ange simmarprofilens användarnamn och fyrsiffriga PIN.' })
      const profileResult = await supabaseRequest(`profiles?username=eq.${encodeURIComponent(username)}&select=id,username,display_name,emoji,training_group,pin_hash,pin_salt,failed_attempts,locked_until,active,approval_status&limit=1`)
      if (!profileResult.ok) throw new Error(`Swimmer profile lookup failed: ${profileResult.status}`)
      const [profile] = await profileResult.json()
      const genericError = 'Användarnamn eller PIN stämmer inte, eller så är profilen inte aktiv.'
      if (!profile || !profile.active || profile.approval_status !== 'approved') return sendJson(response, 401, { error: genericError })
      if (profile.locked_until && new Date(profile.locked_until) > new Date()) return sendJson(response, 429, { error: 'För många försök. Vänta 15 minuter och försök igen.' })
      if (!(await verifyPin(pin, profile.pin_salt, profile.pin_hash))) {
        const attempts = Number(profile.failed_attempts || 0) + 1
        await supabaseRequest(`profiles?id=eq.${encodeURIComponent(profile.id)}`, { method: 'PATCH', body: JSON.stringify({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null }) })
        return sendJson(response, 401, { error: genericError })
      }
      const otherLink = await supabaseRequest(`coach_accounts?linked_profile_id=eq.${encodeURIComponent(profile.id)}&select=id&limit=1`)
      if (!otherLink.ok) throw new Error(`Swimmer profile link lookup failed: ${otherLink.status}`)
      const [existingLink] = await otherLink.json()
      if (existingLink && existingLink.id !== actor.sub) return sendJson(response, 409, { error: 'Den här profilen är redan kopplad till ett tränarkonto.' })
      const saved = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ linked_profile_id: profile.id }) })
      if (!saved.ok) throw new Error(`Coach profile link failed: ${saved.status}`)
      await supabaseRequest(`profiles?id=eq.${encodeURIComponent(profile.id)}`, { method: 'PATCH', body: JSON.stringify({ failed_attempts: 0, locked_until: null }) })
      return sendJson(response, 200, { linkedProfile: { id: profile.id, displayName: profile.display_name, emoji: profile.emoji, trainingGroup: profile.training_group || null } })
    }

    if (!account.linked_profile_id) return sendJson(response, 404, { error: 'Ingen egen simmarprofil är kopplad ännu.' })
    const profileResult = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(account.linked_profile_id)}&active=eq.true&approval_status=eq.approved&select=id,username,display_name,emoji,training_group,primary_stroke,secondary_stroke,is_test_profile&limit=1`)
    if (!profileResult.ok) throw new Error(`Linked swimmer lookup failed: ${profileResult.status}`)
    const [profile] = await profileResult.json()
    if (!profile) return sendJson(response, 404, { error: 'Den kopplade simmarprofilen är inte längre aktiv.' })
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
    const weekCursor = new Date(`${today}T12:00:00Z`)
    weekCursor.setUTCDate(weekCursor.getUTCDate() - ((weekCursor.getUTCDay() + 6) % 7))
    const weekStart = weekCursor.toISOString().slice(0, 10)
    const weekEndCursor = new Date(weekCursor)
    weekEndCursor.setUTCDate(weekEndCursor.getUTCDate() + 7)
    const weekEnd = weekEndCursor.toISOString().slice(0, 10)
    const [pointRows, levelsResult, workoutRows, unlockResult, sessionRows, plannedRows, competitionsResult, chatSettings] = await Promise.all([
      supabaseRequest(`point_events?profile_id=eq.${encodeURIComponent(profile.id)}&select=points,event_type,created_at&order=created_at.desc&limit=1000`),
      supabaseRequest('reward_levels?select=name,emoji,min_points,sort_order&order=min_points.asc'),
      supabaseRequest(`daily_workouts?workout_date=eq.${today}&select=id,workout_date,title,content,note,focus,distance_meters,duration_minutes,time_of_day,target_groups&order=created_at.asc`),
      supabaseRequest(`workout_unlocks?profile_id=eq.${encodeURIComponent(profile.id)}&workout_date=eq.${today}&select=profile_id&limit=1`),
      supabaseRequest(`personal_training_sessions?profile_id=eq.${encodeURIComponent(profile.id)}&session_date=gte.${weekStart}&session_date=lt.${weekEnd}&select=activity_type,session_date,session_slot&order=session_date.asc`),
      supabaseRequest(`planned_training_sessions?profile_id=eq.${encodeURIComponent(profile.id)}&planned_date=gte.${weekStart}&planned_date=lt.${weekEnd}&select=planned_date,session_slot&order=planned_date.asc`),
      supabaseRequest(`competition_calendar?start_date=gte.${today}&select=id,start_date,end_date,title,location,target_groups&order=start_date.asc&limit=10`),
      supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1'),
    ])
    if (![pointRows, levelsResult, workoutRows, unlockResult, sessionRows, plannedRows, competitionsResult].every((item) => item.ok)) throw new Error('Swimmer preview data lookup failed')
    const points = await pointRows.json()
    const totalPoints = points.reduce((sum, item) => sum + Number(item.points || 0), 0)
    const levels = await levelsResult.json()
    const currentLevel = [...levels].reverse().find((item) => totalPoints >= Number(item.min_points)) || levels[0] || null
    const nextLevel = levels.find((item) => Number(item.min_points) > totalPoints) || null
    const groups = [profile.training_group].filter(Boolean)
    const unlocks = (await unlockResult.json()).length > 0
    const workouts = (await workoutRows.json()).filter((item) => !item.target_groups?.length || item.target_groups.includes(profile.training_group))
    const visibleWorkouts = unlocks ? workouts : workouts.map((item) => ({ id: item.id, workout_date: item.workout_date, time_of_day: item.time_of_day, target_groups: item.target_groups, locked: true }))
    const completed = await sessionRows.json()
    const plan = await plannedRows.json()
    const competitions = (await competitionsResult.json()).filter((item) => !item.target_groups?.length || item.target_groups.some((group) => groups.includes(group))).map((item) => ({ startDate: item.start_date, endDate: item.end_date, title: item.title, location: item.location || '' }))
    const appSettings = chatSettings.ok ? (await chatSettings.json())[0]?.setting_value || {} : {}
    return sendJson(response, 200, {
      profile: { id: profile.id, username: profile.username, displayName: profile.display_name, emoji: profile.emoji, trainingGroup: profile.training_group || null, primaryStroke: profile.primary_stroke || null, secondaryStroke: profile.secondary_stroke || null, isTestProfile: Boolean(profile.is_test_profile) },
      points: { total: totalPoints, current: currentLevel ? { name: currentLevel.name, emoji: currentLevel.emoji, minPoints: currentLevel.min_points } : null, next: nextLevel ? { name: nextLevel.name, emoji: nextLevel.emoji, minPoints: nextLevel.min_points, remaining: Number(nextLevel.min_points) - totalPoints } : null },
      workouts: visibleWorkouts.map((item) => ({ date: item.workout_date, title: item.locked ? null : item.title, content: item.locked ? null : item.content, note: item.locked ? '' : item.note || '', focus: item.locked ? '' : item.focus || '', distanceMeters: item.locked ? null : item.distance_meters || null, durationMinutes: item.locked ? null : item.duration_minutes || null, timeOfDay: item.time_of_day || '', locked: Boolean(item.locked) })),
      week: { weekStart, weekEnd, completedPasses: completed.filter((item) => item.session_slot !== 'legacy').length, plannedPasses: plan.length },
      competitions,
      openChatEnabled: appSettings.openChat?.enabled === true,
    })
  }
  if (action === 'coach-list' || action === 'coach-approve' || action === 'coach-set-role') {
    if (!actor || actor.role !== 'superadmin') return sendJson(response, 403, { error: 'Endast superadmin kan hantera tränarkonton.' })
    if (action === 'coach-list') {
      const result = await supabaseRequest('coach_accounts?select=id,email,display_name,role,status,created_at,approved_at,last_login_at&order=created_at.asc&limit=200')
      if (!result.ok) throw new Error(`Coach list failed: ${result.status}`)
      return sendJson(response, 200, { accounts: await result.json() })
    }
    const accountId = String(request.body.accountId || '')
    if (!accountId) return sendJson(response, 400, { error: 'Tränarkonto saknas.' })
    if (action === 'coach-approve') {
      const status = request.body.approved === false ? 'suspended' : 'active'
      if (accountId === actor.sub && status === 'suspended') return sendJson(response, 400, { error: 'Du kan inte stänga av ditt eget superadmin-konto.' })
      const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status, approved_at: status === 'active' ? new Date().toISOString() : null }) })
      if (!result.ok) throw new Error(`Coach approval failed: ${result.status}`)
      await writeAuditLog(request, { eventType: 'coach_account_access_change', role: 'coach', details: { actorName: actor.name, targetAccountId: accountId, status } })
      return sendJson(response, 200, { account: (await result.json())[0] })
    }
    const requestedRole = String(request.body.role || '')
    const role = ['coach', 'head_coach', 'superadmin'].includes(requestedRole) ? requestedRole : 'coach'
    if (accountId === actor.sub && role !== 'superadmin') return sendJson(response, 400, { error: 'Du kan inte ta bort superadmin-behörigheten från ditt eget konto.' })
    const status = request.body.approved === true ? 'active' : undefined
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ role, ...(status ? { status, approved_at: new Date().toISOString() } : {}) }) })
    if (!result.ok) throw new Error(`Coach role update failed: ${result.status}`)
    await writeAuditLog(request, { eventType: 'coach_account_role_change', role: 'coach', details: { actorName: actor.name, targetAccountId: accountId, role } })
    return sendJson(response, 200, { account: (await result.json())[0] })
  }

  const role = getRole(String(request.body?.code || ''))
  if (!role) {
    await writeAuditLog(request, { eventType: 'group_code_verified', status: 'failure', details: { login: 'group-code' } })
    return sendJson(response, 401, { error: 'Koden stämmer inte. Försök igen.' })
  }
  // A group code only opens the profile-login gate. It is not an anonymous
  // swimmer login, so keep this event separate from profile_login in the audit log.
  await writeAuditLog(request, { eventType: 'group_code_verified', role, details: { login: 'group-code', profileLoginRequired: role === 'swimmer' } })
  setCookie(response, 'simkoll_group_code', String(request.body.code), request.body?.remember === false ? undefined : (await getSessionDays(role)) * 86400)
  return sendJson(response, 200, { role })
}
