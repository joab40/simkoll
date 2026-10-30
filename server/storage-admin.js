import { coachFromRequest } from './coach-auth.js'
import { sendJson, supabaseRequest } from './supabase.js'

const migrationMessage = 'Lagringsöversikten behöver databasuppdatering 110_storage_usage. Kör SQL-filen och öppna sidan igen.'
export const validStorageBudget = (value) => value === null || Number.isSafeInteger(value) && value > 0 && value <= 1000000000000000

export async function handleStorageAdmin(request, response, db = supabaseRequest) {
  // Re-check the live account, not only the role saved in an older token.
  const account = coachFromRequest(request)
  if (account?.role !== 'superadmin' || !/^[0-9a-f-]{36}$/i.test(account.sub || '')) return sendJson(response, 403, { error: 'Endast superadmin kan se och hantera lagring.' })
  try {
    const access = await db(`coach_accounts?id=eq.${encodeURIComponent(account.sub)}&select=id,role,status&limit=1`)
    if (!access.ok) return sendJson(response, 503, { error: 'Behörigheten kunde inte kontrolleras. Försök igen.' })
    const [current] = await access.json()
    if (current?.role !== 'superadmin' || current.status !== 'active') return sendJson(response, 403, { error: 'Ett aktivt superadmin-konto krävs.' })
    if (!['GET', 'POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST'); return sendJson(response, 405, { error: 'Metoden stöds inte.' }) }
    const action = request.body?.action
    if (request.method === 'POST' && !['save-budgets', 'capture'].includes(action)) return sendJson(response, 400, { error: 'Välj en giltig lagringsåtgärd.' })
    if (action === 'save-budgets' && request.method === 'POST') {
      const { databaseBudgetBytes, fileBudgetBytes, expectedUpdatedAt } = request.body
      if (!validStorageBudget(databaseBudgetBytes) || !validStorageBudget(fileBudgetBytes) || typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt.length > 50 || !Number.isFinite(Date.parse(expectedUpdatedAt))) return sendJson(response, 400, { error: 'Ange positiva budgetar eller lämna tomt, och uppdatera sidan före sparande.' })
      const saved = await db('rpc/set_storage_budgets', { method: 'POST', body: JSON.stringify({ p_database: databaseBudgetBytes, p_files: fileBudgetBytes, p_expected_updated_at: expectedUpdatedAt }) })
      if (!saved.ok) {
        const error = await saved.text()
        if (error.includes('STORAGE_BUDGET_CONFLICT')) return sendJson(response, 409, { error: 'Budgeten ändrades av någon annan. Uppdatera sidan, granska och försök igen.' })
        return sendJson(response, 503, { error: saved.status === 404 || /PGRST202|does not exist/.test(error) ? migrationMessage : 'Budgeten kunde inte sparas. Försök igen.' })
      }
      return sendJson(response, 200, { settings: await saved.json() })
    }
    const result = await db('rpc/storage_admin_overview', { method: 'POST', body: JSON.stringify({ p_capture: request.method === 'POST' && action === 'capture' }), signal: AbortSignal.timeout(20000) })
    if (!result.ok) {
      const error = await result.text()
      return sendJson(response, 503, { error: result.status === 404 || /PGRST202|does not exist/.test(error) ? migrationMessage : 'Lagringsmätningen kunde inte hämtas. Försök igen.' })
    }
    return sendJson(response, 200, await result.json())
  } catch { return sendJson(response, 503, { error: 'Lagringsöversikten kunde inte nås. Försök igen.' }) }
}
