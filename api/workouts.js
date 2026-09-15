import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

function publicWorkout(item) {
  if (!item) return null
  return { id: item.id, date: item.workout_date, title: item.title, content: item.content, note: item.note || '', focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, targetGroups: item.target_groups || ['ungdom_orange', 'ungdom_svart', 'junior'], updatedAt: item.updated_at }
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Dagens pass visas bara för inloggade profiler.' })
      if (role === 'coach' && request.query?.history === 'true') {
        const result = await supabaseRequest('daily_workouts?select=*&order=workout_date.desc&limit=200')
        if (!result.ok) throw new Error(`Workout history GET failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { workouts: (await result.json()).map(publicWorkout) })
      }
      const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(request.query?.date || '') ? request.query.date : stockholmDate()
      const result = await supabaseRequest(`daily_workouts?workout_date=eq.${requestedDate}&select=*&limit=1`)
      if (!result.ok) throw new Error(`Workout GET failed: ${result.status} ${await result.text()}`)
      const workout = (await result.json())[0] || null
      if (profile) {
        if (workout?.target_groups?.length && profile.training_group && !workout.target_groups.includes(profile.training_group)) return sendJson(response, 200, { workout: null, locked: false })
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
      if (request.body?.action === 'import-sheet') {
        const sheetUrl = String(request.body.url || '')
        const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
        if (!match) return sendJson(response, 400, { error: 'Ange en giltig Google Sheets-länk.' })
        const source = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`)
        if (!source.ok) return sendJson(response, 502, { error: 'Kunde inte läsa träningsmallen.' })
        const text = await source.text()
        const parseCsvLine = (line) => { const cells = []; let value = ''; let quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1 } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value.trim()); value = '' } else value += char } cells.push(value.trim()); return cells }
        const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine)
        const valueAt = (row, index) => String(row?.[index] || '').trim()
        const header = rows.find((row) => /^träningspass/i.test(valueAt(row, 0))) || []
        const dateRow = rows.find((row) => /^datum/i.test(valueAt(row, 0))) || []
        const title = `${valueAt(header, 0).replace(/:$/, '')}${valueAt(header, 1) ? ` · ${valueAt(header, 1)}` : ''}`.slice(0, 80) || 'Hämtat träningspass'
        const contentRows = rows.filter((row) => { const first = valueAt(row, 0); const set = valueAt(row, 2); return (set || /^(insim|ben|spec|arm|avsim)/i.test(first)) && !/^träningspass|^datum|^nästa tävling|^summa|^tid/i.test(first) }).map((row) => { const section = valueAt(row, 0); const set = valueAt(row, 2); const details = [valueAt(row, 3), valueAt(row, 5), valueAt(row, 6)].filter(Boolean); if (!set) return section; return `${set}${details.length ? ` · ${details.join(' · ')}` : ''}` }).filter(Boolean)
        const content = contentRows.join('\n').slice(0, 5000)
        const totalRow = rows.find((row) => /^summa/i.test(valueAt(row, 0))) || []
        const distance = valueAt(totalRow, 2).replace(/\D/g, '')
        const timeIndex = rows.findIndex((row) => /^tid/i.test(valueAt(row, 0)))
        const durationMinutes = timeIndex >= 0 ? valueAt(rows[timeIndex + 1], 0).replace(/\D/g, '') : ''
        const targetGroups = ['ungdom_orange', 'ungdom_svart', 'junior']
        return sendJson(response, 200, { draft: { title, content, note: `Importerat från träningsmall${valueAt(dateRow, 1) ? ` · ${valueAt(dateRow, 1)}` : ''} – kontrollera uppgifterna före publicering.`, focus: '', distanceMeters: distance, durationMinutes, targetGroups } })
      }
      const date = String(request.body?.date || stockholmDate())
      const title = String(request.body?.title || '').trim()
      const content = String(request.body?.content || '').trim()
      const note = String(request.body?.note || '').trim()
      const focus = String(request.body?.focus || '').trim()
      const distanceMeters = request.body?.distanceMeters === '' || request.body?.distanceMeters == null ? null : Number(request.body.distanceMeters)
      const durationMinutes = request.body?.durationMinutes === '' || request.body?.durationMinutes == null ? null : Number(request.body.durationMinutes)
      const targetGroups = Array.isArray(request.body?.targetGroups) ? request.body.targetGroups.map(String).filter((group, index, groups) => ['ungdom_orange', 'ungdom_svart', 'junior'].includes(group) && groups.indexOf(group) === index) : []
      const validFocus = ['', 'fart', 'troskel', 'syra', 'f2_frisim', 'f2_spec', 'distans', 'teknik', 'aterhamtning', 'kondition_frisim', 'kondition_special'].includes(focus)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title || title.length > 80 || !content || content.length > 5000 || note.length > 500 || !validFocus || !targetGroups.length || (distanceMeters !== null && (!Number.isInteger(distanceMeters) || distanceMeters < 1 || distanceMeters > 50000)) || (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600))) {
        return sendJson(response, 400, { error: 'Kontrollera datum, rubrik och passbeskrivning.' })
      }
      const result = await supabaseRequest('daily_workouts?on_conflict=workout_date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ workout_date: date, title, content, note: note || null, focus: focus || null, distance_meters: distanceMeters, duration_minutes: durationMinutes, target_groups: targetGroups, updated_at: new Date().toISOString() }),
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
