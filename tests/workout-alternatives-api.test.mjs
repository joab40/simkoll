import test from 'node:test'
import assert from 'node:assert/strict'
import { groupSwimOccasions, planningAmountRange, swimWorkoutOptions, validWorkoutOption } from '../shared/swim-workout-options.js'
import { buildDiaryEntries } from '../shared/training-diary.js'

process.env.SUPABASE_URL = 'https://workout-alternatives.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const { loadWorkoutChoices } = await import('../server/workout-choice.js')
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'head_coach', email: 'coach@example.invalid' })
const date = '2026-10-29', groupId = '11111111-1111-4111-8111-111111111111'
const requestBody = () => ({ action: 'publish-workout-alternatives', publicationId: groupId, date, timeOfDay: 'afternoon', targetGroups: ['junior'], workouts: [['Bröstsim', 4400], ['Fjärilsim', 4400], ['Frisim-Ryggsim', 4900]].map(([title, distanceMeters], index) => ({ key: `sheet-${index}`, title, content: 'Insim\n200 eget\nSS:\n2x [\n  4x100 spec\n]', focus: 'f2_spec', distanceMeters, durationMinutes: 115 })) })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
async function call(body, token = code) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', query: {}, body, headers: { 'x-simkoll-code': token } }, response)
  return response
}
function fixture({ missingMigration = false } = {}) {
  const workouts = [], plans = [], writes = []
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), method = options.method || 'GET', table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'workout-alternatives.invalid')
    if (method !== 'GET') writes.push({ table, method, body: options.body ? JSON.parse(options.body) : null })
    if (table === 'app_settings') return json([])
    if (table === 'daily_workouts') {
      if (missingMigration) return json({ message: 'alternative_group_id missing from schema cache' }, 400)
      if (method === 'POST') {
        const input = JSON.parse(options.body)
        assert.equal(Array.isArray(input), true)
        assert.match(options.headers.Prefer, /resolution=ignore-duplicates/)
        const inserted = input.filter((row) => !workouts.some((old) => old.id === row.id))
        workouts.push(...inserted)
        return json(inserted)
      }
      return json(workouts)
    }
    if (table === 'training_plans') {
      if (method === 'POST') {
        const payload = JSON.parse(options.body), row = { id: `plan-${plans.length}`, ...payload }
        plans.push(row); return json([row])
      }
      if (method === 'PATCH') {
        const row = plans.find((plan) => `eq.${plan.id}` === url.searchParams.get('id'))
        assert.ok(row); Object.assign(row, JSON.parse(options.body)); return json([row])
      }
      return json(plans)
    }
    throw new Error(`Unexpected request: ${table}`)
  }
  return { workouts, plans, writes }
}

test('publication persists every alternative in one insert and creates separate linked planning rows', async () => {
  const state = fixture()
  const response = await call(requestBody())
  assert.equal(response.code, 200)
  assert.equal(response.data.workouts.length, 3)
  assert.equal(state.writes.filter((write) => write.table === 'daily_workouts').length, 1)
  assert.equal(state.plans.length, 3, 'same focus must not overwrite the previous alternative')
  assert.deepEqual(state.plans.map((plan) => plan.title), ['Bröstsim', 'Fjärilsim', 'Frisim-Ryggsim'])
  assert.equal(new Set(state.plans.map((plan) => plan.source_workout_id)).size, 3)
  assert.ok(state.plans.every((plan) => plan.alternative_group_id === groupId))
  assert.ok(response.data.workouts.every((row) => row.alternativeGroupId === groupId))
  const planning = state.plans.map((row) => ({ date, activityType: 'swim', timeOfDay: row.time_of_day, alternativeGroupId: row.alternative_group_id, distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes }))
  assert.equal(groupSwimOccasions(planning).length, 1)
  assert.deepEqual(planningAmountRange(planning, 'distanceMeters'), { min: 4400, max: 4900 })
  assert.deepEqual(planningAmountRange(planning, 'durationMinutes'), { min: 115, max: 115 })
})

