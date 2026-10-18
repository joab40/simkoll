const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const keys = ['feeling', 'energy', 'body', 'rpe', 'speedFeeling', 'temperature', 'passRating']
const average = (rows, key) => {
  const values = rows.map((row) => number(row[key])).filter((value) => value !== null)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null
}
export const responseDay = (row) => row.activity_date || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(row.created_at))
const submissionDay = (value) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value)) : null
const dayDifference = (from, to) => from && to ? Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)) : 0
export const analysisResponse = (row) => {
  const date = responseDay(row)
  const submittedAt = row.created_at || null
  const submittedDate = submissionDay(submittedAt)
  return { date, submittedAt, lateEntry: Boolean(row.late_entry), reportDelayDays: dayDifference(date, submittedDate), competition: row.competition === true, status: row.day_type, activityType: row.activity_type || null, trainingSlot: row.session_slot || null, activityMinutes: row.activity_minutes ?? null, activityDistanceMeters: row.activity_distance_meters ?? null, plannedCompletion: row.planned_completion || null, feeling: row.feeling, energy: row.energy, body: row.body, rpe: row.rpe, speedFeeling: row.speed_feeling, temperature: row.temperature, passRating: row.pass_rating, setupRating: row.setup_rating, comment: String(row.comment || '').slice(0, 1200) }
}

// Use explicit AM/PM links when present. Never attach the same day's feedback to both
// AM and PM, or count a planned workout's full distance as actually swum.
export function buildSwimmerPasses({ sessions, responses, workouts, plans = [], trainingGroup }) {
  const inGroup = (row) => !row.target_groups?.length || Boolean(trainingGroup && row.target_groups.includes(trainingGroup))
  const candidates = workouts.filter(inGroup).map((row) => ({ ...row, source: 'published', note: [row.note, ...plans.filter((plan) => plan.source_workout_id === row.id && inGroup(plan)).map((plan) => plan.notes)].filter(Boolean).join('\n').slice(0, 2500) }))
  plans.filter((row) => row.activity_type === 'swim' && (!row.source_workout_id || !workouts.some((workout) => workout.id === row.source_workout_id)) && inGroup(row)).forEach((row) => candidates.push({ ...row, workout_date: row.plan_date, note: row.notes, source: 'plan' }))
  const seen = new Set()
  sessions = sessions.filter((row) => { if (!row.session_slot || row.session_slot === 'legacy') return true; const key = `${row.session_date}|${row.session_slot}`; if (seen.has(key)) return false; seen.add(key); return true })
  const swimSessions = sessions.filter((row) => row.activity_type === 'swim')
  return swimSessions.map((session) => {
    const day = session.session_date
    const sameDay = candidates.filter((row) => row.workout_date === day)
    const sessionCount = swimSessions.filter((row) => row.session_date === day).length
    const timeOfDay = ({ morning_swim: 'morning', afternoon_swim: 'afternoon' })[session.session_slot]
    const timed = timeOfDay ? sameDay.filter((row) => row.time_of_day === timeOfDay) : []
    let candidate = timed.length === 1 ? timed[0] : null
    let matchStatus = candidate ? 'slot' : 'unmatched'
    if (!candidate && timed.length === 0 && sessionCount === 1 && sameDay.length === 1 && (!timeOfDay || !sameDay[0].time_of_day)) { candidate = sameDay[0]; matchStatus = 'day_only' }
    if (!candidate && sameDay.length) matchStatus = 'ambiguous'
    const dayFeedback = responses.filter((row) => responseDay(row) === day && row.day_type === 'after' && (!row.activity_type || row.activity_type === 'swim'))
    const allSessionsCount = sessions.filter((row) => row.session_date === day).length
    const slotFeedback = dayFeedback.filter((row) => row.session_slot && row.session_slot === session.session_slot).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const legacyFeedback = dayFeedback.filter((row) => !row.session_slot)
    const feedbackLink = slotFeedback.length ? 'slot' : legacyFeedback.length === 1 && allSessionsCount === 1 ? 'day_only' : legacyFeedback.length ? 'ambiguous' : 'missing'
    const feedback = feedbackLink === 'slot' ? analysisResponse(slotFeedback[0]) : feedbackLink === 'day_only' ? analysisResponse(legacyFeedback[0]) : null
    return { date: day, sessionSlot: session.session_slot, title: candidate?.title || 'Registrerat simpass', focus: candidate?.focus || null, timeOfDay: candidate?.time_of_day || null, distanceMeters: candidate ? number(candidate.distance_meters) : null, durationMinutes: candidate ? number(candidate.duration_minutes) : null, content: String(candidate?.content || '').slice(0, 5000), note: String(candidate?.note || '').slice(0, 2500), source: candidate?.source || null, matchStatus, feedbackLink, feedback, candidateTitles: candidate ? [] : sameDay.map((row) => row.title).slice(0, 8) }
  }).sort((a, b) => a.date.localeCompare(b.date) || String(a.sessionSlot).localeCompare(String(b.sessionSlot)))
}

