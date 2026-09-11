import { randomInt } from 'node:crypto'
import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import {
  clearSessionCookie, createSession, deleteCurrentSession, getSessionProfile, hashPin,
  hashToken, normalizeUsername, publicProfile, touchProfileActivity, validPin, validUsername, verifyPin,
} from '../server/profile-auth.js'

const groupRole = (request) => getRole(String(request.headers['x-simkoll-code'] || ''))

async function findProfile(username) {
  const result = await supabaseRequest(`profiles?username=eq.${encodeURIComponent(username)}&select=*&limit=1`)
  if (!result.ok) throw new Error(`Profile lookup failed: ${result.status} ${await result.text()}`)
  return (await result.json())[0] || null
}

async function updateProfile(id, values) {
  const result = await supabaseRequest(`profiles?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(values),
  })
  if (!result.ok) throw new Error(`Profile update failed: ${result.status} ${await result.text()}`)
  return (await result.json())[0]
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      if (groupRole(request) === 'coach') {
        if (request.query?.tempusResults === 'true') {
          const result = await supabaseRequest('competition_results?select=*&order=result_date.desc&limit=10000')
          if (!result.ok) throw new Error(`Competition results GET failed: ${result.status} ${await result.text()}`)
          return sendJson(response, 200, { results: await result.json() })
        }
        const result = await supabaseRequest('profiles?select=id,username,display_name,emoji,training_group,tempus_id,active,approval_status,is_test_profile,created_at&active=eq.true&order=display_name.asc')
        if (!result.ok) throw new Error(`Profiles GET failed: ${result.status} ${await result.text()}`)
        const profiles = (await result.json()).map(publicProfile)
        return sendJson(response, 200, { profiles: profiles.filter((item) => item.approvalStatus === 'approved'), pendingProfiles: profiles.filter((item) => item.approvalStatus === 'pending') })
      }
      const profile = await getSessionProfile(request)
      if (!profile) return sendJson(response, 401, { error: 'Inte inloggad.' })
      if (request.query?.directory === 'true') {
        const result = await supabaseRequest(`profiles?id=neq.${profile.id}&active=eq.true&select=id,display_name,emoji&order=display_name.asc`)
        if (!result.ok) throw new Error(`Directory GET failed: ${result.status}`)
        return sendJson(response, 200, { profiles: (await result.json()).map((item) => ({ id: item.id, displayName: item.display_name, emoji: item.emoji })) })
      }
      return sendJson(response, 200, { profile: publicProfile(profile) })
    }

    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
    const action = request.body?.action

    if (action === 'create') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs för att skapa en profil.' })
      const username = normalizeUsername(request.body.username)
      const displayName = String(request.body.displayName || '').trim()
      const emoji = String(request.body.emoji || '🏊').slice(0, 16)
      const pin = String(request.body.pin || '')
      if (!validUsername(username)) return sendJson(response, 400, { error: 'Användarnamnet behöver vara 3–24 tecken: bokstäver, siffror, punkt, streck eller understreck.' })
      if (!displayName || displayName.length > 40) return sendJson(response, 400, { error: 'Välj ett namn med högst 40 tecken.' })
      if (!validPin(pin)) return sendJson(response, 400, { error: 'PIN-koden ska bestå av fyra siffror.' })
      const existing = await findProfile(username)
      if (existing) return sendJson(response, 409, { error: 'Användarnamnet är redan upptaget.' })
      const pinData = await hashPin(pin)
      const result = await supabaseRequest('profiles', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ username, display_name: displayName, emoji, pin_hash: pinData.hash, pin_salt: pinData.salt, approval_status: 'pending' }),
      })
      if (!result.ok) throw new Error(`Profile insert failed: ${result.status} ${await result.text()}`)
      const [profile] = await result.json()
      return sendJson(response, 202, { pending: true })
    }

    if (action === 'login') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs för att logga in.' })
      const username = normalizeUsername(request.body.username)
      const pin = String(request.body.pin || '')
      const profile = await findProfile(username)
      const genericError = { error: 'Fel användarnamn eller PIN-kod.' }
      if (!profile || !profile.active) return sendJson(response, 401, genericError)
      if (profile.locked_until && new Date(profile.locked_until) > new Date()) return sendJson(response, 429, { error: 'För många försök. Vänta 15 minuter och försök igen.' })
      if (!validPin(pin) || !(await verifyPin(pin, profile.pin_salt, profile.pin_hash))) {
        const attempts = profile.failed_attempts + 1
        await updateProfile(profile.id, { failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null })
        return sendJson(response, 401, genericError)
      }
      await updateProfile(profile.id, { failed_attempts: 0, locked_until: null })
      if (profile.approval_status === 'pending') return sendJson(response, 403, { error: 'Din profil väntar på godkännande från en tränare.' })
      if (profile.approval_status === 'rejected') return sendJson(response, 403, { error: 'Profilen har inte godkänts. Prata med en tränare.' })
      await createSession(response, profile.id)
      await touchProfileActivity(profile.id)
      return sendJson(response, 200, { profile: publicProfile(profile) })
    }

    if (action === 'logout') {
      await deleteCurrentSession(request)
      clearSessionCookie(response)
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'update-profile') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 403, { error: 'Endast simmaren kan ändra sin profil.' })
      const sessionProfile = await getSessionProfile(request)
      const displayName = String(request.body.displayName || '').trim()
      const emoji = String(request.body.emoji || '').trim().slice(0, 16)
      if (!sessionProfile) return sendJson(response, 401, { error: 'Profilen är inte längre inloggad.' })
      if (!displayName || displayName.length > 40) return sendJson(response, 400, { error: 'Välj ett namn med högst 40 tecken.' })
      if (!emoji || emoji.length > 16) return sendJson(response, 400, { error: 'Välj en emoji.' })
      const updated = await updateProfile(sessionProfile.id, { display_name: displayName, emoji })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-test-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra testprofilstatus.' })
      const profileId = String(request.body.profileId || '')
      if (!profileId) return sendJson(response, 400, { error: 'Profil saknas.' })
      const updated = await updateProfile(profileId, { is_test_profile: request.body.isTestProfile === true })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-training-group') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra träningsgrupp.' })
      const profileId = String(request.body.profileId || '')
      const allowed = ['ungdom_orange', 'ungdom_svart', 'junior']
      const trainingGroup = request.body.trainingGroup ? String(request.body.trainingGroup) : null
      if (!profileId || (trainingGroup && !allowed.includes(trainingGroup))) return sendJson(response, 400, { error: 'Ogiltig träningsgrupp.' })
      const updated = await updateProfile(profileId, { training_group: trainingGroup })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'set-tempus-id') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra Tempus-ID.' })
      const profileId = String(request.body.profileId || '')
      const rawId = String(request.body.tempusId || '').trim()
      if (!profileId || (rawId && !/^\d{1,12}$/.test(rawId))) return sendJson(response, 400, { error: 'Tempus-ID ska vara ett numeriskt ID.' })
      const updated = await updateProfile(profileId, { tempus_id: rawId || null })
      return sendJson(response, 200, { profile: publicProfile(updated) })
    }

    if (action === 'get-tempus-results') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan hämta Tempus-resultat.' })
      const tempusId = String(request.body.tempusId || '').trim()
      if (!/^\d{1,12}$/.test(tempusId)) return sendJson(response, 400, { error: 'Ogiltigt Tempus-ID.' })
      const from = new Date(); from.setFullYear(from.getFullYear() - 3)
      const to = new Date()
      const params = new URLSearchParams({ best_time_only: '0', from_date: from.toISOString().slice(0, 10), to_date: to.toISOString().slice(0, 10) })
      const page = await fetch(`https://www.tempusopen.se/swimmers/${tempusId}/swimming?${params}`)
      if (!page.ok) return sendJson(response, 502, { error: 'Tempus Open kunde inte hämtas just nu.' })
      const html = await page.text()
      const match = html.match(/data-page="([^\"]+)"/)
      if (!match) return sendJson(response, 502, { error: 'Tempus-resultaten kunde inte läsas.' })
      const decoded = match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')
      let pageData
      try { pageData = JSON.parse(decoded) } catch { return sendJson(response, 502, { error: 'Tempus-resultaten hade ett oväntat format.' }) }
      const swimmer = pageData.props?.swimmer || {}
      const byEvent = new Map()
      const allResults = [...(pageData.props?.results_short?.data || []), ...(pageData.props?.results_long?.data || [])]
      for (const item of allResults) {
        const pool = item.pool_type_name || ''
        const result = { event: item.event_name || '', date: item.result_date || '', time: item.swim_time || '', aquaPoints: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, pool, timeValue: Number(item.result_time) }
        if (!result.event || !result.date || !result.time) continue
        const key = `${result.event}|${result.pool}`
        const previous = byEvent.get(key)
        if (!previous || (Number.isFinite(result.timeValue) && result.timeValue < previous.timeValue)) byEvent.set(key, result)
      }
      const results = [...byEvent.values()].sort((a, b) => a.event.localeCompare(b.event, 'sv') || a.pool.localeCompare(b.pool, 'sv')).map(({ timeValue, ...result }) => result).slice(0, 100)
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 3)
      const historyMap = new Map()
      for (const item of allResults) {
        const date = String(item.result_date || '')
        if (!item.event_name || !item.swim_time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00`) < cutoff) continue
        const key = `${item.event_name}|${item.pool_type_name || ''}`
        if (!historyMap.has(key)) historyMap.set(key, { event: item.event_name, pool: item.pool_type_name || '', items: [] })
        historyMap.get(key).items.push({ date, time: item.swim_time, aquaPoints: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null })
      }
      const history = [...historyMap.values()].map((group) => ({ ...group, items: group.items.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => a.event.localeCompare(b.event, 'sv') || a.pool.localeCompare(b.pool, 'sv'))
      return sendJson(response, 200, { swimmer: { name: swimmer.name || '', license: swimmer.license || '', club: swimmer.club_name || '' }, results, history })
    }

    if (action === 'sync-tempus-results') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan synka Tempus-resultat.' })
      const requested = request.body.profileId ? [String(request.body.profileId)] : null
      const profilesResult = await supabaseRequest(`profiles?active=eq.true&approval_status=eq.approved&tempus_id=not.is.null&select=id,tempus_id${requested ? `&id=in.(${requested.join(',')})` : ''}`)
      if (!profilesResult.ok) throw new Error(`Tempus profiles lookup failed: ${profilesResult.status}`)
      let synced = 0, attempted = 0, failures = []
      for (const profile of await profilesResult.json()) {
        const from = new Date(); from.setFullYear(from.getFullYear() - 3)
        const to = new Date()
        const params = new URLSearchParams({ best_time_only: '0', from_date: from.toISOString().slice(0, 10), to_date: to.toISOString().slice(0, 10) })
        const page = await fetch(`https://www.tempusopen.se/swimmers/${profile.tempus_id}/swimming?${params}`)
        if (!page.ok) continue
        const html = await page.text(), match = html.match(/data-page="([^\"]+)"/)
        if (!match) continue
        let pageData
        try { pageData = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')) } catch { continue }
        const all = [...(pageData.props?.results_short?.data || []), ...(pageData.props?.results_long?.data || [])]
        const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 3)
        const rows = all.filter((item) => item.event_name && item.result_date && item.swim_time && new Date(`${item.result_date}T12:00:00`) >= cutoff).sort((a, b) => String(b.result_date).localeCompare(String(a.result_date))).slice(0, 500).map((item) => ({ profile_id: profile.id, event: item.event_name, competition_name: item.competition_name || null, pool: item.pool_type_name || null, result_date: item.result_date, swim_time: item.swim_time, result_time: Number.isFinite(Number(item.result_time)) ? Number(item.result_time) : null, aqua_points: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, synced_at: new Date().toISOString() }))
        attempted += rows.length
        if (rows.length) { const upsert = await supabaseRequest('competition_results?on_conflict=profile_id,event,pool,result_date,swim_time,competition_name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); if (upsert.ok) synced += rows.length; else failures.push(`${profile.id}: ${upsert.status} ${(await upsert.text()).slice(0, 180)}`) }
      }
      return sendJson(response, 200, { synced, attempted, failures })
    }

    if (action === 'delete-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ta bort profiler.' })
      const profileId = String(request.body.profileId || '')
      if (!profileId) return sendJson(response, 400, { error: 'Profil saknas.' })
      const result = await supabaseRequest(`profiles?id=eq.${profileId}`, { method: 'DELETE' })
      if (!result.ok) throw new Error(`Profile delete failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'approve-profile' || action === 'reject-profile') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan granska profiler.' })
      const profileId = String(request.body.profileId || '')
      const result = await supabaseRequest(`profiles?id=eq.${profileId}&approval_status=eq.pending`, action === 'approve-profile'
        ? { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ approval_status: 'approved' }) }
        : { method: 'DELETE', headers: { Prefer: 'return=representation' } })
      if (!result.ok) throw new Error(`Profile approval failed: ${result.status} ${await result.text()}`)
      if (!(await result.json()).length) return sendJson(response, 409, { error: 'Profilen är redan granskad.' })
      return sendJson(response, 200, { ok: true })
    }

    if (action === 'create-reset') {
      if (groupRole(request) !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan återställa en PIN-kod.' })
      const profileId = String(request.body.profileId || '')
      const resetCode = String(randomInt(10000000, 100000000))
      await supabaseRequest(`profile_reset_tokens?profile_id=eq.${profileId}&used_at=is.null`, { method: 'DELETE' })
      const result = await supabaseRequest('profile_reset_tokens', {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileId, token_hash: hashToken(resetCode), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      })
      if (!result.ok) throw new Error(`Reset insert failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 201, { resetCode, expiresInMinutes: 30 })
    }

    if (action === 'reset-pin') {
      if (groupRole(request) !== 'swimmer') return sendJson(response, 401, { error: 'Simmarkoden behövs.' })
      const username = normalizeUsername(request.body.username)
      const resetCode = String(request.body.resetCode || '').replace(/\s/g, '')
      const newPin = String(request.body.newPin || '')
      if (!validPin(newPin)) return sendJson(response, 400, { error: 'Den nya PIN-koden ska bestå av fyra siffror.' })
      const profile = await findProfile(username)
      if (!profile) return sendJson(response, 400, { error: 'Återställningskoden är inte giltig.' })
      const tokenResult = await supabaseRequest(`profile_reset_tokens?profile_id=eq.${profile.id}&token_hash=eq.${hashToken(resetCode)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`)
      if (!tokenResult.ok) throw new Error(`Reset lookup failed: ${tokenResult.status}`)
      const [token] = await tokenResult.json()
      if (!token) return sendJson(response, 400, { error: 'Återställningskoden är inte giltig eller har gått ut.' })
      const pinData = await hashPin(newPin)
      await updateProfile(profile.id, { pin_hash: pinData.hash, pin_salt: pinData.salt, failed_attempts: 0, locked_until: null })
      await supabaseRequest(`profile_reset_tokens?id=eq.${token.id}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) })
      await supabaseRequest(`profile_sessions?profile_id=eq.${profile.id}`, { method: 'DELETE' })
      return sendJson(response, 200, { ok: true })
    }

    return sendJson(response, 400, { error: 'Okänd åtgärd.' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Något gick fel. Försök igen.' })
  }
}
