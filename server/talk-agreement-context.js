import { createHash } from 'node:crypto'
import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { loadTrainingDiary } from './training-diary.js'
import { diaryAddDays } from '../shared/training-diary.js'
import { developmentTalkQuestions, TALK_FIELD_LABELS } from '../shared/development-talk-form.js'
import { detectGoalPersonalData } from '../shared/goal-privacy.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const n = (value) => Number.isFinite(value) ? Number(value.toFixed(1)).toLocaleString('sv-SE') : 'uppgift saknas'
const limited = (text, max = 600) => text.length > max ? `${text.slice(0, max)}… [förkortat]` : text
const safeText = (value, label, name) => {
  const text = String(value || '').trim(), found = detectGoalPersonalData(text, name)
  if (found) throw fail(`${label}: ${found.message} Rätta texten eller välj bort detta underlag.`)
  return text
}
const typeNames = { swim: 'simning', strength: 'styrka', dryland: 'landträning', cycling: 'cykling', other: 'annan aktivitet', unknown: 'okänd aktivitet' }

function historyText(data, name) {
  const s = data.current, lines = [
    'Registrerad/rapporterad träning enligt dagboken, inklusive tränarens närvaromarkeringar. Saknade registreringar bevisar inte frånvaro.',
    `${s.sessions} pass på ${s.activeDays} registrerade träningsdagar. ${Object.entries(s.byType).map(([type, count]) => `${typeNames[type] || type}: ${count}`).join(', ') || 'Inga pass registrerade'}.`,
    `Rapporterade simmeter: ${n(s.swimMeters)} m. Därutöver uppskattade meter från kopplade pass: ${n(s.estimatedSwimMeters)} m. Uppskattning är inte uppmätt mängd.`,
    `Rapporterad tid: ${n(s.minutes)} min. Därutöver uppskattad tid: ${n(s.estimatedMinutes)} min.`,
    `RPE, genomsnitt av dagsvärden: ${n(s.rpe)}/10, ${s.days.filter((day) => Number.isFinite(day.rpe)).length} dagar med RPE. Känsla: ${n(s.feeling)}/5.`,
    'Vecka för vecka (datumintervall, registrerade pass, träningsdagar, RPE):',
  ]
  for (let i = 0; i < s.days.length; i += 7) {
    const days = s.days.slice(i, i + 7), rpe = days.filter((day) => Number.isFinite(day.rpe)).map((day) => day.rpe)
    lines.push(`${days[0].date}–${days.at(-1).date}: ${days.reduce((sum, day) => sum + day.sessions, 0)} pass, ${days.filter((day) => day.sessions > 0).length} dagar, RPE ${n(rpe.length ? rpe.reduce((a, b) => a + b, 0) / rpe.length : null)} (${rpe.length} svarsdagar).`)
  }
  const goals = data.goals.slice(0, 12)
  lines.push(`Aktuella/periodens utvecklingsmål (${goals.length} av ${data.goals.length}, status avser nuläget):`)
  goals.forEach((goal) => lines.push(`${safeText(goal.title, 'Mål', name)}: ${safeText(goal.description, 'Målbeskrivning', name)}. Nästa steg: ${safeText(goal.next_step, 'Målets nästa steg', name) || 'ej angivet'}. Status: ${goal.status}. Start: ${goal.start_date || 'ej angivet'}, måldatum: ${goal.target_date || 'ej angivet'}.`))
  const results = data.raceResults.slice(-30)
  lines.push(`Registrerade tävlingsresultat (${results.length} av ${data.raceResults.length}). Inte en komplett resultat- eller personbästahistorik:`)
  results.forEach((row) => lines.push(`${row.date}: ${row.event}, ${row.pool || 'bassäng saknas'}, ${row.time}. Källa: ${row.source === 'manual' ? 'manuellt registrerat' : row.source === 'tempus' ? 'Tempus' : 'registrerat, verifiering ej fastställd'}.`))
  return lines.join('\n')
}

