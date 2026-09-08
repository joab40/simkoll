import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

function publicWorkout(item) {
  if (!item) return null
  return { id: item.id, date: item.workout_date, title: item.title, content: item.content, note: item.note || '', focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, updatedAt: item.updated_at }
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Dagens pass visas bara för inloggade profiler.' })
      const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(request.query?.date || '') ? request.query.date : stockholmDate()
      const result = await supabaseRequest(`daily_workouts?workout_date=eq.${requestedDate}&select=*&limit=1`)
      if (!result.ok) throw new Error(`Workout GET failed: ${result.status} ${await result.text()}`)
      const workout = (await result.json())[0] || null
      if (profile) {
        await touchProfileActivity(profile.id)
        const unlockResult = await supabaseRequest(`workout_unlocks?profile_id=eq.${profile.id}&workout_date=eq.${requestedDate}&select=profile_id&limit=1`)
        if (!unlockResult.ok) throw new Error(`Unlock GET failed: ${unlockResult.status} ${await unlockResult.text()}`)
        const unlocked = (await unlockResult.json()).length > 0
        if (workout && !unlocked) return sendJson(response, 200, { workout: null, locked: true })
      }
      return sendJson(response, 200, { workout: publicWorkout(workout), locked: false })
    }

    if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra dagens pass.' })

    if (request.method === 'POST') {
      const date = String(request.body?.date || stockholmDate())
      const title = String(request.body?.title || '').trim()
      const content = String(request.body?.content || '').trim()
      const note = String(request.body?.note || '').trim()
      const focus = String(request.body?.focus || '').trim()
      const distanceMeters = request.body?.distanceMeters === '' || request.body?.distanceMeters == null ? null : Number(request.body.distanceMeters)
      const durationMinutes = request.body?.durationMinutes === '' || request.body?.durationMinutes == null ? null : Number(request.body.durationMinutes)
      const validFocus = ['', 'fart', 'troskel', 'syra', 'f2_frisim', 'f2_spec', 'distans', 'teknik', 'aterhamtning', 'kondition_frisim', 'kondition_special'].includes(focus)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || title.length > 80 || !content || content.length > 5000 || note.length > 500 || !validFocus || (distanceMeters !== null && (!Number.isInteger(distanceMeters) || distanceMeters < 1 || distanceMeters > 50000)) || (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600))) {
        return sendJson(response, 400, { error: 'Kontrollera datum, rubrik och passbeskrivning.' })
      }
      const result = await supabaseRequest('daily_workouts?on_conflict=workout_date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ workout_date: date, title, content, note: note || null, focus: focus || null, distance_meters: distanceMeters, duration_minutes: durationMinutes, updated_at: new Date().toISOString() }),
      })
      if (!result.ok) throw new Error(`Workout POST failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { workout: publicWorkout((await result.json())[0]) })
    }

    if (request.method === 'DELETE') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(request.query?.date || '') ? request.query.date : stockholmDate()
      const result = await supabaseRequest(`daily_workouts?workout_date=eq.${date}`, { method: 'DELETE' })
      if (!result.ok) throw new Error(`Workout DELETE failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { ok: true })
    }

    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta dagens pass. Försök igen.' })
  }
}
