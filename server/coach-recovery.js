import { createHash, randomBytes } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { coachFromRequest, findCoach, hashCoachPassword } from './coach-auth.js'
import { sendJson, supabaseRequest } from './supabase.js'
import { writeAuditLog } from './audit.js'

export const RECOVERY_MESSAGE = 'Om adressen tillhör ett aktivt tränarkonto skickar vi en återställningslänk. Kontrollera även skräpposten. Vänta några minuter innan du försöker igen.'
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const tokenHash = value => createHash('sha256').update(value).digest('hex')
const limitHash = value => tokenHash(`${process.env.COACH_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || 'coach-recovery'}:${value}`)
const ip = request => String(request.headers?.['x-forwarded-for'] || request.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100)
export function recoveryOrigin() {
  const url = new URL(process.env.APP_PUBLIC_URL || 'https://www.simkoll.app')
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid public URL')
  return url.origin
}
async function rpc(name, body) {
  const result = await supabaseRequest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) })
  if (!result.ok) throw new Error(`Recovery database unavailable (${result.status})`)
  return result.json()
}
async function gate(entries) {
  return (await rpc('coach_mail_gate', { p_keys: entries.map(([key]) => limitHash(key)), p_limits: entries.map(([, count]) => count), p_seconds: entries.map(([, , seconds]) => seconds) })) === true
}
export async function sendCoachEmail({ to, subject, text, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Mail is not configured')
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || 'Simkoll <noreply@simkoll.app>', to: [to], subject, text }),
  })
  // Never include provider bodies, tokens or credentials in errors/logs.
  if (!result.ok) throw new Error(`Mail provider rejected request (${result.status})`)
  const data = await result.json()
  if (!data.id) throw new Error('Mail provider did not acknowledge message')
  return data.id
}

export async function issueCoachReset(email, request) {
  const target = await findCoach(email)
  if (!target || target.status !== 'active') return
  if (!await gate([['mail-global', 90, 86400]])) return
  const token = randomBytes(32).toString('hex'), digest = tokenHash(token)
  const account = await rpc('coach_begin_reset', { p_email: email, p_token_hash: digest })
  if (!account) return
  try {
    const link = `${recoveryOrigin()}/#coach-reset=${token}`
    await sendCoachEmail({ to: account.email, subject: 'Välj ett nytt lösenord för Simkoll', text: `En återställning av lösenordet för ditt tränarkonto har begärts.\n\nVälj ett nytt lösenord:\n${link}\n\nLänken gäller i 30 minuter och kan användas en gång. En ny begäran ersätter tidigare länkar.\n\nOm du inte begärde detta kan du ignorera mejlet. Ditt lösenord ändras inte förrän du själv väljer ett nytt.\n\nSimkoll`, idempotencyKey: `coach-reset-${digest}` })
    await writeAuditLog(request, { eventType: 'coach_password_reset_email', role: 'coach', details: { targetAccountId: account.id, providerAccepted: true } })
  } catch {
    // Remove only this failed link, not a concurrently issued newer one.
    try { await supabaseRequest(`coach_password_resets?token_hash=eq.${digest}`, { method: 'DELETE' }) } catch { /* It still expires after 30 minutes. */ }
    await writeAuditLog(request, { eventType: 'coach_password_reset_email', role: 'coach', status: 'failure', details: { targetAccountId: account.id } })
  }
}

export async function handleCoachRecovery(request, response) {
  const { action } = request.body || {}
  if (!['coach-forgot-password', 'coach-reset-password', 'coach-test-email'].includes(action)) return false
  response.setHeader('Referrer-Policy', 'no-referrer')
  try {
    if (action === 'coach-forgot-password') {
      const email = String(request.body.email || '').trim().toLowerCase()
      if (!validEmail(email)) { sendJson(response, 400, { error: 'Ange en giltig e-postadress.' }); return true }
      if (!process.env.RESEND_API_KEY) { sendJson(response, 503, { error: 'Mejltjänsten är inte konfigurerad ännu.' }); return true }
      recoveryOrigin()
      const allowed = await gate([[`request-ip:${ip(request)}`, 10, 900], [`request-email:${email}`, 3, 900]])
      // Account lookup/send run after the same response, preventing enumeration
      // through account-dependent response time. Vercel keeps the task alive.
      if (allowed) waitUntil(issueCoachReset(email, request).catch(() => console.warn('Coach recovery dispatch unavailable')))
      sendJson(response, 202, { message: RECOVERY_MESSAGE }); return true
    }
    if (action === 'coach-reset-password') {
      const { token, password } = request.body
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) { sendJson(response, 400, { error: 'Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.' }); return true }
      if (typeof password !== 'string' || password.length < 10 || password.length > 128) { sendJson(response, 400, { error: 'Välj ett lösenord med 10–128 tecken.' }); return true }
      if (!await gate([[`reset-ip:${ip(request)}`, 20, 900]])) { sendJson(response, 429, { error: 'För många försök. Vänta 15 minuter och försök igen.' }); return true }
      const hashed = await hashCoachPassword(password)
      const accountId = await rpc('coach_finish_reset', { p_token_hash: tokenHash(token), p_password_hash: hashed.hash, p_password_salt: hashed.salt })
      if (!accountId) { sendJson(response, 400, { error: 'Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.' }); return true }
      response.setHeader('Set-Cookie', 'simkoll_coach_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
      await writeAuditLog(request, { eventType: 'coach_password_reset_completed', role: 'coach', details: { targetAccountId: accountId } })
      sendJson(response, 200, { message: 'Lösenordet är ändrat. Tidigare tränarsessioner är avslutade. Logga in med ditt nya lösenord.' }); return true
    }
    const actor = coachFromRequest(request)
    if (actor?.role !== 'superadmin') { sendJson(response, 403, { error: 'Endast superadmin kan skicka testmejl.' }); return true }
    const accountId = String(request.body.accountId || '')
    if (!/^[a-f0-9-]{36}$/i.test(accountId)) { sendJson(response, 400, { error: 'Välj ett tränarkonto.' }); return true }
    if (!process.env.RESEND_API_KEY) { sendJson(response, 503, { error: 'RESEND_API_KEY saknas i serverns miljövariabler.' }); return true }
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,email&limit=1`)
    if (!result.ok) throw new Error('Account lookup failed')
    const [account] = await result.json()
    if (!account || !validEmail(account.email)) { sendJson(response, 404, { error: 'Kontot eller e-postadressen saknas.' }); return true }
    if (!await gate([[`test-admin:${actor.sub}`, 10, 900], [`test-recipient:${account.id}`, 3, 900], ['mail-global', 90, 86400]])) { sendJson(response, 429, { error: 'Gränsen för testmejl är nådd. Försök senare.' }); return true }
    await sendCoachEmail({ to: account.email, subject: 'Testmejl från Simkoll', text: 'Detta är ett testmejl som en superadmin har skickat från Tränarkonton i Simkoll.\n\nInget lösenord har ändrats och du behöver inte göra något.\n\nSimkoll', idempotencyKey: `coach-test-${randomBytes(16).toString('hex')}` })
    await writeAuditLog(request, { eventType: 'coach_test_email', role: 'coach', details: { targetAccountId: account.id, providerAccepted: true } })
    sendJson(response, 200, { message: `Resend har tagit emot testmejlet till ${account.email}. Kontrollera inkorg och skräppost. Det är inte en bekräftelse på leverans.` }); return true
  } catch {
    sendJson(response, 503, { error: 'Mejlet eller återställningen kunde inte behandlas. Kontrollera mejlinställningarna och att SQL 119 är körd. Försök igen senare.' }); return true
  }
}
