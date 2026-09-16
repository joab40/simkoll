import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

function publicWorkout(item) {
  if (!item) return null
  return { id: item.id, date: item.workout_date, title: item.title, content: item.content, note: item.note || '', focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, targetGroups: item.target_groups || ['ungdom_orange', 'ungdom_svart', 'junior'], updatedAt: item.updated_at }
}
function publicPlan(item) {
  return { id: item.id, date: item.plan_date, activityType: item.activity_type, title: item.title, focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, targetGroups: item.target_groups || [], location: item.location || '', notes: item.notes || '', updatedAt: item.updated_at }
}

function parseWorkoutCsv(csv) {
  const parseCsvLine = (line) => { const cells = []; let value = ''; let quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1 } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(value.trim()); value = '' } else value += char } cells.push(value.trim()); return cells }
  const rows = csv.split(/\r?\n/).filter(Boolean).map(parseCsvLine)
  const valueAt = (row, index) => String(row?.[index] || '').trim()
  const header = rows.find((row) => /^träningspass/i.test(valueAt(row, 0))) || []
  const dateRow = rows.find((row) => /^datum/i.test(valueAt(row, 0))) || []
  const title = `${valueAt(header, 0).replace(/:$/, '')}${valueAt(header, 1) ? ` · ${valueAt(header, 1)}` : ''}`.slice(0, 80) || 'Hämtat träningspass'
  const contentRows = rows.filter((row) => { const first = valueAt(row, 0); const set = valueAt(row, 2); return (set || /^(insim|ben|spec|arm|avsim)/i.test(first)) && !/^träningspass|^datum|^nästa tävling|^summa|^tid/i.test(first) }).map((row) => { const section = valueAt(row, 0); const set = valueAt(row, 2); const details = [valueAt(row, 3), valueAt(row, 5), valueAt(row, 6)].filter(Boolean); if (!set) return section; return `${set}${details.length ? ` · ${details.join(' · ')}` : ''}` }).filter(Boolean)
  const competitionStart = rows.findIndex((row) => row.some((cell) => /nästa tävling/i.test(String(cell))))
  const competitions = competitionStart >= 0 ? rows.slice(competitionStart + 1).map((row) => row.map((cell) => String(cell || '').trim()).filter(Boolean)).filter((cells) => cells.length && !cells.some((cell) => /^(insim|datum|summa|tid)/i.test(cell))).slice(0, 6).map((cells) => cells.join(' · ')).filter((line) => /\d|tävling|swim|race|cup|games/i.test(line)) : []
  const totalRow = rows.find((row) => /^summa/i.test(valueAt(row, 0))) || []
  const timeIndex = rows.findIndex((row) => /^tid/i.test(valueAt(row, 0)))
  return { title, content: contentRows.join('\n').slice(0, 5000), note: `${competitions.length ? `Kommande tävlingar:\n${competitions.join('\n')}\n\n` : ''}Importerat från träningsmall${valueAt(dateRow, 1) ? ` · ${valueAt(dateRow, 1)}` : ''} – kontrollera uppgifterna före publicering.`.slice(0, 500), focus: '', distanceMeters: valueAt(totalRow, 2).replace(/\D/g, ''), durationMinutes: timeIndex >= 0 ? valueAt(rows[timeIndex + 1], 0).replace(/\D/g, '') : '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] }
}

function formatWorkoutLayout(content) {
  const section = /^(insim|uppvärmning|huvudserie|serie|ben|arm|spec|teknik|fart|avsim|nedvarvning|styrka)\b/i
  let inSection = false
  return String(content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const clean = line.replace(/^#+\s*/, '').replace(/^[-•]\s*/, '')
    if (section.test(clean) || (/^[^·]{1,42}:$/.test(clean) && !/\d/.test(clean))) { inSection = true; return clean.replace(/:$/, '') }
    return inSection ? `  ${clean}` : clean
  }).join('\n')
}