export function individualSignals(details) {
  const responses = details.responses || []
  const passes = details.workouts || []
  const dates = [...new Set([...responses.map((row) => row.date), ...passes.map((row) => row.date)])].sort()
  const trend = dates.map((date) => {
    const rows = responses.filter((row) => row.date === date)
    const after = rows.filter((row) => row.status === 'after')
    const activityTypes = new Set(after.map((row) => row.activityType || 'unknown'))
    const comparableAfter = activityTypes.size <= 1 ? after : []
    const activities = after.map((row) => ({ type: row.activityType || null, minutes: row.activityMinutes ?? null, distanceMeters: row.activityDistanceMeters ?? null, comment: row.comment || '', rpe: row.rpe, passRating: row.passRating, speedFeeling: row.speedFeeling }))
    const dayPasses = passes.filter((row) => row.date === date)
    const matched = dayPasses.filter((row) => ['slot', 'day_only'].includes(row.matchStatus))
    return { date, responses: rows.length, title: 'Dagens upplevelse', competition: rows.some((row) => row.competition), competitionReportDelayDays: Math.max(0, ...rows.filter((row) => row.competition).map((row) => row.reportDelayDays || 0)), activities, mixedActivities: activityTypes.size > 1, ...Object.fromEntries(keys.map((key) => [key, average(['rpe', 'speedFeeling', 'passRating'].includes(key) ? comparableAfter : rows, key)])), distanceMeters: matched.some((row) => row.distanceMeters != null) ? matched.reduce((sum, row) => sum + (row.distanceMeters || 0), 0) : null, durationMinutes: matched.some((row) => row.durationMinutes != null) ? matched.reduce((sum, row) => sum + (row.durationMinutes || 0), 0) : null }
  })
  const focusMap = new Map()
  passes.forEach((row) => {
    const key = row.focus || 'utan_fokus'
    const group = focusMap.get(key) || { label: key, rows: [] }
    group.rows.push(row); focusMap.set(key, group)
  })
  const focuses = [...focusMap.values()].map(({ label, rows }) => {
    const comparable = rows.filter((row) => ['slot', 'day_only'].includes(row.matchStatus) && ['slot', 'day_only'].includes(row.feedbackLink) && row.feedback)
    return { label, workouts: rows.length, distance: rows.reduce((sum, row) => sum + (row.distanceMeters || 0), 0), duration: rows.reduce((sum, row) => sum + (row.durationMinutes || 0), 0), responseCount: comparable.length, dates: comparable.map((row) => row.date), ...Object.fromEntries(keys.map((key) => [key, average(comparable.map((row) => row.feedback), key)])) }
  })
  const matched = passes.filter((row) => ['slot', 'day_only'].includes(row.matchStatus))
  const volume = { workouts: passes.length, matchedWorkouts: matched.length, unmatchedWorkouts: passes.length - matched.length, distanceMeters: matched.some((row) => row.distanceMeters != null) ? matched.reduce((sum, row) => sum + (row.distanceMeters || 0), 0) : null, durationMinutes: matched.some((row) => row.durationMinutes != null) ? matched.reduce((sum, row) => sum + (row.durationMinutes || 0), 0) : null, basis: 'Planerade meter/minuter för entydigt kopplade registrerade simpass. Inte uppmätt faktisk mängd och inte total tid inklusive gym/land. Saknade värden betyder inte noll.' }
  const evidence = []
  const add = (source, date, text) => { if (date && text) evidence.push({ id: `e${evidence.length + 1}`, source, date, text: String(text).slice(0, 1500) }) }
  responses.forEach((row) => add('checkin', row.date, `${row.status} (${row.activityType || 'träningstyp ej angiven'}; rapporterad tid ${row.activityMinutes ?? 'saknas'} min, distans ${row.activityDistanceMeters ?? 'saknas'} m): ${keys.filter((key) => row[key] != null).map((key) => `${key}=${row[key]}`).join(', ')}${row.comment ? `; Kommentar: ${row.comment}` : ''}`))
  passes.forEach((row) => add('workout', row.date, `${row.title}; fokus ${row.focus || 'saknas'}; ${row.sessionSlot}; passkoppling ${row.matchStatus}; feedbackkoppling ${row.feedbackLink}. Planerade meter ${row.distanceMeters ?? 'saknas'}, minuter ${row.durationMinutes ?? 'saknas'}. ${row.content || ''} ${row.note || ''}`))
  ;(details.coachNotes || []).forEach((row) => add('coach_note', row.date, row.text))
  ;(details.strengthLogs || []).forEach((row) => add('strength', row.date, `${row.program || 'Styrka'} pass ${row.pass}; ${JSON.stringify(row.weights)}; ${row.notes || ''}`))
  ;(details.competition?.resultsInPeriod || []).forEach((row) => add('competition', row.date, `${row.event}; ${row.pool}; ${row.time}; ${row.competition}; källa ${row.source}`))
return { trend, focuses, volume, evidence, linkage: { registeredSwimSessions: passes.length, matchedPasses: matched.length, passesWithComparableFeedback: passes.filter((row) => ['slot', 'day_only'].includes(row.matchStatus) && ['slot', 'day_only'].includes(row.feedbackLink)).length, ambiguousFeedback: passes.filter((row) => row.feedbackLink === 'ambiguous').length } }
}

