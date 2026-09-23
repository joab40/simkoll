import { aiAvailability, getRole, isAiEnabled, sendJson, supabaseRequest } from '../server/supabase.js'
import { writeAiUsage } from '../server/audit.js'
import { getSessionProfile, stockholmDate, touchProfileActivity } from '../server/profile-auth.js'

function publicWorkout(item) {
  if (!item) return null
  return { id: item.id, date: item.workout_date, title: item.title, content: item.content, note: item.note || '', focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, targetGroups: item.target_groups || ['ungdom_orange', 'ungdom_svart', 'junior'], updatedAt: item.updated_at }
}
function publicPlan(item) {
  return { id: item.id, date: item.plan_date, activityType: item.activity_type, title: item.title, focus: item.focus || '', distanceMeters: item.distance_meters || null, durationMinutes: item.duration_minutes || null, timeOfDay: item.time_of_day || '', targetGroups: item.target_groups || [], location: item.location || '', notes: item.notes || '', sourceWorkoutId: item.source_workout_id || null, syncStatus: item.sync_status || 'manual', syncedAt: item.synced_at || null, updatedAt: item.updated_at }
}
function publicCompetition(item) {
  return { id: item.id, startDate: item.start_date, endDate: item.end_date, title: item.title, category: item.category || '', location: item.location || '', targetGroups: item.target_groups || [], notes: item.notes || '', updatedAt: item.updated_at }
}
function publicCoachNote(item) {
  return { id: item.id, noteDate: item.note_date, activityType: item.activity_type, activityId: item.activity_id || null, scopeKey: item.scope_key, content: item.content, createdAt: item.created_at, updatedAt: item.updated_at }
}

async function polishCoachNote(request, content, noteDate, activityLabel = '') {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { text: content, usedAi: false }
  const prompt = `Du är en erfaren simtränarassistent och redaktör. En tränare sammanfattar och analyserar en grupp ungdoms- och juniorsimmare efter ett träningspass eller en tävlingsdag. Förbättra tränarens utkast på svenska så att det blir tydligt, nyanserat och användbart för tränare och gruppens fortsatta planering.

Gör så här:
- Behåll alla konkreta fakta, siffror, observationer och namn som finns i utkastet.
- Tolka tränarens stödord när det är rimligt: koppla till exempel ihop passets inriktning, teknisk kvalitet, fart, RPE/upplevd ansträngning, återhämtning, närvaro och gruppens energi om tränaren nämner sådant.
- Formulera försiktiga slutsatser och mönster som hypoteser, till exempel “det kan tyda på…” eller “det är värt att följa upp…”. Gör inte en gissning till ett faktum.
- Lyft gärna vad som fungerade bra, vad som kan utvecklas och vad tränaren kan ta med till nästa pass.
- Använd simspecifika ord korrekt, till exempel insim, huvudserie, fart, tröskel, teknik, starter, vändningar, undervattensarbete och återhämtning.
- Skriv som en professionell men mänsklig tränare, inte som en myndighetsrapport. En kort rubrik följd av 2–5 tydliga stycken eller punktlistor fungerar bra.
- Hitta aldrig på tider, meter, resultat, orsaker, sjukdomar eller individuella egenskaper som inte finns i texten. Dra inga medicinska slutsatser.
- Om underlaget är tunt, skriv hellre “utifrån dagens anteckningar” än att fylla i med antaganden.

Datum: ${noteDate}
Aktivitet: ${activityLabel || 'dagens aktivitet'}
Tränarens utkast:
${String(content).slice(0, 5000)}

Returnera endast JSON med exakt nyckeln text.`
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown. Du är kunnig om simträning men får aldrig hitta på fakta.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'coach_summary', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { text: content, usedAi: false } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'coach_summary', model, role: 'coach', response: payload })
    const raw = String(payload.choices?.[0]?.message?.content || '{}')
    const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
    const parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
    const text = String(parsed.text || '').trim().slice(0, 5000)
    return { text: text || content, usedAi: Boolean(text) }
  } catch (error) {
    console.warn('Coach note AI fallback:', error.message)
    return { text: content, usedAi: false }
  }
}

async function transcribeAudio(request, dataUrl, mimeType) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'OPENAI_API_KEY saknas.' }
  const encoded = String(dataUrl || '').split(',')[1]
  if (!encoded || encoded.length > 5_500_000) return { error: 'Ljudfilen är för stor. Spela in en kortare sammanfattning.' }
  try {
    const bytes = Buffer.from(encoded, 'base64')
    const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
    const form = new FormData()
    const audioType = mimeType || 'audio/webm'
    const extension = audioType.includes('mp4') ? 'mp4' : audioType.includes('ogg') ? 'ogg' : audioType.includes('wav') ? 'wav' : 'webm'
    form.append('file', new Blob([bytes], { type: audioType }), `coach-summary.${extension}`)
    form.append('model', model)
    form.append('language', 'sv')
    const result = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
    if (!result.ok) { await writeAiUsage(request, { feature: 'audio_transcription', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { error: 'Transkriberingen kunde inte genomföras.' } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'audio_transcription', model, role: 'coach', response: payload })
    return { text: String(payload.text || '').trim() }
  } catch (error) { console.warn('Audio transcription failed:', error.message); return { error: 'Transkriberingen kunde inte läsas.' } }
}