async function improveWorkoutWithAi(csv, fallback) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return fallback
  const prompt = `Du är en erfaren simtränare som redigerar ett träningspass från ett svenskt kalkylblad. Avgör själv vilken information som är viktig för att en simmare ska kunna genomföra passet och ta bort resten. Returnera endast giltig JSON utan markdown med exakt dessa nycklar: title (string max 80), content (string max 5000), coachMessage (string max 500, tom om ingen relevant information finns), distanceMeters (heltal eller null), durationMinutes (heltal eller null), focus (en av fart,troskel,syra,f2_frisim,f2_spec,distans,teknik,aterhamtning,kondition_frisim,kondition_special eller tom sträng).\n\nVIKTIGT OM URVAL:\n- Behåll insim/uppvärmning, huvudserie, teknik, ben/arm, avsim och andra delar som behövs för att förstå hela passet.\n- Leta särskilt efter rubriken "Nästa tävling". Om den finns ska du i coachMessage sammanfatta relevanta kommande tävlingar med namn, antal dagar kvar och datum. Skriv exempelvis "Kommande tävlingar:\\nSundsvall Swimgames · 4 dagar kvar · 19/09/2026". Hitta inte på uppgifter.\n- Ta bort tävlingskalendern från content, men använd den i coachMessage.\n- Ta bort datumrubriker, interna kolumnrubriker, tomma celler, summeringsrader och annan administration.\n- Gissa aldrig en serie, starttid, meter, tidsåtgång eller tävlingsuppgift.\n\nVIKTIGT OM ORDNING OCH FORMAT:\n- Behåll exakt källans ordning. Sortera aldrig serier eller starttider.\n- Starttid/startintervall ska alltid ligga på samma rad som serien den hör till.\n- Skriv avsnittsnamn på egen rad, följt av serierna på egna rader. Använd gärna formatet "## Huvudserie".\n- Använd vanlig text och separatorn " · " mellan delar på samma rad. Exempel: "8x50 frisim · fenor · start 1:00".\n- Skriv inte förklarande text utanför själva passet.\n\nKÄLLDATA (CSV):\n${csv.slice(0, 24000)}`
  try {
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) return fallback
    const payload = await result.json()
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}')
    if (!parsed.title || !parsed.content) return fallback
    const formattedContent = formatWorkoutLayout(String(parsed.content).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim()).filter(Boolean).join('\n'))
    const coachMessage = typeof parsed.coachMessage === 'string' && parsed.coachMessage.trim() ? parsed.coachMessage.trim().slice(0, 500) : fallback.note
    return { ...fallback, title: String(parsed.title).slice(0, 80), content: formattedContent.slice(0, 5000), note: coachMessage, distanceMeters: Number.isInteger(parsed.distanceMeters) ? parsed.distanceMeters : fallback.distanceMeters, durationMinutes: Number.isInteger(parsed.durationMinutes) ? parsed.durationMinutes : fallback.durationMinutes, focus: typeof parsed.focus === 'string' ? parsed.focus : '' }
  } catch (error) {
    console.warn('Workout AI import fallback:', error.message)
    return fallback
  }
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Dagens pass visas bara för inloggade profiler.' })
      if (role === 'coach' && request.query?.planning === 'true') {
        const result = await supabaseRequest('training_plans?select=*&order=plan_date.asc&limit=200')
        if (!result.ok) throw new Error(`Training plans GET failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { plans: (await result.json()).map(publicPlan) })
      }
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
      if (request.body?.action === 'save-plan') {
        const body = request.body
        const date = String(body.date || '')
        const activityType = String(body.activityType || '')
        const title = String(body.title || '').trim()
        const targetGroups = Array.isArray(body.targetGroups) ? body.targetGroups.filter((group, index, groups) => ['ungdom_orange', 'ungdom_svart', 'junior'].includes(group) && groups.indexOf(group) === index) : []
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['swim', 'strength', 'dryland', 'competition'].includes(activityType) || !title || !targetGroups.length) return sendJson(response, 400, { error: 'Fyll i datum, aktivitet, rubrik och minst en grupp.' })
        const payload = { plan_date: date, activity_type: activityType, title: title.slice(0, 100), focus: String(body.focus || '').slice(0, 80) || null, distance_meters: body.distanceMeters ? Number(body.distanceMeters) : null, duration_minutes: body.durationMinutes ? Number(body.durationMinutes) : null, target_groups: targetGroups, location: String(body.location || '').slice(0, 120) || null, notes: String(body.notes || '').slice(0, 500) || null, updated_at: new Date().toISOString() }
        const endpoint = body.id ? `training_plans?id=eq.${body.id}` : 'training_plans'
        const result = await supabaseRequest(endpoint, { method: body.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!result.ok) throw new Error(`Training plan save failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { plan: publicPlan((await result.json())[0]) })
      }
      if (request.body?.action === 'import-sheet') {
        const sheetUrl = String(request.body.url || '')
        const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
        if (!match) return sendJson(response, 400, { error: 'Ange en giltig Google Sheets-länk.' })
        const source = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`)
        if (!source.ok) return sendJson(response, 502, { error: 'Kunde inte läsa träningsmallen.' })
        const text = await source.text()
        const fallback = parseWorkoutCsv(text)
        const draft = await improveWorkoutWithAi(text, fallback)
        return sendJson(response, 200, { draft })
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
      if (request.query?.planning === 'true') {
        const id = String(request.query?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Planeringsaktivitet saknas.' })
        const result = await supabaseRequest(`training_plans?id=eq.${id}`, { method: 'DELETE' })
        if (!result.ok) throw new Error(`Training plan DELETE failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { ok: true })
      }
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
