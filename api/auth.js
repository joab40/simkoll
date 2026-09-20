import { getRole, isDatabaseConfigured, sendJson } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!isDatabaseConfigured()) return sendJson(response, 503, { error: 'Databasen är inte konfigurerad.' })

  const role = getRole(String(request.body?.code || ''))
  if (!role) return sendJson(response, 401, { error: 'Koden stämmer inte. Försök igen.' })
  await writeAuditLog(request, { eventType: 'group_login', role, details: { login: 'group-code' } })
  return sendJson(response, 200, { role })
}
