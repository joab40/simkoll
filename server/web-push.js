import { createHash } from 'node:crypto'
import webpush from 'web-push'
import { waitUntil } from '@vercel/functions'
import { supabaseRequest } from './supabase.js'

export const pushDefaults = { enabled: false, coachMessages: true, privateMessages: true, developmentTalks: true, competitionEntries: true, publishedWorkouts: true, checkinReminders: { missingCheckin: false, afterTraining: false } }
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
  const saved = (await result.json())[0]?.setting_value || {}
  return { ...pushDefaults, ...saved, checkinReminders: { ...pushDefaults.checkinReminders, ...(saved.checkinReminders || {}) } }
}

const stockholmDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const targetGroupsForWorkout = (workout) => Array.isArray(workout.target_groups) && workout.target_groups.length ? workout.target_groups : ['ungdom_orange', 'ungdom_svart', 'junior']

async function claimTrainingReminder(profileId, date, kind) {
  const result = await supabaseRequest('training_reminder_deliveries?on_conflict=profile_id,reminder_date', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ profile_id: profileId, reminder_date: date, reminder_kind: kind }),
  })
  if (!result.ok) throw new Error('Training reminder claim failed')
  return (await result.json()).length > 0
}

async function releaseTrainingReminder(profileId, date) {
  await supabaseRequest(`training_reminder_deliveries?profile_id=eq.${encodeURIComponent(profileId)}&reminder_date=eq.${date}`, { method: 'DELETE' })
}

async function sendTrainingReminder(profileId, date, kind) {
  const claimed = await claimTrainingReminder(profileId, date, kind)
  if (!claimed) return false
  const devices = await supabaseRequest(`push_subscriptions?profile_id=eq.${encodeURIComponent(profileId)}&training_reminders=eq.true&select=id,profile_id,coach_id,subscription&limit=100`)
  if (!devices.ok) { await releaseTrainingReminder(profileId, date); throw new Error('Training reminder devices unavailable') }
  const rows = await devices.json()
  const messages = {
    missingCheckin: ['Simkoll · Dagens träning', 'Du har inte checkat in för dagens planerade träning. Öppna Simkoll när det passar.'],
    afterTraining: ['Simkoll · Efter träningen', 'Du skrev att du skulle träna för en stund sedan. Om passet blev av, fyll gärna i efterrapporten i Simkoll.'],
  }
  const [title, body] = messages[kind]
  const payload = { title, body, screen: 'home', tag: `simkoll-training-reminder-${date}` }
  const results = await Promise.all(rows.map((row) => sendDevicePush(row, payload)))
  const delivered = results.some(Boolean)
  if (!delivered) await releaseTrainingReminder(profileId, date)
  return delivered
}

export async function deliverTrainingReminders(kind) {
  if (!Object.hasOwn(pushDefaults.checkinReminders, kind) || !vapidDetails()) return { sent: 0, skipped: 0 }
  const settings = await readPushSettings()
  if (!settings.enabled || settings.checkinReminders[kind] !== true) return { sent: 0, skipped: 0 }
  const date = stockholmDay()
  const [profilesResult, responsesResult] = await Promise.all([
    supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id,training_group&limit=10000'),
    supabaseRequest(`responses?activity_date=eq.${date}&select=id,profile_id,day_type,competition,activity_type,session_slot,created_at&limit=20000`),
  ])
  if (!profilesResult.ok || !responsesResult.ok) throw new Error('Training reminder source data unavailable')
  const profiles = await profilesResult.json()
  const responses = await responsesResult.json()
  const byProfile = new Map()
  for (const row of responses) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, [])
    byProfile.get(row.profile_id).push(row)
  }
  let eligible = profiles
  if (kind === 'missingCheckin') {
    const [workoutsResult, competitionsResult] = await Promise.all([
      supabaseRequest(`daily_workouts?workout_date=eq.${date}&select=workout_date,focus,target_groups&limit=500`),
      supabaseRequest(`competition_calendar?start_date=lte.${date}&end_date=gte.${date}&select=start_date,end_date,target_groups&limit=500`),
    ])
    if (!workoutsResult.ok || !competitionsResult.ok) throw new Error('Training plan lookup failed')
    const workouts = (await workoutsResult.json()).filter((row) => row.focus !== 'tavling')
    const competitions = await competitionsResult.json()
    eligible = profiles.filter((profile) => {
      const group = profile.training_group
      if (!group || (byProfile.get(profile.id) || []).length) return false
      const hasPlannedWorkout = workouts.some((workout) => targetGroupsForWorkout(workout).includes(group))
      const hasCompetition = competitions.some((competition) => !competition.target_groups?.length || competition.target_groups.includes(group))
      return hasPlannedWorkout && !hasCompetition
    })
  } else if (kind === 'afterTraining') {
    const dueBeforeCutoff = Date.now() - 2.5 * 60 * 60 * 1000
    eligible = profiles.filter((profile) => {
      const rows = byProfile.get(profile.id) || []
      const before = rows.filter((row) => row.day_type === 'before' && row.competition !== true && (!row.activity_type || row.activity_type === 'swim') && ['morning_swim', 'afternoon_swim'].includes(row.session_slot) && Number.isFinite(Date.parse(row.created_at)) && Date.parse(row.created_at) <= dueBeforeCutoff)
      return before.some((start) => !rows.some((end) => end.day_type === 'after' && end.competition !== true && (!end.activity_type || end.activity_type === 'swim') && end.session_slot === start.session_slot && Date.parse(end.created_at) >= Date.parse(start.created_at)))
    })
  }
  let sent = 0, next = 0
  await Promise.all(Array.from({ length: Math.min(8, eligible.length) }, async () => {
    while (next < eligible.length) if (await sendTrainingReminder(eligible[next++].id, date, kind)) sent++
  }))
  return { sent, skipped: profiles.length - eligible.length }
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
    title: event.kind === 'goal-reflection' ? 'Simkoll · Svar på utvecklingsmål' : category === 'coachMessages' ? 'Simkoll · Nytt från tränarna' : 'Simkoll · Privat meddelande',
    body: event.kind === 'goal-reflection' ? 'En simmare har svarat på ett mål. Öppna tränarvyn för att läsa.' : category === 'coachMessages' ? 'Tränarna har skickat ny information. Öppna Simkoll för att läsa.' : 'Du har fått ett nytt privat meddelande. Öppna Simkoll för att läsa.',
    screen: event.kind === 'goal-reflection' ? 'goals' : event.toCoaches ? 'messages' : event.kind === 'coach-info' ? 'coach-info' : event.kind === 'coach-post' ? 'community' : 'private',
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

