import { coachFromRequest } from './coach-auth.js'
import { getSessionProfile } from './profile-auth.js'
import { getRole, sendJson, supabaseRequest } from './supabase.js'
import { cleanPushSubscription, endpointHash, readPushSettings, sendDevicePush, validPushEndpoint, vapidDetails } from './web-push.js'

async function pushOwner(request) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  if (role === 'swimmer') {
    const profile = await getSessionProfile(request)
    if (profile) return { role, id: profile.id, column: 'profile_id', key: `swimmer:${profile.id}` }
  }
  if (role === 'coach') {
    const token = coachFromRequest(request)
    if (!token) return null // A shared group code is not a personal recipient.
    const result = await supabaseRequest(`coach_accounts?id=eq.${encodeURIComponent(token.sub)}&status=eq.active&select=id,role&limit=1`)
    if (!result.ok) throw new Error('Push account lookup failed')
    const [account] = await result.json()
    if (account) return { role, id: account.id, column: 'coach_id', key: `coach:${account.id}`, admin: account.role === 'superadmin', canViewUsers: ['head_coach', 'superadmin'].includes(account.role) }
  }
  return null
}

export default async function pushHandler(request, response) {
  try {
    const owner = await pushOwner(request)
    if (!owner) return sendJson(response, 403, { error: 'Logga in på ditt personliga konto för att hantera pushnotiser.' })
    const filter = `${owner.column}=eq.${encodeURIComponent(owner.id)}`
    const settings = await readPushSettings()
    const details = vapidDetails()
    if (request.method === 'GET') {
      const database = await supabaseRequest('push_subscriptions?select=id&limit=1', { headers: { Prefer: 'count=exact' } })
      return sendJson(response, 200, {
        settings, configured: Boolean(details), databaseReady: database.ok, publicKey: details?.publicKey || '', ownerKey: owner.key,
        ...(owner.canViewUsers ? { canViewUsers: true, ...(owner.admin ? { deviceCount: database.ok ? Number(database.headers.get('content-range')?.split('/')[1] || 0) : 0 } : {}) } : {}),
      })
    }
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Metoden stöds inte.' })
    const action = request.body?.action
    if (action === 'push-users') {
      if (!owner.canViewUsers) return sendJson(response, 403, { error: 'Endast huvudtränare och superadmin kan se listan.' })
      const subscriptions = await supabaseRequest('push_subscriptions?select=profile_id,coach_id&limit=10000')
      const [profiles, coaches] = await Promise.all([
        supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id,display_name,emoji,training_group&order=display_name.asc&limit=5000'),
        supabaseRequest('coach_accounts?status=eq.active&select=id,display_name,role&order=display_name.asc&limit=1000'),
      ])
      if (!subscriptions.ok || !profiles.ok || !coaches.ok) return sendJson(response, 503, { error: 'Kunde inte hämta pushlistan just nu.' })
      const rows = await subscriptions.json()
      const profileDevices = new Map(), coachDevices = new Map()
      for (const row of rows) {
        if (row.profile_id) profileDevices.set(row.profile_id, (profileDevices.get(row.profile_id) || 0) + 1)
        if (row.coach_id) coachDevices.set(row.coach_id, (coachDevices.get(row.coach_id) || 0) + 1)
      }
      return sendJson(response, 200, {
        swimmers: (await profiles.json()).map((profile) => ({ name: profile.display_name, emoji: profile.emoji || '🏊', group: profile.training_group || '', devices: profileDevices.get(profile.id) || 0, active: profileDevices.has(profile.id) })),
        coaches: (await coaches.json()).map((coach) => ({ name: coach.display_name || 'Tränare', role: coach.role, devices: coachDevices.get(coach.id) || 0, active: coachDevices.has(coach.id) })),
      })
    }
    if (action === 'push-settings') {
      if (!owner.admin) return sendJson(response, 403, { error: 'Endast superadmin kan ändra klubbens pushinställningar.' })
      const submitted = request.body.settings || {}
      const value = { enabled: submitted.enabled === true, coachMessages: submitted.coachMessages !== false, privateMessages: submitted.privateMessages !== false }
      if (value.enabled && !details) return sendJson(response, 503, { error: 'Pushnycklar saknas i serverns konfiguration.' })
      const database = await supabaseRequest('push_subscriptions?select=id&limit=1')
      if (value.enabled && !database.ok) return sendJson(response, 503, { error: 'Databasuppdateringen för pushnotiser behöver köras först.' })
      const result = await supabaseRequest('app_settings?on_conflict=setting_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ setting_key: 'web_push', setting_value: value, updated_at: new Date().toISOString() }) })
      if (!result.ok) throw new Error('Push settings save failed')
      return sendJson(response, 200, { settings: value })
    }
    const endpoint = request.body?.subscription?.endpoint || request.body?.endpoint
    if (typeof endpoint !== 'string' || !validPushEndpoint(endpoint)) return sendJson(response, 400, { error: 'Ogiltig pushprenumeration.' })
    const hash = endpointHash(endpoint)
    if (action === 'push-status' || action === 'push-test') {
      const result = await supabaseRequest(`push_subscriptions?endpoint_hash=eq.${hash}&${filter}&select=id,profile_id,coach_id,subscription,coach_messages,private_messages&limit=1`)
      if (!result.ok) return sendJson(response, 503, { error: 'Pushnotiser är inte färdigkonfigurerade ännu.' })
      const [row] = await result.json()
      if (action === 'push-status') return sendJson(response, 200, { subscribed: Boolean(row), preferences: row ? { coachMessages: row.coach_messages, privateMessages: row.private_messages } : null })
      if (!settings.enabled || !details) return sendJson(response, 403, { error: 'Pushnotiser är avstängda just nu.' })
      if (!row) return sendJson(response, 404, { error: 'Aktivera notiser på enheten först.' })
      const delivered = await sendDevicePush(row, { title: 'Simkoll · Testnotis', body: 'Pushnotiser är aktiverade på den här enheten.', screen: 'home', tag: 'simkoll-push-test' })
      return sendJson(response, delivered ? 200 : 502, delivered ? { ok: true } : { error: 'Testnotisen kunde inte levereras. Prova att aktivera notiser igen.' })
    }
    if (action === 'push-unsubscribe') {
      const result = await supabaseRequest(`push_subscriptions?endpoint_hash=eq.${hash}&${filter}`, { method: 'DELETE' })
      if (!result.ok) throw new Error('Push unsubscribe failed')
      return sendJson(response, 200, { ok: true })
    }
    if (action !== 'push-subscribe') return sendJson(response, 400, { error: 'Okänd pushåtgärd.' })
    if (!settings.enabled || !details) return sendJson(response, 403, { error: 'Pushnotiser är avstängda just nu.' })
    const subscription = cleanPushSubscription(request.body.subscription)
    if (!subscription) return sendJson(response, 400, { error: 'Ogiltiga nycklar för pushprenumerationen.' })
    const preferences = request.body.preferences || {}
    const result = await supabaseRequest('push_subscriptions?on_conflict=endpoint_hash', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ endpoint_hash: hash, subscription, profile_id: owner.role === 'swimmer' ? owner.id : null, coach_id: owner.role === 'coach' ? owner.id : null, coach_messages: preferences.coachMessages !== false, private_messages: preferences.privateMessages !== false, updated_at: new Date().toISOString() }),
    })
    if (!result.ok) throw new Error('Push subscription save failed')
    return sendJson(response, 200, { ok: true })
  } catch (error) {
    console.error('Push API failed', { reason: error.message })
    return sendJson(response, 503, { error: 'Kunde inte uppdatera pushnotiser. Försök igen om en stund.' })
  }
}
