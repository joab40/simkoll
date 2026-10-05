import { getRole, isDatabaseConfigured, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'
import { coachFromRequest, countCoaches, createCoach, createCoachToken, findCoach, verifyCoachPassword, readCoachToken, COACH_TERMS_VERSION } from '../server/coach-auth.js'
import { getSessionDays } from '../server/session-settings.js'
import { getSessionProfile } from '../server/profile-auth.js'

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
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&select=id,email,display_name,role,status,managed_groups,personal_settings_enabled,personal_settings&limit=1`)
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
    return sendJson(response, 200, { account })
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
