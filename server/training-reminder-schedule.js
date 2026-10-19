import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabaseRequest } from './supabase.js'
import { vapidDetails } from './web-push.js'

// Domain separation: the push private key never leaves the server. The derived
// token can only authorize reminder dispatch, not sign Web Push messages.
export function trainingReminderToken() {
  const details = vapidDetails()
  return details ? createHmac('sha256', details.privateKey).update('simkoll:training-reminders:v1').digest('hex') : null
}

export function isTrainingReminderAuthorized(authorization) {
  if (typeof authorization !== 'string') return false
  const actual = Buffer.from(authorization)
  return [trainingReminderToken(), process.env.CRON_SECRET].filter(Boolean).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

export function trainingReminderUrl(request) {
  // Never reconfigure the production schedule from a preview or localhost.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return null
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || (process.env.VERCEL_ENV === 'production' ? request.headers.host : null)
  if (!host || !/^[a-z0-9.-]+(?::443)?$/i.test(host) || !host.includes('.')) return null
  return new URL('/api/notifications?push=true&cron=training-reminder&kind=scheduled', `https://${host}`).href
}

export async function configureTrainingReminderSchedule(request, reminders) {
  const url = trainingReminderUrl(request)
  if (!url) return { error: 'Spara påminnelserna från den publicerade Simkoll-appen.' }
  const enabled = reminders.missingCheckin || reminders.afterTraining
  const token = enabled ? trainingReminderToken() : null
  if (enabled && !token) return { error: 'Klubbens pushnotiser behöver konfigureras först.' }
  const result = await supabaseRequest('rpc/configure_training_reminders', {
    method: 'POST', body: JSON.stringify({ p_url: enabled ? url : null, p_token: token, p_reminders: reminders }),
  })
  if (!result.ok) return { error: 'Påminnelserna kunde inte aktiveras. Kontrollera att databasuppdatering 097 har körts och försök igen.' }
  return { ok: true }
}

export function isMissingCheckinReminderTime(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(now) === '20'
}