// Only a verified talk can identify the swimmer. The browser cannot substitute
// a profile id, arbitrary diary text, or an unreviewed model input snapshot.
export async function loadTalkAgreementContext(body, deps = {}) {
  const read = deps.read || supabaseRequest, diary = deps.diary || loadTrainingDiary
  if (!uuid.test(String(body.talkId || ''))) throw fail('Öppna ett sparat utvecklingssamtal först.')
  if (typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length > 10000) throw fail('Skriv interna anteckningar först, högst 10 000 tecken.')
  const talkResult = await read(`development_talks?id=eq.${encodeURIComponent(body.talkId)}&select=swimmer_id,swimmer_answers,updated_at&limit=1`)
  if (!talkResult.ok) throw fail('Samtalet kunde inte hämtas.', 502)
  const talk = (await talkResult.json())[0]
  if (!talk || !uuid.test(talk.swimmer_id)) throw fail('Samtalet finns inte längre.', 404)
  const profileResult = await read(`profiles?id=eq.${talk.swimmer_id}&active=eq.true&approval_status=eq.approved&select=id,display_name,training_group&limit=1`)
  if (!profileResult.ok) throw fail('Simmarprofilen kunde inte hämtas.', 502)
  const profile = (await profileResult.json())[0]
  if (!profile) throw fail('Simmaren är inte längre aktiv och godkänd.', 404)
  const selected = body.sources
  if (!selected || ['preparations', 'history', 'reflections', 'sleep'].some((key) => typeof selected[key] !== 'boolean')) throw fail('Välj vilka underlag som ska användas.')
  const end = (deps.today || stockholmDate)(), start = diaryAddDays(end, -55)
  const sections = [{ key: 'notes', title: 'Tränarens aktuella anteckningar', text: safeText(body.notes, 'Anteckningar', profile.display_name) }]
  if (selected.preparations) {
    const answers = body.swimmerAnswers ?? talk.swimmer_answers ?? {}
    const allowed = new Set([...Object.keys(TALK_FIELD_LABELS), ...Object.keys(talk.swimmer_answers || {})])
    if (!answers || Array.isArray(answers) || typeof answers !== 'object' || Object.keys(answers).length > 50 || Object.entries(answers).some(([key, value]) => key !== '__step' && (!allowed.has(key) || typeof value !== 'string' || value.length > 1000))) throw fail('Simmarens förberedelser har ogiltigt format.')
    const { sections: groups, legacy } = developmentTalkQuestions(answers)
    const text = groups.map((group) => `${group.title}\n${group.questions.map((q) => `${q.label}: ${safeText(q.value, 'Förberedelser', profile.display_name) || 'Ej besvarad'}`).join('\n')}`).join('\n\n')
    sections.push({ key: 'preparations', title: 'Simmarens aktuella förberedelser (även osparade ändringar)', text: text + (legacy.length ? '\n\nTidigare frågor\n' + legacy.map((q) => `${q.label}: ${safeText(q.value, 'Tidigare svar', profile.display_name) || 'Ej besvarad'}`).join('\n') : '') })
  }
  const warnings = []
  if (selected.history || selected.reflections) {
    const data = await diary(profile, start, end, { includeReflections: selected.reflections })
    warnings.push(...data.warnings)
    if (selected.history) sections.push({ key: 'history', title: 'Träningshistorik · senaste åtta veckorna', text: historyText({ ...data, raceResults: data.raceResults.filter((row) => row.date >= start && row.date <= end) }, profile.display_name) })
    if (selected.reflections) {
      const rows = data.entries.filter((entry) => entry.reflection && (entry.reflection.whatWorked || entry.reflection.nextTime)).sort((a, b) => b.date.localeCompare(a.date))
      sections.push({ key: 'reflections', title: 'Simmarens dagboksreflektioner · frivilligt tillval', text: rows.length ? `${Math.min(12, rows.length)} av ${rows.length} reflektioner, senaste först. Varje svar begränsas till 600 tecken.\n` + rows.slice(0, 12).map((row) => `${row.date}\nDet som fungerade: ${limited(safeText(row.reflection.whatWorked, 'Dagboksreflektion', profile.display_name)) || 'Ej besvarat'}\nTill nästa gång: ${limited(safeText(row.reflection.nextTime, 'Dagboksreflektion', profile.display_name)) || 'Ej besvarat'}`).join('\n\n') : 'Inga dagboksreflektioner registrerade under perioden.' })
    }
  }
  if (selected.sleep) {
    const result = await read(`profile_daily_sleep?profile_id=eq.${profile.id}&activity_date=gte.${start}&activity_date=lte.${end}&select=activity_date,minutes,quality,skipped&order=activity_date.asc&limit=100`)
    if (!result.ok) throw fail('Sömnkollen kunde inte hämtas. Försök igen eller välj bort den.', 502)
    const rows = (await result.json()).filter((row) => !row.skipped), minutes = rows.filter((row) => Number.isFinite(row.minutes))
    sections.push({ key: 'sleep', title: 'Sömnkoll · frivilligt tillval', text: `${rows.length} besvarade nätter under perioden. Genomsnittlig sovtid: ${n(minutes.length ? minutes.reduce((sum, row) => sum + row.minutes, 0) / minutes.length / 60 : null)} timmar. Självskattad sömn: Dålig ${rows.filter((row) => row.quality === 1).length}, Okej ${rows.filter((row) => row.quality === 3).length}, Bra ${rows.filter((row) => row.quality === 5).length}. Saknade eller överhoppade svar räknas inte som noll. Underlag för dialog, inte diagnos eller medicinskt råd.` })
  }
  const context = { period: { start, end }, sections, warnings: [...new Set(warnings)].sort() }
  return { context, contextHash: createHash('sha256').update(JSON.stringify({ context, talkVersion: talk.updated_at })).digest('hex') }
}
