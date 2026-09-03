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
