import { createHash } from 'node:crypto'
import webpush from 'web-push'
import { waitUntil } from '@vercel/functions'
import { supabaseRequest } from './supabase.js'

export const pushDefaults = { enabled: false, coachMessages: true, privateMessages: true }
export const endpointHash = (endpoint) => createHash('sha256').update(endpoint).digest('hex')

// Subscription endpoints cause outbound server requests. Accept only known push
// providers, never arbitrary URLs or private network addresses from a client.
export function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return endpoint.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      url.hostname === 'fcm.googleapis.com' || url.hostname === 'web.push.apple.com' ||
      url.hostname === 'updates.push.services.mozilla.com' || url.hostname.endsWith('.push.services.mozilla.com') ||
      url.hostname.endsWith('.notify.windows.com')
    )
  } catch { return false }
}

export function cleanPushSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || !validPushEndpoint(value.endpoint)) return null
  const { p256dh, auth } = value.keys || {}
  if (![p256dh, auth].every((key) => typeof key === 'string' && key.length <= 90 && /^[A-Za-z0-9_-]+={0,2}$/.test(key))) return null
  const publicKey = Buffer.from(p256dh, 'base64url')
  if (publicKey.length !== 65 || publicKey[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) return null
  return { endpoint: value.endpoint, keys: { p256dh, auth } }
}

export function vapidDetails() {
  const subject = process.env.WEB_PUSH_SUBJECT || ''
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || ''
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || ''
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return null
  if (Buffer.from(publicKey, 'base64url').length !== 65 || Buffer.from(privateKey, 'base64url').length !== 32) return null
  return { subject, publicKey, privateKey }
}

export async function readPushSettings() {
  const result = await supabaseRequest('app_settings?setting_key=eq.web_push&select=setting_value&limit=1')
  if (!result.ok) throw new Error('Push settings unavailable')
  return { ...pushDefaults, ...(await result.json())[0]?.setting_value }
}

export async function sendDevicePush(row, payload, send = webpush.sendNotification.bind(webpush)) {
  const subscription = cleanPushSubscription(row.subscription)
  const details = vapidDetails()
  if (!subscription || !details) return false
  try {
    await send(subscription, JSON.stringify({ ...payload, ownerKey: row.profile_id ? `swimmer:${row.profile_id}` : `coach:${row.coach_id}` }), {
      vapidDetails: details, TTL: 3600, urgency: 'normal', timeout: 5000,
    })
    return true
  } catch (error) {
    if ([404, 410].includes(error.statusCode)) {
      // Match the old owner too: an in-flight failure must not erase a device
      // that has just been rebound to another account.
      const owner = row.profile_id ? `profile_id=eq.${row.profile_id}` : `coach_id=eq.${row.coach_id}`
      await supabaseRequest(`push_subscriptions?id=eq.${row.id}&${owner}`, { method: 'DELETE' })
    } else console.error('Push delivery failed', { status: error.statusCode || 'network' })
    return false
  }
}

// Events contain recipient identifiers and routing only. Message text, names,
// health information and training data never appear on the lock screen.
export async function deliverMessagePush(event, send) {
  if (!vapidDetails()) return
  const settings = await readPushSettings()
  const category = event.kind === 'coach-info' || event.kind === 'coach-post' ? 'coachMessages' : 'privateMessages'
  if (category === 'privateMessages' && !event.profileId && !event.toCoaches) return
  if (!settings.enabled || settings[category] === false) return
  const ownerFilter = event.profileId ? `&profile_id=eq.${encodeURIComponent(event.profileId)}` : event.toCoaches ? '&coach_id=not.is.null' : ''
  const result = await supabaseRequest(`push_subscriptions?${category === 'coachMessages' ? 'coach_messages' : 'private_messages'}=eq.true${ownerFilter}&select=id,profile_id,coach_id,subscription&limit=5000`)
  if (!result.ok) throw new Error('Push subscriptions unavailable')
  const rows = await result.json()
  if (!rows.length) return
  const [profiles, coaches] = await Promise.all([
    supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&select=id&limit=10000'),
    supabaseRequest('coach_accounts?status=eq.active&select=id&limit=10000'),
  ])
  if (!profiles.ok || !coaches.ok) throw new Error('Push recipient verification failed')
  const activeProfiles = new Set((await profiles.json()).map((row) => row.id))
  const activeCoaches = new Set((await coaches.json()).map((row) => row.id))
  const recipients = rows.filter((row) => {
    if (event.profileId && row.profile_id !== event.profileId) return false
    if (event.toCoaches && !row.coach_id) return false
    return row.profile_id ? activeProfiles.has(row.profile_id) : activeCoaches.has(row.coach_id) && row.coach_id !== event.senderCoachId
  })
  const payload = {
    title: category === 'coachMessages' ? 'Simkoll · Nytt från tränarna' : 'Simkoll · Privat meddelande',
    body: category === 'coachMessages' ? 'Tränarna har skickat ny information. Öppna Simkoll för att läsa.' : 'Du har fått ett nytt privat meddelande. Öppna Simkoll för att läsa.',
    screen: event.toCoaches ? 'messages' : event.kind === 'coach-info' ? 'coach-info' : event.kind === 'coach-post' ? 'community' : 'private',
    tag: `simkoll-${event.kind}-${event.id}`,
  }
  // Bound concurrency; all work stays inside Vercel's waitUntil lifetime.
  let next = 0
  const deadline = Date.now() + 45000
  await Promise.all(Array.from({ length: Math.min(12, recipients.length) }, async () => {
    while (next < recipients.length && Date.now() < deadline) await sendDevicePush(recipients[next++], payload, send)
  }))
  if (next < recipients.length) console.error('Push dispatch time budget exceeded', { remaining: recipients.length - next })
}

export function queueMessagePush(event) {
  waitUntil(deliverMessagePush(event).catch((error) => console.error('Push dispatch failed', { reason: error.message })))
}