async function polishWorkoutContent(request, content, title = '', focus = '') {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { text: content, usedAi: false }
  const prompt = 'Du är en erfaren svensk simtränare och redaktör. Förbättra formateringen av följande simträningspass. Behåll exakt alla fakta, meter, tider, intervall, simsätt och instruktioner. Hitta aldrig på eller ta bort träningsinnehåll. Behåll 2x/3x, klamrar, parenteser och indrag. Rubriker som BEN:, ARM:, INSIM:, SPEC:, HUVUDSERIE: och AVSIM: ska stå på egna rader. Lägg varje serie på en egen rad och starttider sist på samma rad som serien. Använd vanliga radbrytningar, inte markdown-tabeller. Returnera endast passtexten.\n\nRubrik: ' + title + '\nInriktning: ' + focus + '\nRåtext:\n' + String(content).slice(0, 5000)
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.1, max_tokens: 1200, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Returnera alltid strikt JSON med exakt nyckeln text.' }, { role: 'user', content: `${prompt}\n\nReturnera JSON: {"text":"..."}` }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'workout_text_polish', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { text: content, usedAi: false } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'workout_text_polish', model, role: 'coach', response: payload })
    const raw = String(payload.choices?.[0]?.message?.content || '{}'), first = raw.indexOf('{'), last = raw.lastIndexOf('}')
    const parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
    const text = String(parsed.text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 5000)
    return { text: text || content, usedAi: Boolean(text) }
  } catch (error) { console.warn('Workout text AI fallback:', error.message); return { text: content, usedAi: false } }
}

async function interpretWorkoutAttachment(request, fileData, mimeType, fileName = '') {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'OPENAI_API_KEY saknas.' }
  if (!/^image\/(png|jpe?g|webp)$/i.test(mimeType)) return { error: 'Bildtolkning stöder PNG, JPG och WebP. För dokument: kopiera texten till huvudserien eller använd Google Drive-importen.' }
  const prompt = 'Tolka bilden av ett svenskt simträningspass. Returnera strikt JSON med title, content, note, distanceMeters, durationMinutes och focus. Behåll alla serier, 2x/3x-klamrar, indrag, starttider och ordningen. Skriv content som ren text med rubriker på egna rader och varje serie på egen rad. Hitta inte på något som inte syns. Skriv kommande tävlingar i note om de syns. Filnamn: ' + fileName
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1400, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON.' }, { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: fileData, detail: 'high' } }] }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'workout_image_import', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { error: 'Bildtolkningen kunde inte genomföras.' } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'workout_image_import', model, role: 'coach', response: payload })
    const raw = String(payload.choices?.[0]?.message?.content || '{}'), first = raw.indexOf('{'), last = raw.lastIndexOf('}')
    const parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw)
    return { draft: { title: String(parsed.title || 'Importerat träningspass').slice(0, 80), content: String(parsed.content || '').slice(0, 5000), note: String(parsed.note || '').slice(0, 500), distanceMeters: Number.isInteger(parsed.distanceMeters) ? parsed.distanceMeters : '', durationMinutes: Number.isInteger(parsed.durationMinutes) ? parsed.durationMinutes : '', focus: typeof parsed.focus === 'string' ? parsed.focus : '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] } }
  } catch (error) { console.warn('Workout image AI fallback:', error.message); return { error: 'Bildtolkningen kunde inte läsas.' } }
}

function parseSportAdminIcs(source) {
  const lines = String(source || '').replace(/\r\n[ \t]/g, '').split(/\r?\n/), events = []
  let event = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = {}; continue }
    if (line === 'END:VEVENT') { if (event?.date && event.title) events.push({ ...event, id: `sportadmin-${events.length}-${event.date}-${event.title}` }); event = null; continue }
    if (!event) continue
    const separator = line.indexOf(':'); if (separator < 0) continue
    const key = line.slice(0, separator).split(';')[0], value = line.slice(separator + 1).replace(/\\n/g, '\n').replace(/\\,/g, ',').trim()
    if (key === 'SUMMARY') event.title = value
    if (key === 'LOCATION') event.location = value
    if (key === 'DESCRIPTION') event.notes = value
    if (key === 'DTSTART') { const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); if (match) { event.date = `${match[1]}-${match[2]}-${match[3]}`; event.time = match[4] ? `${match[4]}:${match[5]}` : '' } }
  }
  return events.slice(0, 300)
}