test('retrying the same publication does not duplicate workouts, overwrite planning rows or publish changed content silently', async () => {
  const state = fixture(), body = requestBody()
  const first = await call(body), repeated = await call(body)
  assert.equal(repeated.code, 200)
  assert.deepEqual(repeated.data.workouts.map((row) => row.id), first.data.workouts.map((row) => row.id))
  assert.equal(state.workouts.length, 3)
  assert.equal(state.plans.length, 3)
  assert.equal(state.writes.filter((write) => write.table === 'daily_workouts').length, 1)
  body.workouts[0].distanceMeters = 4200
  assert.equal((await call(body)).code, 409)
  assert.equal(state.workouts[0].distance_meters, 4400)
})

test('invalid or unauthorized publications never write; missing SQL has an actionable error', async () => {
  for (const extra of [{ timeOfDay: '' }, { date: '2026-02-30' }, { targetGroups: [] }, { workouts: [] }, { workouts: [{ ...requestBody().workouts[0], distanceMeters: -1 }] }, { workouts: [requestBody().workouts[0], requestBody().workouts[0]] }]) {
    const state = fixture()
    assert.equal((await call({ ...requestBody(), ...extra })).code, 400)
    assert.equal(state.writes.length, 0)
  }
  let state = fixture()
  assert.equal((await call(requestBody(), '')).code, 403)
  assert.equal(state.writes.length, 0)
  state = fixture({ missingMigration: true })
  const response = await call(requestBody())
  assert.equal(response.code, 503)
  assert.match(response.data.error, /107/)
  assert.equal(state.writes.length, 0)
})

test('check-in offers only the swimmer’s alternatives and the diary credits one chosen workout', async () => {
  const state = fixture()
  await call(requestBody())
  const options = await loadWorkoutChoices(date, 'junior')
  assert.equal(options.length, 3)
  assert.ok(options.every((option) => validWorkoutOption(option, { date, slot: 'afternoon_swim', trainingGroup: 'junior' })))
  assert.equal((await loadWorkoutChoices(date, 'other-group')).length, 0)
  const [entry] = buildDiaryEntries({ sessions: [{ session_date: date, session_slot: 'afternoon_swim', activity_type: 'swim' }], responses: [{ day_type: 'after', activity_date: date, session_slot: 'afternoon_swim', activity_type: 'swim', created_at: `${date}T18:00:00Z`, planned_completion: 'full', workout_reference: `workout:${state.workouts[2].id}` }], workouts: state.workouts, plans: state.plans, trainingGroup: 'junior', today: '2026-10-30' })
  assert.equal(entry.title, 'Frisim-Ryggsim')
  assert.equal(entry.estimatedMeters, 4900)
  assert.equal(entry.estimatedMinutes, 115)
})

test('bundle IDs group only the same day and slot; independent workouts remain separate', () => {
  const options = requestBody().workouts.map((workout) => ({ ...workout, date, activityType: 'swim', timeOfDay: 'afternoon', alternativeGroupId: groupId }))
  const separate = { ...options[0], alternativeGroupId: null }
  assert.equal(groupSwimOccasions([...options, separate]).length, 2)
  assert.equal(groupSwimOccasions([options[0], { ...options[1], date: '2026-10-30' }]).length, 2)
  assert.equal(groupSwimOccasions([options[0], { ...options[1], timeOfDay: 'morning' }]).length, 2)
  assert.equal(swimWorkoutOptions(options, []).length, 3)
})

test('manually linking a published alternative preserves its group in planning', async () => {
  const state = fixture()
  await call(requestBody())
  state.plans.length = 0 // Simulate planning not having been synchronized yet.
  const response = await call({ action: 'save-plan', date, activityType: 'swim', title: 'Bröstsim', timeOfDay: 'afternoon', targetGroups: ['junior'], sourceWorkoutId: state.workouts[0].id })
  assert.equal(response.code, 200)
  assert.equal(response.data.plan.alternativeGroupId, groupId)
  assert.equal(state.plans[0].alternative_group_id, groupId)
})
