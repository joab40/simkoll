const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export function isDatabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey)
}

export async function supabaseRequest(path, options = {}) {
  if (!isDatabaseConfigured()) throw new Error('Supabase is not configured')

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

// AI is controlled centrally by the coach-facing webapp settings. Missing
// settings preserve the historic default (enabled), while an explicit false
// is a hard stop for every server-side AI endpoint.
export async function isAiEnabled() {
  try {
    const result = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
    if (!result.ok) return true
    const rows = await result.json()
    return rows[0]?.setting_value?.aiEnabled !== false
  } catch {
    return true
  }
}

export async function aiAvailability() {
  try {
    const result = await supabaseRequest('app_settings?setting_key=eq.webapp&select=setting_value&limit=1')
    const settings = result.ok ? (await result.json())[0]?.setting_value || {} : {}
    if (settings.aiEnabled === false) return { allowed: false, reason: 'disabled' }
    const limit = Math.max(0, Number(settings.aiMonthlyTokenLimit || 0))
    if (!limit) return { allowed: true, limit: 0, used: 0 }
    const start = new Date()
    start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
    const usage = await supabaseRequest(`ai_usage_logs?created_at=gte.${encodeURIComponent(start.toISOString())}&select=total_tokens&limit=10000`)
    const rows = usage.ok ? await usage.json() : []
    const used = rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0)
    return used >= limit ? { allowed: false, reason: 'limit', limit, used } : { allowed: true, limit, used }
  } catch {
    // A missing settings table must not accidentally take down AI features.
    return { allowed: true, limit: 0, used: 0 }
  }
}

export function getRole(code) {
  if (!process.env.SIMKOLL_SWIMMER_CODE || !process.env.SIMKOLL_COACH_CODE) return null
  if (code === process.env.SIMKOLL_COACH_CODE) return 'coach'
  if (code === process.env.SIMKOLL_SWIMMER_CODE) return 'swimmer'
  return null
}

export function sendJson(response, status, data) {
  response.setHeader('Cache-Control', 'no-store')
  return response.status(status).json(data)
}