async function syncPlanningFromWorkout(workout) {
  const date = workout.workout_date
  const existing = await supabaseRequest(`training_plans?plan_date=eq.${date}&activity_type=eq.swim&select=*&limit=1`)
  if (!existing.ok) return
  const current = (await existing.json())[0]
  const payload = { title: workout.title || 'Simning', focus: workout.focus || null, distance_meters: workout.distance_meters || null, duration_minutes: workout.duration_minutes || null, target_groups: workout.target_groups || [], source_workout_id: workout.id, sync_status: 'linked', synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  if (!current) await supabaseRequest('training_plans', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan_date: date, activity_type: 'swim', ...payload }) })
  else if (current.sync_status === 'linked' || current.source_workout_id === workout.id) await supabaseRequest(`training_plans?id=eq.${current.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  else if (current.source_workout_id) await supabaseRequest(`training_plans?id=eq.${current.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sync_status: 'changed', synced_at: new Date().toISOString() }) })
}
async function backfillPlanningFromWorkouts(plans) {
  const workoutsResult = await supabaseRequest('daily_workouts?select=*&order=workout_date.asc&limit=200')
  if (!workoutsResult.ok) return plans
  const workouts = await workoutsResult.json()
  const existingDates = new Set(plans.filter((item) => item.activity_type === 'swim').map((item) => item.plan_date))
  await Promise.all(workouts.filter((workout) => !existingDates.has(workout.workout_date)).map((workout) => syncPlanningFromWorkout(workout)))
  const competitionsResult = await supabaseRequest('competition_calendar?select=*&order=start_date.asc&limit=100')
  const competitions = competitionsResult.ok ? await competitionsResult.json() : []
  const planDates = new Set(plans.map((item) => `${item.plan_date}:${item.activity_type}`))
  await Promise.all(competitions.flatMap((competition) => {
    const start = new Date(`${competition.start_date}T12:00:00`), end = new Date(`${competition.end_date}T12:00:00`), entries = []
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) { const date = day.toISOString().slice(0, 10); if (!planDates.has(`${date}:competition`)) entries.push(supabaseRequest('training_plans', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan_date: date, activity_type: 'competition', title: competition.title, target_groups: competition.target_groups, location: competition.location, notes: competition.notes, updated_at: new Date().toISOString() }) })) }
    return entries
  }))
  if (!workouts.some((workout) => !existingDates.has(workout.workout_date)) && !competitions.length) return plans
  const refreshed = await supabaseRequest('training_plans?select=*&order=plan_date.asc&limit=200')
  return refreshed.ok ? await refreshed.json() : plans
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
  let lastSection = ''
  return String(content || '').split(/\r?\n/).map((line) => line.replace(/\t/g, '  ').replace(/\s+$/, '')).filter((line) => line.trim()).map((line) => {
    const leading = line.match(/^\s*/)?.[0] || ''
    const clean = line.trim().replace(/^#+\s*/, '').replace(/^[-•]\s*/, '')
    if (section.test(clean) || (/^[^·]{1,42}:$/.test(clean) && !/\d/.test(clean))) {
      const heading = clean.replace(/:$/, '')
      if (heading.toLowerCase() === lastSection) return ''
      lastSection = heading.toLowerCase(); inSection = true; return heading
    }
    return `${leading || (inSection ? '  ' : '')}${clean}`
  }).filter(Boolean).join('\n')
}

async function improveWorkoutWithAi(request, csv, fallback) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return fallback
  const prompt = `Du är en erfaren simtränare som redigerar ett träningspass från ett svenskt kalkylblad. Avgör själv vilken information som är viktig för att en simmare ska kunna genomföra passet och ta bort resten. Returnera endast giltig JSON utan markdown med exakt dessa nycklar: title (string max 80), content (string max 5000), coachMessage (string max 500, tom om ingen relevant information finns), distanceMeters (heltal eller null), durationMinutes (heltal eller null), focus (en av fart,troskel,syra,f2_frisim,f2_spec,distans,teknik,aterhamtning,kondition_frisim,kondition_special eller tom sträng).\n\nVIKTIGT OM URVAL:\n- Behåll insim/uppvärmning, huvudserie, teknik, ben/arm, avsim och andra delar som behövs för att förstå hela passet.\n- Leta särskilt efter rubriken "Nästa tävling". Om den finns ska du i coachMessage sammanfatta relevanta kommande tävlingar med namn, antal dagar kvar och datum. Skriv exempelvis "Kommande tävlingar:\\nSundsvall Swimgames · 4 dagar kvar · 19/09/2026". Hitta inte på uppgifter.\n- Ta bort tävlingskalendern från content, men använd den i coachMessage.\n- Ta bort datumrubriker, interna kolumnrubriker, tomma celler, summeringsrader och annan administration.\n- Gissa aldrig en serie, starttid, meter, tidsåtgång eller tävlingsuppgift.\n\nVIKTIGT OM ORDNING OCH FORMAT:\n- Behåll exakt källans ordning. Sortera aldrig serier eller starttider.\n- Starttid/startintervall ska alltid ligga på samma rad som serien den hör till.\n- Skriv avsnittsnamn på egen rad, följt av serierna på egna rader. Använd gärna formatet "## Huvudserie".\n- Använd vanlig text och separatorn " · " mellan delar på samma rad. Exempel: "8x50 frisim · fenor · start 1:00".\n- Skriv inte förklarande text utanför själva passet.\n\nKÄLLDATA (CSV):\n${csv.slice(0, 24000)}`
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const enrichedPrompt = `${prompt}\n\nExtra layoutregler: Tolk 2x/3x och klamrar som blockstruktur, inte som löptext. Skriv exempelvis "3 x [" på egen rad och behåll blockets rader indragna med två blanksteg tills klammern stängs. Behåll även underblock som 2x inne i större block. Om flera celler hör till samma serie ska de ligga på samma rad med " · ". En starttid ska alltid ligga sist på serien den hör till och får aldrig bli en fristående rad. Behåll exakt ordning och skilj större avsnitt tydligt.`
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON.' }, { role: 'user', content: enrichedPrompt }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'workout_import', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return fallback }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'workout_import', model, role: 'coach', response: payload })
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