const categoryNotifications = {
  developmentGoals: {
    column: 'development_talks', setting: 'developmentTalks', screen: 'goals', title: 'Simkoll · Nytt utvecklingsmål',
    body: 'Tränaren har lagt till ett mål för dig. Öppna Simkoll för att läsa.',
  },
  developmentTalks: {
    column: 'development_talks', screen: 'talks', title: 'Simkoll · Utvecklingssamtal',
    body: 'Tränaren har öppnat ett utvecklingssamtal för dig. Öppna Simkoll för att förbereda dig.',
  },
  competitionEntries: {
    column: 'competition_entries', screen: 'competition-entries', title: 'Simkoll · Tävlingsanmälan',
    body: 'En tävling är öppen för anmälan. Öppna Simkoll för att välja grenar.',
  },
  publishedWorkouts: {
    column: 'published_workouts', screen: 'planning', title: 'Simkoll · Nytt simpass',
    body: 'Ett nytt simpass har publicerats. Öppna veckoplaneringen i Simkoll.',
  },
}

export async function deliverCategoryPush(event, send) {
  const notification = categoryNotifications[event.category]
  if (!notification || !vapidDetails()) return
  if (['developmentTalks', 'developmentGoals'].includes(event.category) && !event.profileId) return
  const settings = await readPushSettings()
  if (!settings.enabled || settings[notification.setting || event.category] === false) return
  const profileFilter = event.profileId
    ? `&profile_id=eq.${encodeURIComponent(event.profileId)}`
    : '&profile_id=not.is.null'
  const devices = await supabaseRequest(`push_subscriptions?${notification.column}=eq.true${profileFilter}&select=id,profile_id,subscription&limit=5000`)
  if (!devices.ok) throw new Error('Push recipients unavailable')
  const rows = await devices.json()
  if (!rows.length) return
  const profiles = await supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&select=id,training_group&limit=10000')
  if (!profiles.ok) throw new Error('Push profile verification failed')
  const activeProfiles = new Map((await profiles.json()).map((profile) => [profile.id, profile]))
  const targetGroups = Array.isArray(event.targetGroups) ? event.targetGroups.filter((group) => typeof group === 'string' && group) : []
  const recipients = rows.filter((row) => {
    const profile = activeProfiles.get(row.profile_id)
    if (!profile) return false
    if (event.profileId && row.profile_id !== event.profileId) return false
    return !targetGroups.length || targetGroups.includes(profile.training_group)
  })
  const payload = {
    title: event.category === 'publishedWorkouts' && event.workoutCount > 1 ? 'Simkoll · Nya passalternativ' : notification.title,
    body: event.category === 'publishedWorkouts' && /^\d{4}-\d{2}-\d{2}$/.test(event.date || '')
      ? `${event.workoutCount > 1 ? `${event.workoutCount} nya passalternativ har publicerats` : 'Ett nytt simpass har publicerats'} för ${new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${event.date}T12:00:00Z`))}${event.timeOfDay === 'morning' ? ' · morgonpass' : event.timeOfDay === 'afternoon' ? ' · eftermiddag / kväll' : ''}. Öppna veckoplaneringen i Simkoll.`
      : notification.body,
    screen: notification.screen,
    talkId: event.category === 'developmentTalks' ? event.id : undefined,
    tag: `simkoll-${event.category}-${event.id}`,
  }
  let next = 0
  const deadline = Date.now() + 45000
  await Promise.all(Array.from({ length: Math.min(12, recipients.length) }, async () => {
    while (next < recipients.length && Date.now() < deadline) await sendDevicePush(recipients[next++], payload, send)
  }))
  if (next < recipients.length) console.error('Push dispatch time budget exceeded', { remaining: recipients.length - next })
}

export function queueCategoryPush(event) {
  waitUntil(deliverCategoryPush(event).catch((error) => console.error('Category push dispatch failed', { reason: error.message })))
}
