import { getRole, isDatabaseConfigured, sendJson } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'
import { countCoaches, createCoach, createCoachToken, findCoach, verifyCoachPassword } from '../server/coach-auth.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!isDatabaseConfigured()) return sendJson(response, 503, { error: 'Databasen är inte konfigurerad.' })

  const action = request.body?.action
  if (action === 'coach-bootstrap') {
    const { email, displayName, password, bootstrapToken } = request.body || {}
    if (!process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN || bootstrapToken !== process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN) return sendJson(response, 403, { error: 'Bootstrap-koden är inte giltig.' })
    if (await countCoaches() > 0) return sendJson(response, 409, { error: 'Det finns redan ett tränarkonto.' })
    if (!String(email || '').includes('@') || String(password || '').length < 12 || String(displayName || '').trim().length < 2) return sendJson(response, 400, { error: 'Ange namn, e-post och ett lösenord med minst 12 tecken.' })
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

  const role = getRole(String(request.body?.code || ''))
  if (!role) {
    await writeAuditLog(request, { eventType: 'group_login', status: 'failure', details: { login: 'group-code' } })
    return sendJson(response, 401, { error: 'Koden stämmer inte. Försök igen.' })
  }
  await writeAuditLog(request, { eventType: 'group_login', role, details: { login: 'group-code' } })
  return sendJson(response, 200, { role })
}