async function generateWorkoutFromLibrary(request, options = {}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'OPENAI_API_KEY saknas.' }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const focus = String(options.focus || '').slice(0, 80)
  const groupLabels = Array.isArray(options.groups) ? options.groups.slice(0, 3).join(', ') : ''
  const distance = Number(options.distanceMeters || 0)
  const duration = Number(options.durationMinutes || 0)
  const rpe = String(options.rpe || '6–7').slice(0, 20)
  const library = Array.isArray(options.library) ? options.library.slice(0, 8) : []
  const sourceText = library.map((item, index) => `PASS ${index + 1}\nRubrik: ${String(item.title || '').slice(0, 100)}\nInriktning: ${String(item.focus || '').slice(0, 80)}\nMeter: ${item.distanceMeters || 'saknas'}\nTid: ${item.durationMinutes || 'saknas'} min\nPassbetyg: ${item.pass ?? 'saknas'} / 5\nRPE: ${item.rpe ?? 'saknas'} / 10\nInnehåll:\n${String(item.content || '').slice(0, 4500)}`).join('\n\n')
  const prompt = `Du är en erfaren svensk simtränare. Skapa ett förslag på ett nytt simpass genom att kombinera bra idéer från tidigare genomförda pass i biblioteket. Detta är ett redigerbart utkast för tränaren, inte ett publicerat pass.

Krav:
- Huvudinriktning: ${focus || 'välj en rimlig inriktning utifrån underlaget'}
- Grupper: ${groupLabels || 'alla grupper'}
- Önskad distans: ${distance || 'anpassa efter underlaget'} meter
- Tidsåtgång: ${duration || 'anpassa efter underlaget'} minuter
- Mål-RPE: ${rpe}
- Prioritera alltid tidigare pass med högt passbetyg. Använd RPE som näst viktigaste kvalitetsfilter och håll belastningen rimlig för vald tid och distans.
- Ta med tydliga starttider på serierna. Om underlaget innehåller starttider, använd dem som förebild; skapa annars realistiska, tydligt markerade startintervall som passar serien.
- Behåll simspecifik struktur med insim, teknik/ben/arm när det passar, huvudserie och avsim. Använd klamrar och indrag på ett lättläst sätt.
- Hitta inte på ett exakt tidigare resultat eller påstå att passet är evidensbaserat. Gör inga medicinska slutsatser.

Returnera strikt JSON med exakt nycklarna: title, content, distanceMeters, durationMinutes, focus, note. title max 80 tecken, content max 5000 tecken, note max 500 tecken. note ska kort ange vilka tidigare pass eller egenskaper som inspirerat förslaget.

TIDIGARE PASS:
${sourceText.slice(0, 26000)}`
  try {
    const result = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.35, max_tokens: 1400, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown och får aldrig hitta på uppgifter från tidigare pass.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'workout_generation', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { error: 'Passförslaget kunde inte skapas just nu.' } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'workout_generation', model, role: 'coach', response: payload })
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}')
    if (!parsed.content) return { error: 'AI:n returnerade inget passförslag.' }
    return { draft: { title: String(parsed.title || `Förslag · ${focus || 'simning'}`).slice(0, 80), content: formatWorkoutLayout(String(parsed.content).slice(0, 5000)), note: String(parsed.note || '').slice(0, 500), focus: String(parsed.focus || focus).slice(0, 80), distanceMeters: Number.isInteger(parsed.distanceMeters) ? parsed.distanceMeters : (distance || ''), durationMinutes: Number.isInteger(parsed.durationMinutes) ? parsed.durationMinutes : (duration || '') } }
  } catch (error) { console.warn('Workout generation failed:', error.message); return { error: 'Passförslaget kunde inte tolkas. Försök igen.' } }
}

const mapCompetitionEvent = (item) => {
  const sessionLabel = String(item.session_label || '').trim()
  const baseLabel = String(item.label || '').trim()
  const label = sessionLabel && !baseLabel.toLowerCase().includes(sessionLabel.toLowerCase()) ? `${sessionLabel} · ${baseLabel}` : baseLabel
  return { id: item.id, competitionId: item.competition_id, eventOrder: item.event_order, eventNumber: item.event_number || '', gender: `Kön: ${item.gender === 'Dam' ? 'Damer' : item.gender === 'Herr' ? 'Herrar' : item.gender || 'Alla'}`, ageClass: `Klass: ${item.age_class || 'Alla åldrar'}`, distanceMeters: item.distance_meters || null, stroke: item.stroke, label, sessionLabel, itemType: item.item_type || 'race', entryAllowed: true, selectable: item.entry_allowed !== false }
}

function responseOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  return (payload?.output || []).flatMap((item) => item.content || []).map((item) => item.text || '').join('')
}

function cleanCompetitionLabel(label, gender, ageClass) {
  let text = String(label || '').replace(/\b(\S+)\s+\1\b/gi, '$1').replace(/\s{2,}/g, ' ').trim()
  for (const token of [gender, ageClass]) {
    const value = String(token || '').trim()
    if (value && !['Alla', 'Alla åldrar'].includes(value) && value.length <= 24) text = text.replace(new RegExp(`(^|[ ·,/])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=($|[ ·,/:]))`, 'gi'), '$1').replace(/\s{2,}/g, ' ').trim()
  }
  return text || String(label || '').trim()
}

