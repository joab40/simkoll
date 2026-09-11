import { getRole, sendJson } from '../server/supabase.js'

const cleanNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null

export default async function handler(request, response) {
  const role = getRole(String(request.headers['x-simkoll-code'] || ''))
  if (role !== 'coach') return sendJson(response, 403, { error: 'AI-sammanfattningar är bara tillgängliga för tränare.' })
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
  if (!process.env.AI_GATEWAY_API_KEY) return sendJson(response, 503, { error: 'AI Gateway är inte konfigurerad ännu.' })

  const input = request.body?.data || {}, periodLabel = String(request.body?.periodLabel || 'vald period').slice(0, 80)
  const current = input.current || {}, previous = input.previous || {}, analysis = input.workoutAnalysis || {}
  const safe = {
    period: periodLabel,
    current: {
      checkins: cleanNumber(current.checkins), activeDays: cleanNumber(current.activeDays), sickDays: cleanNumber(current.sickDays), restDays: cleanNumber(current.restDays), feeling: cleanNumber(current.feeling), body: cleanNumber(current.body), rpe: cleanNumber(current.rpe), passRating: cleanNumber(current.passRating), swimSessions: cleanNumber(current.swimSessions), strengthSessions: cleanNumber(current.strengthSessions), drylandSessions: cleanNumber(current.drylandSessions),
    },
    previous: { feeling: cleanNumber(previous.feeling), body: cleanNumber(previous.body), rpe: cleanNumber(previous.rpe), passRating: cleanNumber(previous.passRating), swimSessions: cleanNumber(previous.swimSessions), strengthSessions: cleanNumber(previous.strengthSessions), drylandSessions: cleanNumber(previous.drylandSessions) },
    workouts: (analysis.focuses || []).slice(0, 20).map((item) => ({ label: String(item.label || '').slice(0, 40), workouts: cleanNumber(item.workouts), distance: cleanNumber(item.distance), duration: cleanNumber(item.duration), feeling: cleanNumber(item.feeling), body: cleanNumber(item.body), rpe: cleanNumber(item.rpe), passRating: cleanNumber(item.passRating), responseCount: cleanNumber(item.responseCount) })),
    workload: (analysis.workload || []).slice(-12).map((item) => ({ weekStart: String(item.weekStart || '').slice(0, 10), workouts: cleanNumber(item.workouts), distance: cleanNumber(item.distance), duration: cleanNumber(item.duration) })),
  }
  const prompt = `Du är ett försiktigt analysstöd för simtränare. Analysera endast datan nedan. Skriv på svenska, konkret och uppmuntrande. Dra inga medicinska slutsatser och hitta inte på orsaker. Om underlaget är litet, säg det tydligt. Jämför bara med föregående period när båda värdena finns. Returnera ENDAST giltig JSON med exakt dessa nycklar: summary (max 280 tecken), positives (array med max 3 korta strängar), attention (array med max 3 korta strängar), limitations (array med max 2 korta strängar). Data: ${JSON.stringify(safe)}`
  try {
    const result = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` }, body: JSON.stringify({ model: 'openai/gpt-5.5', temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: 'Du returnerar alltid strikt JSON utan markdown.' }, { role: 'user', content: prompt }] }) })
    if (!result.ok) throw new Error(`AI Gateway request failed: ${result.status}`)
    const payload = await result.json(), text = payload.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''))
    return sendJson(response, 200, { insight: { summary: String(parsed.summary || ''), positives: Array.isArray(parsed.positives) ? parsed.positives.slice(0, 3).map(String) : [], attention: Array.isArray(parsed.attention) ? parsed.attention.slice(0, 3).map(String) : [], limitations: Array.isArray(parsed.limitations) ? parsed.limitations.slice(0, 2).map(String) : [] } })
  } catch (error) {
    console.error(error)
    return sendJson(response, 502, { error: 'AI-sammanfattningen kunde inte skapas just nu.' })
  }
}
