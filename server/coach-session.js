import { readCoachToken } from './coach-auth.js'
import { sendJson, supabaseRequest } from './supabase.js'

// Runs before every API handler. Unlike signature-only authentication, this
// rejects old sessions on every instance immediately after a password reset.
export async function guardCoachSession(request, response) {
  let token = String(request.headers?.['x-simkoll-code'] || '')
  if (request.body?.action === 'restore') {
    const cookie = String(request.headers?.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('simkoll_coach_session='))
    if (cookie) { try { token = decodeURIComponent(cookie.slice('simkoll_coach_session='.length)) } catch { token = 'coach.invalid' } }
  }
  if (!token.startsWith('coach.') || request.body?.action === 'logout') return true
  const actor = readCoachToken(token)
  const version = actor?.ver ?? 0
  if (!actor?.sub || !['coach', 'head_coach', 'superadmin'].includes(actor.role) || !Number.isSafeInteger(version) || version < 0) {
    sendJson(response, 401, { error: 'Tränarsessionen är inte giltig. Logga in igen.' }); return false
  }
  try {
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(actor.sub)}&status=eq.active&role=eq.${actor.role}&session_version=eq.${version}&select=id&limit=1`)
    if (!result.ok) throw new Error('Session lookup unavailable')
    if ((await result.json()).some(account => account.id === actor.sub)) return true
    sendJson(response, 401, { error: 'Tränarsessionen har avslutats. Logga in igen.' })
  } catch {
    sendJson(response, 503, { error: 'Tränarsessionen kunde inte kontrolleras. Försök igen. Kontrollera att SQL 119 är körd.' })
  }
  return false
}