async function interpretCompetitionProgram(request, options = {}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'OPENAI_API_KEY saknas.' }
  const dataUrl = String(options.fileData || '')
  const mimeType = String(options.mimeType || '')
  const fileName = String(options.fileName || 'grenprogram').slice(0, 120)
  if (!dataUrl.startsWith('data:') || dataUrl.length > 12_000_000) return { error: 'Filen saknas eller är för stor. Välj en fil under cirka 9 MB.' }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const prompt = `Du är en noggrann tävlingssekreterare för svensk simning. Läs hela det bifogade tävlingsprogrammet, även tabeller och sidbrytningar. Plocka ut varje gren samt viktiga informationsrader i den ordning de förekommer. Arbeta hellre långsamt och komplett än snabbt och ofullständigt.

Varje rad ska ha: eventOrder (heltal), eventNumber (sträng eller null), sessionLabel (sträng eller null), itemType (race, pause, award eller info), entryAllowed (boolean), gender (Dam, Herr, D, H eller Alla), ageClass (exempelvis A, B, C, D, E, 13–14 år, Junior eller Alla åldrar), distanceMeters (heltal eller null), stroke (Frisim, Ryggsim, Bröstsim, Fjärilsim, Medley eller Annat), label (kort tydlig svensk text).

Regler:
- Behåll ordningen från dokumentet.
- Ta inte med heat, startlistor, deltagarnamn, tider eller resultat.
- Tolka H som Herr och D som Dam när dokumentet använder dessa för kön. Behåll H/D i label om sammanhanget är oklart.
- A, B, C, D och E är klassbeteckningar. Om dokumentet uttryckligen visar klassens åldersintervall ska du översätta till en läsbar text, exempelvis “13–14 år”. När kön och ålder är säkra ska ageClass bli exempelvis “13–14 år”, så att presentationen kan visa “Damer 13–14 år”. Kombinationer och intervall som ABC, ABCD, A–D och A-D ska annars bevaras som en sammanhållen ageClass. Använd inte standardåldrar som fakta när dokumentet anger en annan definition.
- Om kön eller åldersklass saknas: använd Alla respektive Alla åldrar, men behåll eventuell klassbokstav i label.
- Gissa aldrig grennummer, ålder, distans eller simsätt. Om något är oklart, använd Annat och behåll den läsbara texten i label.
- En rad eller tabellrad ska bli ett event. Slå inte ihop olika kön eller åldersklasser.
- Om samma grennummer återkommer för olika klasser ska de bli separata event.
- Läs inte in sidhuvuden, heat, startlistor, deltagarnamn, tider eller resultat.
- Rader som innehåller paus, lunch, samling, invigning, finalpass eller prisutdelning ska tas med som pause/award/info och ha entryAllowed=false. De ska inte kunna väljas av simmare.
- Ta med informationsrader även om de ligger före den första grenen eller mellan två tabeller. En första paus får aldrig hoppas över bara för att den saknar grennummer.
- Om dokumentet delar upp tävlingen i pass/sessioner, till exempel “Pass 1”, “Pass 2”, “Pass 3”, “Förmiddag”, “Eftermiddag” eller “Finalpass”, ska sessionLabel sättas och återanvändas på efterföljande rader tills nästa passrubrik. Pauser och prisutdelningar ska också få rätt sessionLabel.
- Läs hela dokumentet till sista sidan och kontrollera särskilt de sista grenarna innan du svarar. Avsluta inte listan tidigt och slå inte ihop flera rader för att spara plats.
- Kontrollera innan du svarar att eventOrder är stigande och att varje label är läsbar på svenska.

Dokument: ${fileName}`
  const content = [{ type: 'input_text', text: prompt }]
  if (mimeType.startsWith('image/')) content.push({ type: 'input_image', image_url: dataUrl, detail: 'high' })
  else content.push({ type: 'input_file', filename: fileName, file_data: dataUrl })
  try {
    const eventSchema = { type: 'object', additionalProperties: false, properties: { eventOrder: { type: 'integer' }, eventNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] }, sessionLabel: { anyOf: [{ type: 'string' }, { type: 'null' }] }, itemType: { type: 'string', enum: ['race', 'pause', 'award', 'info'] }, entryAllowed: { type: 'boolean' }, gender: { anyOf: [{ type: 'string', enum: ['Dam', 'Herr', 'D', 'H', 'Alla'] }, { type: 'null' }] }, ageClass: { anyOf: [{ type: 'string' }, { type: 'null' }] }, distanceMeters: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, stroke: { type: 'string' }, label: { type: 'string' } }, required: ['eventOrder', 'eventNumber', 'sessionLabel', 'itemType', 'entryAllowed', 'gender', 'ageClass', 'distanceMeters', 'stroke', 'label'] }
    const result = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, input: [{ role: 'user', content }], max_output_tokens: 12000, text: { format: { type: 'json_schema', name: 'competition_program', strict: true, schema: { type: 'object', additionalProperties: false, properties: { events: { type: 'array', items: eventSchema } }, required: ['events'] } } } }) })
    if (!result.ok) { await writeAiUsage(request, { feature: 'competition_program_import', model, role: 'coach', status: 'failure', error: `HTTP ${result.status}` }); return { error: 'Grenprogrammet kunde inte tolkas just nu.' } }
    const payload = await result.json()
    await writeAiUsage(request, { feature: 'competition_program_import', model, role: 'coach', response: payload })
    const parsed = JSON.parse(responseOutputText(payload) || '{}')
    let currentSessionLabel = ''
    const events = Array.isArray(parsed.events) ? parsed.events.map((item, index) => {
      const rawLabel = String(item.label || '').slice(0, 120)
      const gender = ['Dam', 'Herr', 'D', 'H', 'Alla'].includes(item.gender) && item.gender !== 'Alla' ? item.gender : (/(^|[\s/·])H([\s/·]|$)/i.test(rawLabel) ? 'H' : /(^|[\s/·])D([\s/·]|$)/i.test(rawLabel) ? 'D' : 'Alla')
      const ageClass = String(item.ageClass || '').trim() || (rawLabel.match(/(^|[\s/·])([A-E](?:[A-E]|\s*[–-]\s*[A-E])*)(?=[\s/·]|$)/i)?.[2] || 'Alla åldrar')
      const explicitSession = String(item.sessionLabel || '').trim().slice(0, 60)
      const detectedSession = rawLabel.match(/\b(pass\s*[1-9]\d*|förmiddag|eftermiddag|finalpass)\b/i)?.[1] || ''
      if (explicitSession || detectedSession) currentSessionLabel = (explicitSession || detectedSession).slice(0, 60)
      const sessionLabel = currentSessionLabel
      const normalizedLabel = rawLabel.toLocaleLowerCase('sv-SE')
      const clearlyInformation = /\b(paus|lunch|rast|samling|invigning|prisutdelning|prisutdelningar|försäljning|insimning)\b/.test(normalizedLabel)
      const clearlyRace = /\b\d{2,4}\s*m\b/.test(normalizedLabel) || /\b(frisim|ryggsim|bröstsim|fjärilsim|medley)\b/.test(normalizedLabel)
      let itemType = ['race', 'pause', 'award', 'info'].includes(item.itemType) ? item.itemType : 'race'
      if (clearlyInformation) itemType = /\b(prisutdelning|prisutdelningar)\b/.test(normalizedLabel) ? 'award' : 'info'
      else if (clearlyRace) itemType = 'race'
      return { eventOrder: index + 1, eventNumber: String(item.eventNumber || '').slice(0, 20), sessionLabel, itemType, entryAllowed: itemType === 'race' && item.entryAllowed !== false, gender, ageClass: ageClass.slice(0, 60), distanceMeters: Number.isInteger(item.distanceMeters) ? item.distanceMeters : null, stroke: String(item.stroke || 'Annat').slice(0, 30), label: cleanCompetitionLabel(rawLabel, gender, ageClass) }
    }).filter((item) => item.label).slice(0, 300) : []
    if (!events.length) return { error: 'Inga grenar kunde hittas i dokumentet.' }
    return { events }
  } catch (error) { console.warn('Competition program import failed:', error.message); return { error: 'Grenprogrammet kunde inte tolkas.' } }
}

