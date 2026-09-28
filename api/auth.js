import { getRole, isDatabaseConfigured, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'
import { coachFromRequest, countCoaches, createCoach, createCoachToken, findCoach, verifyCoachPassword } from '../server/coach-auth.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!isDatabaseConfigured()) return sendJson(response, 503, { error: 'Databasen är inte konfigurerad.' })

  const action = request.body?.action
  if (action === 'coach-bootstrap-status') {
    return sendJson(response, 200, { available: (await countCoaches()) === 0 })
  }
  if (action === 'coach-bootstrap') {
    const { email, displayName, password, bootstrapToken } = request.body || {}
    if (!process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN || bootstrapToken !== process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN) return sendJson(response, 403, { error: 'Bootstrap-koden är inte giltig.' })
    if (await countCoaches() > 0) return sendJson(response, 409, { error: 'Det finns redan ett tränarkonto.' })
    if (!String(email || '').includes('@') || String(password || '').length < 10 || String(displayName || '').trim().length < 2) return sendJson(response, 400, { error: 'Ange namn, e-post och ett lösenord med minst 10 tecken.' })
    const account = await createCoach({ email, displayName, password, role: 'superadmin', status: 'active' })
    await writeAuditLog(request, { eventType: 'coach_account_bootstrap', role: 'coach', details: { actorEmail: account.email, actorName: account.display_name, role: account.role } })
    return sendJson(response, 201, { role: 'coach', accountRole: account.role, code: createCoachToken(account), displayName: account.display_name })
  }

  if (action === 'coach-login') {
    const account = await findCoach(request.body?.email || '')
    if (!account || account.status !== 'active' || !(await verifyCoachPassword(request.body?.password || '', account.password_salt, account.password_hash))) {
      await writeAuditLog(request, { eventType: 'coach_login', role: 'coach', status: 'failure', details: { login: 'personal-account', email: String(request.body?.email || '').slice(0, 120) } })
      return sendJson(response, 401, { error: 'E-post eller lösenord stämmer inte.' })
    }
    await writeAuditLog(request, { eventType: 'coach_login', role: 'coach', profileId: null, details: { login: 'personal-account', actorEmail: account.email, actorName: account.display_name, role: account.role } })
    return sendJson(response, 200, { role: 'coach', accountRole: account.role, code: createCoachToken(account), displayName: account.display_name })
  }

  if (action === 'coach-register') {
    const { email, displayName, password } = request.body || {}
    if (!String(email || '').includes('@') || String(password || '').length < 10 || String(displayName || '').trim().length < 2) return sendJson(response, 400, { error: 'Ange namn, e-post och ett lösenord med minst 10 tecken.' })
    if (await findCoach(email)) return sendJson(response, 409, { error: 'Det finns redan ett konto med den e-postadressen.' })
    await createCoach({ email, displayName, password, role: 'coach', status: 'pending' })
    await writeAuditLog(request, { eventType: 'coach_account_registration', role: 'coach', details: { email: String(email).slice(0, 120), displayName: String(displayName).slice(0, 80) } })
    return sendJson(response, 201, { pending: true })
  }

  const actor = coachFromRequest(request)
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
      const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status, approved_at: status === 'active' ? new Date().toISOString() : null }) })
      if (!result.ok) throw new Error(`Coach approval failed: ${result.status}`)
      await writeAuditLog(request, { eventType: 'coach_account_access_change', role: 'coach', details: { actorName: actor.name, targetAccountId: accountId, status } })
      return sendJson(response, 200, { account: (await result.json())[0] })
    }
    const role = request.body.role === 'superadmin' ? 'superadmin' : 'coach'
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ role }) })
    if (!result.ok) throw new Error(`Coach role update failed: ${result.status}`)
    await writeAuditLog(request, { eventType: 'coach_account_role_change', role: 'coach', details: { actorName: actor.name, targetAccountId: accountId, role } })
    return sendJson(response, 200, { account: (await result.json())[0] })
  }

  const role = getRole(String(request.body?.code || ''))
  if (!role) {
    await writeAuditLog(request, { eventType: 'group_login', status: 'failure', details: { login: 'group-code' } })
    return sendJson(response, 401, { error: 'Koden stämmer inte. Försök igen.' })
  }
  await writeAuditLog(request, { eventType: 'group_login', role, details: { login: 'group-code' } })
  return sendJson(response, 200, { role })
}
