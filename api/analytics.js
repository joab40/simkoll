import { getRole, sendJson, supabaseRequest } from '../server/supabase.js'
import { getSessionProfile } from '../server/profile-auth.js'

const stockholmKey = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const addDays = (date, days) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10) }
const mondayOnOrAfter = (date) => { const value = new Date(`${date}T12:00:00Z`), offset = (value.getUTCDay() + 6) % 7; return offset === 0 ? date : addDays(date, 7 - offset) }
const mondayFor = (date) => { const value = new Date(`${date}T12:00:00Z`), offset = (value.getUTCDay() + 6) % 7; return addDays(date, -offset) }
const mean = (rows, key) => {
  const values = rows.map((row) => row[key]).filter((value) => typeof value === 'number')
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
}
const meanValues = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
const metrics = (responses, sessions, activities, privateView) => {
  const after = responses.filter((item) => item.day_type === 'after')
  const enough = privateView || responses.length >= 3
  return {
    checkins: responses.length,
    activeDays: new Set(activities.map((item) => item.activity_date)).size,
    sickDays: new Set(responses.filter((item) => item.day_type === 'sick').map((item) => stockholmKey(item.created_at))).size,
    restDays: new Set(responses.filter((item) => item.day_type === 'rest').map((item) => stockholmKey(item.created_at))).size,
    swimSessions: sessions.filter((item) => item.activity_type === 'swim').length,
    strengthSessions: sessions.filter((item) => item.activity_type === 'strength').length,
    drylandSessions: sessions.filter((item) => item.activity_type === 'dryland').length,
    feeling: enough ? mean(responses, 'feeling') : null,
    body: enough ? mean(responses, 'body') : null,
    energy: enough ? mean(responses, 'energy') : null,
    rpe: enough ? mean(after, 'rpe') : null,
    speedFeeling: enough ? mean(after, 'speed_feeling') : null,
    passRating: enough ? mean(after, 'pass_rating') : null,
    setupRating: enough ? mean(after, 'setup_rating') : null,
  }
}

const cleanNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const fallbackInsight = (data) => {
  const current = data.current || {}
  const parts = []
  if (current.checkins != null) parts.push(`${current.checkins} incheckningar`)
  if (current.feeling != null) parts.push(`allmän känsla ${current.feeling}/5`)
  if (current.body != null) parts.push(`kropp ${current.body}/5`)
  if (current.rpe != null) parts.push(`upplevd ansträngning ${current.rpe}/10`)
  const summary = parts.length ? `Under perioden syns ${parts.join(', ')}.` : 'Det finns ännu för lite data för en tydlig sammanfattning.'
  const positives = []
  if (current.swimSessions) positives.push(`${current.swimSessions} registrerade simpass`)
  if (current.activeDays) positives.push(`Aktivitet registrerad ${current.activeDays} dagar`)
  const attention = []
  if (current.body != null && current.body <= 2) attention.push('Kroppskänslan är låg och kan vara värd att följa upp.')
  if (current.rpe != null && current.rpe >= 8) attention.push('Den upplevda ansträngningen är hög.')
  return { summary, positives: positives.slice(0, 3), attention: attention.slice(0, 3), limitations: ['Automatisk reservsammanfattning – kontrollera trenden mot tidigare perioder.'] }
}

