import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints, getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

const numberFields = {
  feeling: [1, 5], energy: [1, 5], body: [1, 5], motivation: [1, 5],
  sleep: [1, 5], rpe: [1, 10], pass: [1, 5], setup: [1, 5],
}

function validate(body) {
  if (!['before', 'after', 'rest'].includes(body.type)) return false
  if (!Number.isInteger(body.feeling) || body.feeling < 1 || body.feeling > 5) return false
  if (body.pass != null && ![1, 3, 5].includes(body.pass)) return false
  if (body.setup != null && ![1, 3, 5].includes(body.setup)) return false
  return Object.entries(numberFields).every(([key, [min, max]]) =>
    body[key] == null || (Number.isInteger(body[key]) && body[key] >= min && body[key] <= max)
  )
}

function toDatabase(response, profileId) {
  return {
    day_type: response.type,
    feeling: response.feeling,
    energy: response.energy ?? null,
    body: response.body ?? null,
    motivation: response.motivation ?? null,
    sleep: response.sleep ?? null,
    rpe: response.rpe ?? null,
    pass_rating: response.pass ?? null,
    setup_rating: response.setup ?? null,
    comment: response.comment?.trim().slice(0, 300) || null,
    profile_id: profileId || null,
  }
}

function fromDatabase(response, includeDetails) {
  const base = { id: response.id, createdAt: response.created_at, feeling: response.feeling }
  if (!includeDetails) return base
  return {
    ...base,
    type: response.day_type,
    energy: response.energy,
    body: response.body,
    motivation: response.motivation,
    sleep: response.sleep,
    rpe: response.rpe,
    pass: response.pass_rating,
    setup: response.setup_rating,
    comment: response.comment || '',
    profileId: response.profile_id || null,
  }
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)
  if (!role) return sendJson(response, 401, { error: 'Du behöver logga in igen.' })

  try {
    if (request.method === 'GET') {
      const wantsOwn = request.query?.mine === 'true'
      const sessionProfile = wantsOwn ? await getSessionProfile(request) : null
      if (wantsOwn && !sessionProfile) return sendJson(response, 401, { error: 'Logga in på din profil igen.' })
      const isDetailed = role === 'coach' || Boolean(sessionProfile)
      const select = isDetailed ? '*' : 'id,created_at,feeling'
      const recent = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const filter = sessionProfile ? `&profile_id=eq.${sessionProfile.id}` : role === 'coach' ? '' : `&created_at=gte.${encodeURIComponent(recent)}`
      const result = await supabaseRequest(`responses?select=${select}${filter}&order=created_at.desc&limit=2000`)
      if (!result.ok) throw new Error(`Supabase GET failed: ${result.status} ${await result.text()}`)
      const rows = await result.json()
      return sendJson(response, 200, { responses: rows.map((item) => fromDatabase(item, isDetailed)) })
    }

    if (request.method === 'POST') {
      if (!validate(request.body || {})) return sendJson(response, 400, { error: 'Svaret innehåller ogiltiga värden.' })
      const sessionProfile = await getSessionProfile(request)
      const profile = request.body?.identified ? sessionProfile : null
      if (request.body?.identified && !sessionProfile) return sendJson(response, 401, { error: 'Logga in på profilen igen eller svara anonymt.' })
      const result = await supabaseRequest('responses', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toDatabase(request.body, profile?.id)),
      })
      if (!result.ok) throw new Error(`Supabase POST failed: ${result.status} ${await result.text()}`)
      const [created] = await result.json()
      if (sessionProfile) {
        await touchProfileActivity(sessionProfile.id)
        await awardPoints(sessionProfile.id, 'checkin', 3, stockholmDate())
        const unlockResult = await supabaseRequest('workout_unlocks?on_conflict=profile_id,workout_date', {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify({ profile_id: sessionProfile.id, workout_date: stockholmDate() }),
        })
        if (!unlockResult.ok) console.error(`Workout unlock failed: ${unlockResult.status} ${await unlockResult.text()}`)
        if (request.body.type === 'after' && request.body.registerTraining === true) {
          const slot = ['morning_swim', 'afternoon_swim'].includes(request.body.trainingSlot) ? request.body.trainingSlot : 'afternoon_swim'
          const trainingResult = await supabaseRequest('personal_training_sessions', {
            method: 'POST', body: JSON.stringify({ profile_id: sessionProfile.id, activity_type: 'swim', session_slot: slot, session_date: stockholmDate(), source: 'checkin' }),
          })
          if (!trainingResult.ok && trainingResult.status !== 409) console.error(`Training registration failed: ${trainingResult.status} ${await trainingResult.text()}`)
        }
      }
      return sendJson(response, 201, { response: fromDatabase(created, role === 'coach') })
    }

    if (request.method === 'DELETE' && role === 'coach') {
      const result = await supabaseRequest('responses?id=not.is.null', { method: 'DELETE' })
      if (!result.ok) throw new Error(`Supabase DELETE failed: ${result.status} ${await result.text()}`)
      return sendJson(response, 200, { ok: true })
    }

    return sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte kontakta databasen. Försök igen.' })
  }
}
