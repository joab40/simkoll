import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://analytics-pagination.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'fixture-coach'
const { default: handler } = await import('../api/analytics.js')
const { analyticsRows } = await import('../server/analytics-rows.js')
const query = { start: '2026-09-30T22:00:00.000Z', end: '2026-10-29T23:00:00.000Z', previousStart: '2026-09-01T22:00:00.000Z', previousEnd: '2026-09-30T22:00:00.000Z', period: 'this_month' }
const profiles = Array.from({ length: 6 }, (_, index) => ({ id: `swimmer-${index}`, created_at: '2026-01-01T00:00:00Z', training_group: 'junior' }))
const replies = (date, count, rpe) => Array.from({ length: count }, (_, index) => ({ id: `${date}-${index}`, profile_id: profiles[index % profiles.length].id, activity_date: date, created_at: `${date}T15:00:00Z`, day_type: 'after', activity_type: 'swim', feeling: 4, body: 3, rpe, speed_feeling: 4, pass_rating: 5 }))
const invoke = async () => {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'GET', headers: { 'x-simkoll-code': 'fixture-coach' }, query }, response)
  return response
}

test('month graph retains recent ratings after more than 1000 rows across comparison periods', async () => {
  const responses = [...replies('2026-09-15', 700, 5), ...replies('2026-10-10', 600, 6), ...replies('2026-10-29', 12, 8)]
  const sessions = Array.from({ length: 1203 }, (_, index) => ({ id: `session-${index}`, profile_id: profiles[index % profiles.length].id, session_date: '2026-10-29', activity_type: 'swim', session_slot: 'afternoon_swim' }))
  const activities = Array.from({ length: 1203 }, (_, index) => ({ profile_id: `activity-${index}`, activity_date: index === 1202 ? '2026-10-29' : '2026-10-10' }))
  const pages = []
  globalThis.fetch = async (raw) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'analytics-pagination.invalid')
    const data = ({ responses, personal_training_sessions: sessions, profile_daily_activity: activities, profiles,
      daily_workouts: [{ id: 'latest', workout_date: '2026-10-29', title: 'Senaste passet', distance_meters: 4500, duration_minutes: 90 }],
    })[table] || []
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Math.min(1000, Number(url.searchParams.get('limit') || 1000))
    if (['responses', 'personal_training_sessions', 'profile_daily_activity'].includes(table)) pages.push({ table, offset })
    return new Response(JSON.stringify(data.slice(offset, offset + limit)))
  }
  const result = await invoke()
  assert.equal(result.code, 200)
  assert.equal(result.data.current.checkins, 612)
  assert.equal(result.data.previous.checkins, 700)
  assert.equal(result.data.current.swimSessions, 1203)
  assert.equal(result.data.current.activeDays, 2)
  const latest = result.data.workoutAnalysis.trend.find((item) => item.date === '2026-10-29')
  assert.equal(latest.count, 12)
  assert.equal(latest.rpe, 8)
  assert.equal(latest.feeling, 4)
  assert.equal(latest.passRating, 5)
  for (const table of ['responses', 'personal_training_sessions', 'profile_daily_activity']) {
    assert.ok(pages.some((page) => page.table === table && page.offset === 1000))
  }
})

test('later-page failure never returns a successful partial analysis dataset', async () => {
  let calls = 0
  const failure = { ok: false, status: 503 }
  const result = await analyticsRows('responses?order=id.asc', async () => ++calls === 1 ? { ok: true, json: async () => Array(500).fill({}) } : failure)
  assert.equal(result, failure)
  assert.equal(calls, 2)
})

test('safety ceiling is explicitly flagged instead of pretending the dataset is complete', async () => {
  const result = await analyticsRows('responses?order=id.asc', async () => ({ ok: true, json: async () => Array(500).fill({}) }))
  assert.equal((await result.json()).length, 10000)
  assert.equal(result.truncated, true)
})
