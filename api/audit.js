import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAuditLog } from '../server/audit.js'

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan se loggar.' })
  try {
    if (request.method === 'POST') {
      const eventType = String(request.body?.eventType || '').slice(0, 80)
      if (!eventType) return sendJson(response, 400, { error: 'Händelsetyp saknas.' })
      await writeAuditLog(request, { eventType, role, status: request.body?.status === 'failure' ? 'failure' : 'success', details: { source: 'coach-client' } })
      return sendJson(response, 200, { ok: true })
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
    const [logsResult, usageResult] = await Promise.all([
      supabaseRequest('audit_logs?select=id,event_type,role,status,details,created_at&order=created_at.desc&limit=300'),
      supabaseRequest('ai_usage_logs?select=id,feature,model,role,status,prompt_tokens,completion_tokens,total_tokens,error_message,created_at&order=created_at.desc&limit=300'),
    ])
    if (!logsResult.ok || !usageResult.ok) throw new Error('Audit lookup failed')
    const logs = await logsResult.json(), aiUsage = await usageResult.json()
    const totals = aiUsage.reduce((sum, item) => ({ calls: sum.calls + 1, successful: sum.successful + (item.status === 'success' ? 1 : 0), promptTokens: sum.promptTokens + Number(item.prompt_tokens || 0), completionTokens: sum.completionTokens + Number(item.completion_tokens || 0), totalTokens: sum.totalTokens + Number(item.total_tokens || 0) }), { calls: 0, successful: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
    return sendJson(response, 200, { logs, aiUsage, totals })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta loggar.' })
  }
}