async function createAiInsight(request, response) {
  const gatewayKey = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY
  if (!gatewayKey) return sendJson(response, 503, { error: 'AI Gateway är inte konfigurerad ännu.' })
  const input = request.body?.data || {}, periodLabel = String(request.body?.periodLabel || 'vald period').slice(0, 80)
  const current = input.current || {}, previous = input.previous || {}, analysis = input.workoutAnalysis || {}
  const safe = {
    period: periodLabel,
    current: { checkins: cleanNumber(current.checkins), activeDays: cleanNumber(current.activeDays), sickDays: cleanNumber(current.sickDays), restDays: cleanNumber(current.restDays), feeling: cleanNumber(current.feeling), body: cleanNumber(current.body), rpe: cleanNumber(current.rpe), speedFeeling: cleanNumber(current.speedFeeling), passRating: cleanNumber(current.passRating), swimSessions: cleanNumber(current.swimSessions), strengthSessions: cleanNumber(current.strengthSessions), drylandSessions: cleanNumber(current.drylandSessions) },
    previous: { feeling: cleanNumber(previous.feeling), body: cleanNumber(previous.body), rpe: cleanNumber(previous.rpe), passRating: cleanNumber(previous.passRating), swimSessions: cleanNumber(previous.swimSessions), strengthSessions: cleanNumber(previous.strengthSessions), drylandSessions: cleanNumber(previous.drylandSessions) },
    workouts: (analysis.focuses || []).slice(0, 20).map((item) => ({ label: String(item.label || '').slice(0, 40), workouts: cleanNumber(item.workouts), distance: cleanNumber(item.distance), duration: cleanNumber(item.duration), feeling: cleanNumber(item.feeling), body: cleanNumber(item.body), rpe: cleanNumber(item.rpe), passRating: cleanNumber(item.passRating), responseCount: cleanNumber(item.responseCount) })),
    workload: (analysis.workload || []).slice(-12).map((item) => ({ weekStart: String(item.weekStart || '').slice(0, 10), workouts: cleanNumber(item.workouts), distance: cleanNumber(item.distance), duration: cleanNumber(item.duration) })),
  }
  const prompt = `Du är ett försiktigt analysstöd för simtränare. Analysera endast datan nedan. Skriv på svenska, konkret och uppmuntrande. Dra inga medicinska slutsatser och hitta inte på orsaker. Om underlaget är litet, säg det tydligt. Jämför bara med föregående period när båda värdena finns. Returnera ENDAST giltig JSON med exakt dessa nycklar: summary (max 280 tecken), positives (array med max 3 korta strängar), attention (array med max 3 korta strängar), limitations (array med max 2 korta strängar). Data: ${JSON.stringify(safe)}`
  try {
    // Free model on Vercel AI Gateway, suitable for Hobby projects without paid credits.
    const result = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayKey}` }, body: JSON.stringify({ model: 'inclusionai/ling-3.0-flash-fin-free', temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) { const detail = (await result.text()).slice(0, 300); throw new Error(`AI Gateway request failed: ${result.status} ${detail}`) }
    const payload = await result.json(), rawText = payload.choices?.[0]?.message?.content || ''
    // Models occasionally wrap JSON in markdown or a short explanation. Extract
    // the first complete object before parsing instead of failing the whole insight.
    const text = String(rawText).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const firstBrace = text.indexOf('{'), lastBrace = text.lastIndexOf('}')
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch (parseError) {
      // Keep the endpoint useful if a free model returns malformed JSON.
      // The raw response is still shown as a short summary, never as an error page.
      console.warn('AI returned invalid JSON:', String(rawText).slice(0, 500), parseError.message)
      parsed = fallbackInsight(safe)
    }
    return sendJson(response, 200, { insight: { summary: String(parsed.summary || ''), positives: Array.isArray(parsed.positives) ? parsed.positives.slice(0, 3).map(String) : [], attention: Array.isArray(parsed.attention) ? parsed.attention.slice(0, 3).map(String) : [], limitations: Array.isArray(parsed.limitations) ? parsed.limitations.slice(0, 2).map(String) : [] } })
  } catch (error) { console.error(error); return sendJson(response, 502, { error: 'AI-sammanfattningen kunde inte skapas just nu.' }) }
}

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  if (request.method === 'POST' && request.body?.action === 'ai-insights') {
    if (role !== 'coach') return sendJson(response, 403, { error: 'AI-sammanfattningar är bara tillgängliga för tränare.' })
    return createAiInsight(request, response)
  }
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  const sessionProfile = role === 'swimmer' ? await getSessionProfile(request) : null
  if (role !== 'coach' && role !== 'swimmer') return sendJson(response, 403, { error: 'Du behöver logga in igen.' })
  const start = String(request.query?.start || ''), end = String(request.query?.end || ''), previousStart = String(request.query?.previousStart || ''), previousEnd = String(request.query?.previousEnd || start)
  const profileId = request.query?.profileId ? String(request.query.profileId) : null
  if (role === 'swimmer' && (!sessionProfile || profileId !== sessionProfile.id)) return sendJson(response, 403, { error: 'Du kan bara se din egen statistik.' })
  if ([start, end, previousStart, previousEnd].some((value) => Number.isNaN(Date.parse(value))) || !(previousStart < previousEnd && previousEnd <= start && start < end)) return sendJson(response, 400, { error: 'Ogiltig period.' })
  const profileFilter = profileId ? `&profile_id=eq.${encodeURIComponent(profileId)}` : ''
  const timestampRange = `&created_at=gte.${encodeURIComponent(previousStart)}&created_at=lt.${encodeURIComponent(end)}`
  const previousStartDay = stockholmKey(previousStart), endDay = stockholmKey(end)
  const requestToday = stockholmKey(new Date()), requestMonday = mondayFor(requestToday)
  const sessionQueryStart = profileId && requestMonday < previousStartDay ? requestMonday : previousStartDay
  const sessionQueryEnd = profileId && addDays(requestMonday, 7) > endDay ? addDays(requestMonday, 7) : endDay
  try {
    const [responsesResult, sessionsResult, activityResult, goalsResult, crossGoalsResult, workoutsResult] = await Promise.all([
      supabaseRequest(`responses?select=created_at,day_type,feeling,energy,body,rpe,speed_feeling,pass_rating,setup_rating,comment${profileFilter}${timestampRange}&order=created_at.asc&limit=10000`),
      supabaseRequest(`personal_training_sessions?select=profile_id,activity_type,completed_at,session_date${profileFilter}&session_date=gte.${sessionQueryStart}&session_date=lt.${sessionQueryEnd}&limit=10000`),
      supabaseRequest(`profile_daily_activity?select=profile_id,activity_date${profileFilter}&activity_date=gte.${stockholmKey(previousStart)}&activity_date=lt.${stockholmKey(end)}&limit=10000`),
      profileId ? supabaseRequest(`season_swim_goals?profile_id=eq.${encodeURIComponent(profileId)}&select=*&order=start_date.asc`) : Promise.resolve(null),
      profileId ? supabaseRequest(`cross_training_goals?profile_id=eq.${encodeURIComponent(profileId)}&select=*&order=start_date.asc`) : Promise.resolve(null),
      supabaseRequest(`daily_workouts?select=workout_date,focus,distance_meters,duration_minutes&workout_date=gte.${previousStartDay}&workout_date=lt.${endDay}&order=workout_date.asc&limit=1000`),
    ])
    if (![responsesResult, sessionsResult, activityResult, workoutsResult].every((result) => result.ok) || (goalsResult && !goalsResult.ok) || (crossGoalsResult && !crossGoalsResult.ok)) throw new Error('Analytics lookup failed')
    let responses = await responsesResult.json(), sessions = await sessionsResult.json(), activities = await activityResult.json(), workouts = await workoutsResult.json()
    if (!profileId) {
      const testProfiles = await supabaseRequest('profiles?is_test_profile=eq.true&select=id')
      if (!testProfiles.ok) throw new Error('Test profile lookup failed')
      const testIds = new Set((await testProfiles.json()).map((item) => item.id))
      responses = responses.filter((item) => !testIds.has(item.profile_id))
      sessions = sessions.filter((item) => !testIds.has(item.profile_id))
      activities = activities.filter((item) => !testIds.has(item.profile_id))
    }
    const currentResponses = responses.filter((item) => item.created_at >= start), previousResponses = responses.filter((item) => item.created_at < previousEnd)
    const currentStartDay = stockholmKey(start), previousEndDay = stockholmKey(previousEnd)
    const currentSessions = sessions.filter((item) => item.session_date >= currentStartDay && item.session_date < endDay), previousSessions = sessions.filter((item) => item.session_date >= previousStartDay && item.session_date < previousEndDay)
    const currentActivities = activities.filter((item) => item.activity_date >= currentStartDay), previousActivities = activities.filter((item) => item.activity_date < previousEndDay)
    const currentWorkouts = workouts.filter((item) => item.workout_date >= currentStartDay && item.workout_date < endDay)
    const spanDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000))
    const buckets = new Map()
    currentResponses.forEach((item) => {
      const date = new Date(item.created_at)
      let key = stockholmKey(date)
      if (spanDays > 14) {
        const weekday = (date.getUTCDay() + 6) % 7
        const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - weekday)
        key = stockholmKey(monday)
      }
      buckets.set(key, [...(buckets.get(key) || []), item])
    })
    const privateView = Boolean(profileId)
    const workoutFocusLabel = { kondition_frisim: 'Kondition frisim', kondition_special: 'Kondition special', fart: 'Fart', troskel: 'Tröskel', syra: 'Syra', f2_frisim: 'F2 Frisim', f2_spec: 'F2 Spec', distans: 'Distans', teknik: 'Teknik', aterhamtning: 'Återhämtning' }
    const workoutFocusMap = new Map()
    currentWorkouts.forEach((workout) => {
      const dayRows = currentResponses.filter((item) => stockholmKey(item.created_at) === workout.workout_date)
      const afterRows = dayRows.filter((item) => item.day_type === 'after')
      const enoughResponses = privateView || dayRows.length >= 3
      const key = workout.focus || 'utan_fokus'
      const entry = workoutFocusMap.get(key) || { focus: key, label: workoutFocusLabel[key] || 'Ingen inriktning', workouts: 0, distance: 0, duration: 0, responseDays: 0, responseCount: 0, feeling: [], body: [], rpe: [], passRating: [] }
      entry.workouts += 1; entry.distance += Number(workout.distance_meters || 0); entry.duration += Number(workout.duration_minutes || 0); entry.responseCount += dayRows.length
      if (dayRows.length) entry.responseDays += 1
      if (enoughResponses) { entry.feeling.push(...dayRows.map((item) => item.feeling).filter((value) => typeof value === 'number')); entry.body.push(...dayRows.map((item) => item.body).filter((value) => typeof value === 'number')); entry.rpe.push(...afterRows.map((item) => item.rpe).filter((value) => typeof value === 'number')); entry.passRating.push(...afterRows.map((item) => item.pass_rating).filter((value) => typeof value === 'number')) }
      workoutFocusMap.set(key, entry)
    })
    const workoutFocus = [...workoutFocusMap.values()].map((item) => ({ focus: item.focus, label: item.label, workouts: item.workouts, distance: item.distance || null, duration: item.duration || null, responseDays: item.responseDays, responseCount: item.responseCount, feeling: meanValues(item.feeling), body: meanValues(item.body), rpe: meanValues(item.rpe), passRating: meanValues(item.passRating) }))
    const workloadMap = new Map()
    currentWorkouts.forEach((workout) => { const date = new Date(`${workout.workout_date}T12:00:00Z`), monday = new Date(date); monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); const key = monday.toISOString().slice(0, 10); const entry = workloadMap.get(key) || { weekStart: key, workouts: 0, distance: 0, duration: 0 }; entry.workouts += 1; entry.distance += Number(workout.distance_meters || 0); entry.duration += Number(workout.duration_minutes || 0); workloadMap.set(key, entry) })
    const workoutAnalysis = { focuses: workoutFocus, workload: [...workloadMap.values()] }
    let goalProgress = null, currentWeekGoal = null, crossProgress = null, currentCrossGoals = null
    if (profileId) {
      const goals = await goalsResult.json(), today = requestToday, currentMonday = requestMonday
      const periodStart = stockholmKey(start), periodEnd = stockholmKey(end)
      let expected = 0, completed = 0, weeksReached = 0, weeksCount = 0
      goals.forEach((goal) => {
        for (let monday = mondayOnOrAfter(goal.start_date); addDays(monday, 6) <= goal.end_date && monday < periodEnd; monday = addDays(monday, 7)) {
          if (monday < periodStart) continue
          const actual = sessions.filter((session) => session.activity_type === 'swim' && session.session_date >= monday && session.session_date < addDays(monday, 7)).length
          expected += goal.target_sessions_per_week; completed += actual; weeksCount += 1
          if (actual >= goal.target_sessions_per_week) weeksReached += 1
        }
      })
      if (weeksCount) goalProgress = { expected, completed, weeksReached, weeksCount, percentage: Math.round((completed / expected) * 100) }
      const active = goals.find((goal) => goal.active && goal.start_date <= today && goal.end_date >= today)
      if (active) {
        const actual = sessions.filter((session) => session.activity_type === 'swim' && session.session_date >= currentMonday && session.session_date < addDays(currentMonday, 7)).length
        currentWeekGoal = { target: active.target_sessions_per_week, completed: actual, remaining: Math.max(0, active.target_sessions_per_week - actual), percentage: Math.round((actual / active.target_sessions_per_week) * 100) }
      }
      const crossGoals = await crossGoalsResult.json()
      const totals = { strength: { expected: 0, completed: 0, weeksReached: 0, weeksCount: 0 }, dryland: { expected: 0, completed: 0, weeksReached: 0, weeksCount: 0 } }
      crossGoals.forEach((goal) => {
        const goalEnd = goal.end_date || addDays(currentMonday, -1)
        for (let monday = mondayOnOrAfter(goal.start_date); addDays(monday, 6) <= goalEnd && monday < periodEnd; monday = addDays(monday, 7)) {
          if (monday < periodStart) continue
          ;[['strength', goal.strength_sessions_per_week], ['dryland', goal.dryland_sessions_per_week]].forEach(([type, target]) => {
            if (!target) return
            const actual = sessions.filter((session) => session.activity_type === type && session.session_date >= monday && session.session_date < addDays(monday, 7)).length
            totals[type].expected += target; totals[type].completed += actual; totals[type].weeksCount += 1
            if (actual >= target) totals[type].weeksReached += 1
          })
        }
      })
      crossProgress = Object.fromEntries(Object.entries(totals).map(([type, item]) => [type, item.weeksCount ? { ...item, percentage: Math.round((item.completed / item.expected) * 100) } : null]))
      const activeCross = crossGoals.find((goal) => goal.start_date <= today && (!goal.end_date || goal.end_date >= today))
      if (activeCross) currentCrossGoals = Object.fromEntries([['strength', activeCross.strength_sessions_per_week], ['dryland', activeCross.dryland_sessions_per_week]].map(([type, target]) => { const completed = sessions.filter((session) => session.activity_type === type && session.session_date >= currentMonday && session.session_date < addDays(currentMonday, 7)).length; return [type, { target, completed, remaining: Math.max(0, target - completed), percentage: target ? Math.round((completed / target) * 100) : 0 }] }))
    }
    return sendJson(response, 200, {
      current: metrics(currentResponses, currentSessions, currentActivities, privateView),
      previous: metrics(previousResponses, previousSessions, previousActivities, privateView),
      trend: [...buckets.entries()].map(([date, rows]) => ({ date, count: rows.length, feeling: privateView || rows.length >= 3 ? mean(rows, 'feeling') : null, body: privateView || rows.length >= 3 ? mean(rows, 'body') : null, rpe: privateView || rows.length >= 3 ? mean(rows.filter((item) => item.day_type === 'after'), 'rpe') : null })),
      recent: privateView ? currentResponses.filter((item) => item.comment).slice(-10).reverse().map((item) => ({ date: item.created_at, feeling: item.feeling, comment: item.comment })) : [],
      privacyLimited: !privateView && currentResponses.length > 0 && currentResponses.length < 3,
      goalProgress, currentWeekGoal, crossProgress, currentCrossGoals,
      workoutAnalysis,
    })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: 'Kunde inte hämta analysen.' })
  }
}
