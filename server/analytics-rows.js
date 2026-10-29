import { supabaseRequest } from './supabase.js'

// Stay below the database's per-request row limit. Callers supply a stable
// order so equal dates cannot move between pages.
export async function analyticsRows(query, read = supabaseRequest) {
  const rows = [], maxRows = 10000, pageSize = 500
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const result = await read(`${query}&limit=${pageSize}&offset=${offset}`)
    if (!result.ok) return result
    const page = await result.json()
    rows.push(...page)
    if (page.length < pageSize) return { ok: true, json: async () => rows, truncated: false }
  }
  return { ok: true, json: async () => rows, truncated: true }
}
