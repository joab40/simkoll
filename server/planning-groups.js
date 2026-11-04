import { supabaseRequest } from './supabase.js'

export async function loadPlanningGroups(db = supabaseRequest) {
  let response
  try { response = await db('training_groups?active=eq.true&select=id,name&order=name.asc&limit=201') } catch { throw Object.assign(new Error('Tränarvyns grupper kunde inte hämtas. Inget har sparats. Försök igen.'), { status: 503 }) }
  if (!response.ok) throw Object.assign(new Error('Tränarvyns grupper kunde inte hämtas. Inget har sparats. Försök igen.'), { status: 503 })
  const rows = await response.json()
  if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw Object.assign(new Error('Grupplistan kunde inte läsas säkert. Inget har sparats.'), { status: 503 })
  const labels = Object.fromEntries(rows.filter(row => typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 80 && typeof row.name === 'string' && row.name.trim()).map(row => [row.id, row.name.trim()]))
  if (!Object.keys(labels).length) throw Object.assign(new Error('Inga aktiva grupper kunde läsas. Inget har sparats.'), { status: 503 })
  return labels
}