export default async function handler(request, response) {
  const code = String(request.headers['x-simkoll-code'] || '')
  const role = getRole(code)

  try {
    if (request.method === 'GET') {
      const profile = role === 'coach' ? null : await getSessionProfile(request)
      if (role !== 'coach' && !profile) return sendJson(response, 403, { error: 'Dagens pass visas bara för inloggade profiler.' })
      if (request.query?.planning === 'true') {
        const result = await supabaseRequest('training_plans?select=*&order=plan_date.asc&limit=200')
        if (!result.ok) throw new Error(`Training plans GET failed: ${result.status} ${await result.text()}`)
        const plans = await backfillPlanningFromWorkouts(await result.json())
        const visiblePlans = role === 'coach' ? plans : plans.filter((item) => !item.target_groups?.length || item.target_groups.includes(profile.training_group))
        return sendJson(response, 200, { plans: visiblePlans.map(publicPlan) })
      }
      if (request.query?.calendar === 'true') {
        const result = await supabaseRequest('competition_calendar?select=*&order=start_date.asc&limit=100')
        if (!result.ok) throw new Error(`Competition calendar GET failed: ${result.status} ${await result.text()}`)
        const competitions = await result.json()
        const visible = role === 'coach' || profile?.is_test_profile || !profile?.training_group ? competitions : competitions.filter((item) => !item.target_groups?.length || item.target_groups.includes(profile.training_group))
        return sendJson(response, 200, { competitions: visible.map(publicCompetition) })
      }
      if (request.query?.program === 'true') {
        const competitionId = String(request.query.id || '')
        if (!competitionId) return sendJson(response, 400, { error: 'Tävling saknas.' })
        const eventsResult = await supabaseRequest(`competition_events?competition_id=eq.${encodeURIComponent(competitionId)}&select=*&order=event_order.asc`)
        if (!eventsResult.ok) throw new Error(`Competition events GET failed: ${eventsResult.status}`)
        const entryQuery = role === 'coach' ? `competition_entries?competition_id=eq.${encodeURIComponent(competitionId)}&select=*&order=created_at.asc` : profile ? `competition_entries?competition_id=eq.${encodeURIComponent(competitionId)}&profile_id=eq.${profile.id}&select=*&order=created_at.asc` : null
        const entriesResult = entryQuery ? await supabaseRequest(entryQuery) : null
        if (entriesResult && !entriesResult.ok) throw new Error(`Competition entries GET failed: ${entriesResult.status}`)
        const entries = entriesResult ? await entriesResult.json() : []
        let publicEntries = entries
        if (role === 'coach' && entries.length) {
          const ids = [...new Set(entries.map((entry) => entry.profile_id).filter(Boolean))]
          const profilesResult = await supabaseRequest(`profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,display_name,emoji`)
          const profiles = profilesResult.ok ? await profilesResult.json() : []
          const profileMap = new Map(profiles.map((item) => [item.id, item]))
          publicEntries = entries.map((entry) => ({ ...entry, profileName: profileMap.get(entry.profile_id)?.display_name || 'Simmare', profileEmoji: profileMap.get(entry.profile_id)?.emoji || '🏊' }))
        }
        return sendJson(response, 200, { events: (await eventsResult.json()).map(mapCompetitionEvent), entries: publicEntries })
      }
      if (role === 'coach' && request.query?.notes === 'true') {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(request.query?.date || '') ? request.query.date : stockholmDate()
        const result = await supabaseRequest(`coach_activity_notes?note_date=eq.${date}&select=*&order=updated_at.desc&limit=100`)
        if (!result.ok) throw new Error(`Coach notes GET failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { notes: (await result.json()).map(publicCoachNote) })
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

    if (request.method === 'POST') {
      if (request.body?.action === 'coach-update-competition-entry') {
        if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan ändra tävlingsval.' })
        const competitionId = String(request.body.competitionId || ''), profileId = String(request.body.profileId || '')
        const eventIds = Array.isArray(request.body.eventIds) ? [...new Set(request.body.eventIds.map(String))].slice(0, 30) : []
        if (!competitionId || !profileId) return sendJson(response, 400, { error: 'Tävling eller simmare saknas.' })
        const reset = await supabaseRequest(`competition_entries?competition_id=eq.${encodeURIComponent(competitionId)}&profile_id=eq.${encodeURIComponent(profileId)}`, { method: 'DELETE' })
        if (!reset.ok) throw new Error(`Competition entries reset failed: ${reset.status}`)
        if (!eventIds.length) return sendJson(response, 200, { entries: [] })
        const insert = await supabaseRequest('competition_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(eventIds.map((eventId) => ({ competition_id: competitionId, event_id: eventId, profile_id: profileId, status: 'submitted', submitted_at: new Date().toISOString() }))) })
        if (!insert.ok) throw new Error(`Competition entries insert failed: ${insert.status} ${await insert.text()}`)
        return sendJson(response, 200, { entries: await insert.json() })
      }
      if (request.body?.action === 'save-competition-entry' || request.body?.action === 'submit-competition-entries') {
        const swimmer = role === 'coach' ? null : await getSessionProfile(request)
        if (!swimmer) return sendJson(response, 403, { error: 'Logga in med en simmarprofil först.' })
        const competitionId = String(request.body.competitionId || '')
        const eventIds = Array.isArray(request.body.eventIds) ? [...new Set(request.body.eventIds.map(String))].slice(0, 30) : []
        if (!competitionId) return sendJson(response, 400, { error: 'Tävling saknas.' })
        const existing = await supabaseRequest(`competition_entries?competition_id=eq.${encodeURIComponent(competitionId)}&profile_id=eq.${encodeURIComponent(swimmer.id)}`, { method: 'DELETE' })
        if (!existing.ok) throw new Error(`Competition entries reset failed: ${existing.status}`)
        if (!eventIds.length) return sendJson(response, 200, { entries: [], status: request.body.action === 'submit-competition-entries' ? 'submitted' : 'draft' })
        const status = request.body.action === 'submit-competition-entries' ? 'submitted' : 'draft'
        const insert = await supabaseRequest('competition_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(eventIds.map((eventId) => ({ competition_id: competitionId, event_id: eventId, profile_id: swimmer.id, status, submitted_at: status === 'submitted' ? new Date().toISOString() : null }))) })
        if (!insert.ok) throw new Error(`Competition entries insert failed: ${insert.status} ${await insert.text()}`)
        return sendJson(response, 200, { entries: await insert.json(), status })
      }
      if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränaren kan ändra dagens pass.' })
      if (request.body?.action === 'transcribe-audio') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const dataUrl = String(request.body.dataUrl || '')
        if (!dataUrl.startsWith('data:audio/')) return sendJson(response, 400, { error: 'Ljudfilen saknas.' })
        return sendJson(response, 200, await transcribeAudio(request, dataUrl, String(request.body.mimeType || 'audio/webm')))
      }
      if (request.body?.action === 'polish-workout-content') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const content = String(request.body.content || '').trim()
        if (!content || content.length > 5000) return sendJson(response, 400, { error: 'Skriv in huvudserien först.' })
        return sendJson(response, 200, await polishWorkoutContent(request, content, String(request.body.title || '').slice(0, 80), String(request.body.focus || '').slice(0, 80)))
      }
      if (request.body?.action === 'interpret-workout-image') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const fileData = String(request.body.fileData || '')
        const mimeType = String(request.body.mimeType || '')
        if (!fileData.startsWith('data:image/') || fileData.length > 8_000_000) return sendJson(response, 400, { error: 'Bilden saknas eller är för stor. Välj en bild under cirka 6 MB.' })
        return sendJson(response, 200, await interpretWorkoutAttachment(request, fileData, mimeType, String(request.body.fileName || '').slice(0, 120)))
      }
      if (request.body?.action === 'polish-coach-note') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const content = String(request.body.content || '').trim()
        const noteDate = String(request.body.noteDate || stockholmDate())
        if (!content || content.length > 5000) return sendJson(response, 400, { error: 'Skriv en sammanfattning först.' })
        const polished = await polishCoachNote(request, content, noteDate, String(request.body.activityLabel || '').slice(0, 120))
        return sendJson(response, 200, polished)
      }
      if (request.body?.action === 'save-coach-note') {
        const noteDate = String(request.body.noteDate || '')
        const activityType = String(request.body.activityType || 'day')
        const activityId = request.body.activityId ? String(request.body.activityId) : null
        const content = String(request.body.content || '').trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(noteDate) || !['day', 'workout', 'competition'].includes(activityType) || !content || content.length > 5000) return sendJson(response, 400, { error: 'Kontrollera datum och sammanfattning.' })
        const scopeKey = `${activityType}:${activityId || noteDate}`
        const result = await supabaseRequest('coach_activity_notes?on_conflict=scope_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ note_date: noteDate, activity_type: activityType, activity_id: activityId, scope_key: scopeKey, content, updated_at: new Date().toISOString() }) })
        if (!result.ok) throw new Error(`Coach note save failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { note: publicCoachNote((await result.json())[0]) })
      }
      if (request.body?.action === 'save-competition') {
        const body = request.body
        const startDate = String(body.startDate || ''), endDate = String(body.endDate || startDate), title = String(body.title || '').trim()
        const targetGroups = Array.isArray(body.targetGroups) ? body.targetGroups.filter((group, index, groups) => ['ungdom_orange', 'ungdom_svart', 'junior'].includes(group) && groups.indexOf(group) === index) : []
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || !title || !targetGroups.length) return sendJson(response, 400, { error: 'Fyll i datum, namn och minst en grupp.' })
        const payload = { start_date: startDate, end_date: endDate, title: title.slice(0, 120), category: String(body.category || '').slice(0, 80) || null, location: String(body.location || '').slice(0, 120) || null, target_groups: targetGroups, notes: String(body.notes || '').slice(0, 500) || null, updated_at: new Date().toISOString() }
        const endpoint = body.id ? `competition_calendar?id=eq.${body.id}` : 'competition_calendar'
        const result = await supabaseRequest(endpoint, { method: body.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!result.ok) throw new Error(`Competition save failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { competition: publicCompetition((await result.json())[0]) })
      }
      if (request.body?.action === 'save-plan') {
        const body = request.body
        const date = String(body.date || '')
        const activityType = String(body.activityType || '')
        const title = String(body.title || '').trim()
        const targetGroups = Array.isArray(body.targetGroups) ? body.targetGroups.filter((group, index, groups) => ['ungdom_orange', 'ungdom_svart', 'junior'].includes(group) && groups.indexOf(group) === index) : []
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['swim', 'strength', 'dryland', 'competition'].includes(activityType) || !title || !targetGroups.length) return sendJson(response, 400, { error: 'Fyll i datum, aktivitet, rubrik och minst en grupp.' })
        const payload = { plan_date: date, activity_type: activityType, title: title.slice(0, 100), focus: String(body.focus || '').slice(0, 80) || null, distance_meters: body.distanceMeters ? Number(body.distanceMeters) : null, duration_minutes: body.durationMinutes ? Number(body.durationMinutes) : null, time_of_day: ['morning', 'afternoon'].includes(body.timeOfDay) ? body.timeOfDay : null, target_groups: targetGroups, location: String(body.location || '').slice(0, 120) || null, notes: String(body.notes || '').slice(0, 500) || null, sync_status: 'manual', updated_at: new Date().toISOString() }
        const endpoint = body.id ? `training_plans?id=eq.${body.id}` : 'training_plans'
        const result = await supabaseRequest(endpoint, { method: body.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!result.ok) throw new Error(`Training plan save failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { plan: publicPlan((await result.json())[0]) })
      }
      if (request.body?.action === 'import-sheet') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const sheetUrl = String(request.body.url || '')
        const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
        if (!match) return sendJson(response, 400, { error: 'Ange en giltig Google Sheets-länk.' })
        const source = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`)
        if (!source.ok) return sendJson(response, 502, { error: 'Kunde inte läsa träningsmallen.' })
        const text = await source.text()
        const fallback = parseWorkoutCsv(text)
        const draft = await improveWorkoutWithAi(request, text, fallback)
        return sendJson(response, 200, { draft })
      }
      if (request.body?.action === 'generate-from-library') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        if (!Array.isArray(request.body.library) || !request.body.library.length) return sendJson(response, 400, { error: 'Välj eller hämta minst ett tidigare pass först.' })
        return sendJson(response, 200, await generateWorkoutFromLibrary(request, request.body))
      }
      if (request.body?.action === 'import-competition-program') {
        const availability = await aiAvailability(); if (!availability.allowed) return sendJson(response, 403, { error: availability.reason === 'limit' ? `Månadstaket på ${availability.limit.toLocaleString('sv-SE')} tokens är nått.` : 'AI-stöd är avstängt i webapp-inställningarna.' })
        const competitionId = String(request.body.competitionId || '')
        if (!competitionId) return sendJson(response, 400, { error: 'Tävling saknas.' })
        const parsed = await interpretCompetitionProgram(request, request.body)
        if (parsed.error) return sendJson(response, 422, parsed)
        const remove = await supabaseRequest(`competition_events?competition_id=eq.${encodeURIComponent(competitionId)}`, { method: 'DELETE' })
        if (!remove.ok) throw new Error(`Competition events reset failed: ${remove.status}`)
        const insert = await supabaseRequest('competition_events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(parsed.events.map((item) => ({ competition_id: competitionId, event_order: item.eventOrder, event_number: item.eventNumber || null, session_label: item.sessionLabel || null, item_type: item.itemType, entry_allowed: item.entryAllowed, gender: item.gender, age_class: item.ageClass, distance_meters: item.distanceMeters, stroke: item.stroke, label: item.label }))) })
        if (!insert.ok) throw new Error(`Competition events insert failed: ${insert.status} ${await insert.text()}`)
        return sendJson(response, 200, { events: (await insert.json()).map(mapCompetitionEvent) })
      }
      if (request.body?.action === 'import-sportadmin-calendar') {
        const source = await fetch('https://portalweb.sportadmin.se/webcal?id=745c5643-5d4c-43c2-a7f3-a92e2846c145')
        if (!source.ok) return sendJson(response, 502, { error: `SportAdmin-kalendern svarade med ${source.status}.` })
        return sendJson(response, 200, { activities: parseSportAdminIcs(await source.text()), source: 'SportAdmin Webcal', fetchedAt: new Date().toISOString() })
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
      const savedWorkout = (await result.json())[0]
      await syncPlanningFromWorkout(savedWorkout)
      return sendJson(response, 200, { workout: publicWorkout(savedWorkout) })
    }

    if (request.method === 'DELETE') {
      if (request.query?.calendar === 'true') {
        const id = String(request.query?.id || '')
        if (!id) return sendJson(response, 400, { error: 'Tävling saknas.' })
        const result = await supabaseRequest(`competition_calendar?id=eq.${id}`, { method: 'DELETE' })
        if (!result.ok) throw new Error(`Competition DELETE failed: ${result.status} ${await result.text()}`)
        return sendJson(response, 200, { ok: true })
      }
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