const object = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })
const string = { type: 'string' }
const strings = { type: 'array', items: string }
export const individualInsightSchema = object({ summary: string, positives: strings, attention: strings, limitations: strings, findings: { type: 'array', items: object({ title: string, observation: string, kind: { type: 'string', enum: ['observation', 'pattern'] }, confidence: { type: 'string', enum: ['limited', 'moderate', 'strong'] }, evidenceIds: strings, hypothesis: string, alternativeExplanation: string, followUp: string }) } })

export function normalizeIndividualInsight(parsed, evidence, metadata) {
  const text = (value, max = 1500) => typeof value === 'string' ? value.slice(0, max) : ''
  const list = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 3).map((item) => item.slice(0, 500)) : []
  if (!parsed || !text(parsed.summary)) throw new Error('AI-svaret saknade en sammanfattning.')
  const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).slice(0, 4).map((finding) => {
    const refs = [...new Set(Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [])].map((id) => evidence.find((row) => row.id === id)).filter(Boolean).slice(0, 6)
    const recurrent = finding.kind === 'pattern' && new Set(refs.map((row) => row.date)).size >= 3
    return { title: text(finding.title, 120), observation: text(finding.observation), kind: recurrent ? 'pattern' : 'observation', confidence: recurrent && ['limited', 'moderate', 'strong'].includes(finding.confidence) ? finding.confidence : 'limited', evidence: refs, hypothesis: text(finding.hypothesis), alternativeExplanation: text(finding.alternativeExplanation), followUp: text(finding.followUp, 700) }
  }).filter((finding) => finding.observation && finding.evidence.length)
  return { summary: text(parsed.summary, 1800), positives: list(parsed.positives), attention: list(parsed.attention), limitations: list(parsed.limitations), findings, ...metadata }
}

export function swimmerVisibleInsight(saved) {
  if (!saved?.insight?.findings) return saved
  return { ...saved, insight: { ...saved.insight, findings: saved.insight.findings.map((finding) => ({ ...finding, evidence: (finding.evidence || []).map((row) => row.source === 'coach_note' ? { ...row, text: 'Tränarens dokumenterade observation.' } : row) })) } }
}
