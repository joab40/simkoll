import { createHash } from 'node:crypto'
import { supabaseRequest } from './supabase.js'

const ipHash = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || '').split(',')[0].trim()
  if (!forwarded) return null
  const salt = process.env.AUDIT_LOG_SALT || 'simkoll-audit'
  return createHash('sha256').update(`${salt}:${forwarded}`).digest('hex').slice(0, 24)
}

export async function writeAuditLog(request, { eventType, role = null, profileId = null, status = 'success', details = {} }) {
  try {
    const country = String(request.headers['x-vercel-ip-country'] || '').slice(0, 8) || null
    const region = String(request.headers['x-vercel-ip-country-region'] || '').slice(0, 40) || null
    const location = country || region ? { country, region } : undefined
    const storedDetails = location ? { ...details, location } : details
    const result = await supabaseRequest('audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ event_type: eventType, role, profile_id: profileId, status, ip_hash: ipHash(request), details: storedDetails }) })
    if (!result.ok) console.warn('Audit log failed:', result.status)
  } catch (error) { console.warn('Audit log unavailable:', error.message) }
}

export async function writeAiUsage(request, { feature, model, role = null, profileId = null, response = null, status = 'success', error = null }) {
  const usage = response?.usage || {}
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
  const totalTokens = Number(usage.total_tokens ?? (promptTokens + completionTokens))
  try {
    const result = await supabaseRequest('ai_usage_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ feature, model, role, profile_id: profileId, status, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, error_message: error ? String(error).slice(0, 300) : null }) })
    if (!result.ok) console.warn('AI usage log failed:', result.status)
  } catch (logError) { console.warn('AI usage log unavailable:', logError.message) }
}
