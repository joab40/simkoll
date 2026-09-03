import { getRole, isDatabaseConfigured, sendJson } from '../server/supabase.js'

export default function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!isDatabaseConfigured()) return sendJson(response, 503, { error: 'Databasen är inte konfigurerad.' })

  const role = getRole(String(request.body?.code || ''))
  if (!role) return sendJson(response, 401, { error: 'Koden stämmer inte. Försök igen.' })
  return sendJson(response, 200, { role })
}
