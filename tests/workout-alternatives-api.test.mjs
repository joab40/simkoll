import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
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
async function call(body, token = code, method = 'POST') {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method, query: method === 'GET' ? body : {}, body: method === 'GET' ? undefined : body, headers: { 'x-simkoll-code': token } }, response)
  return response
}
function fixture({ missingMigration = false, missingMigrationOnWrite = false, initialWorkouts = [], initialPlans = [] } = {}) {
  const workouts = structuredClone(initialWorkouts), plans = structuredClone(initialPlans), writes = []
  const matches = (rows, url) => rows.filter((row) => [...url.searchParams].every(([key, value]) => {
    if (['id', 'workout_date', 'plan_date', 'source_workout_id', 'alternative_group_id'].includes(key)) {
      if (value === 'is.null') return row[key] == null
      if (value.startsWith('eq.')) return row[key] === value.slice(3)
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(row[key])
    }
    return true
  }))
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), method = options.method || 'GET', table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'workout-alternatives.invalid')
    if (method !== 'GET') writes.push({ table, method, body: options.body ? JSON.parse(options.body) : null })
    if (table === 'app_settings') return json([])
    if (table === 'daily_workouts') {
      if (missingMigration || (missingMigrationOnWrite && method !== 'GET')) return json({ message: 'alternative_group_id missing from schema cache' }, 400)
      if (method === 'POST') {
        const input = JSON.parse(options.body)
        if (Array.isArray(input)) assert.match(options.headers.Prefer, /resolution=ignore-duplicates/)
        const inserted = (Array.isArray(input) ? input : [{ id: randomUUID(), ...input }]).filter((row) => !workouts.some((old) => old.id === row.id))
        workouts.push(...inserted)
        return json(inserted)
      }
      if (method === 'PATCH') {
        const selected = matches(workouts, url)
        selected.forEach((row) => Object.assign(row, JSON.parse(options.body)))
        return json(selected)
      }
      return json(matches(workouts, url))
    }
    if (table === 'training_plans') {
      if (method === 'POST') {
        const payload = JSON.parse(options.body), row = { id: randomUUID(), ...payload }
        plans.push(row); return json([row])
      }
      if (method === 'PATCH') {
        const row = plans.find((plan) => `eq.${plan.id}` === url.searchParams.get('id'))
        assert.ok(row); Object.assign(row, JSON.parse(options.body)); return json([row])
      }
      return json(matches(plans, url))
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

const firstId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const secondId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
const standalone = (extra = {}) => ({ id: firstId, workout_date: date, title: 'Bröstsim', content: '4x100 br', distance_meters: 4400, duration_minutes: 115, time_of_day: 'afternoon', target_groups: ['junior'], alternative_group_id: null, ...extra })
const saveBody = (extra = {}) => ({ date, title: 'Frisim', content: '4x100 fr', focus: 'f2_spec', timeOfDay: 'afternoon', distanceMeters: 4900, durationMinutes: 115, targetGroups: ['junior'], occasionMode: 'existing', alternativeToWorkoutId: firstId, ...extra })

test('missing migration detected only at publication still returns an actionable error', async () => {
  for (const body of [requestBody(), saveBody({ occasionMode: 'new' })]) {
    const state = fixture({ missingMigrationOnWrite: true })
    const response = await call(body)
    assert.equal(response.code, 503)
    assert.match(response.data.error, /107/)
    assert.equal(state.workouts.length, 0)
    assert.equal(state.plans.length, 0)
  }
})
const asPlanning = (plans) => plans.map((row) => ({ date: row.plan_date, activityType: 'swim', timeOfDay: row.time_of_day, alternativeGroupId: row.alternative_group_id, distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes }))

test('a separately published alternative groups with the original and credits only the swimmer’s choice', async () => {
  const state = fixture({ initialWorkouts: [standalone()] })
  const added = await call(saveBody())
  assert.equal(added.code, 200)
  assert.equal(state.workouts.length, 2)
  assert.ok(state.workouts.every((row) => row.alternative_group_id === firstId))
  assert.equal(state.plans.length, 2)
  assert.deepEqual(planningAmountRange(asPlanning(state.plans), 'distanceMeters'), { min: 4400, max: 4900 })
  assert.equal(groupSwimOccasions(asPlanning(state.plans)).length, 1)
  const choices = await call({ occasionChoices: 'true', date }, code, 'GET')
  assert.equal(choices.code, 200)
  assert.equal(choices.data.occasions.length, 1)
  assert.deepEqual(choices.data.occasions[0].titles, ['Bröstsim', 'Frisim'])
  const [entry] = buildDiaryEntries({ sessions: [{ session_date: date, session_slot: 'afternoon_swim', activity_type: 'swim' }], responses: [{ day_type: 'after', activity_date: date, session_slot: 'afternoon_swim', activity_type: 'swim', created_at: `${date}T18:00:00Z`, planned_completion: 'full', workout_reference: `workout:${added.data.workout.id}` }], workouts: state.workouts, plans: state.plans, trainingGroup: 'junior', today: '2026-10-30' })
  assert.equal(entry.estimatedMeters, 4900)
  assert.equal(entry.estimatedMinutes, 115)
})

test('already published separate workouts can be joined and explicitly separated again', async () => {
  const state = fixture({ initialWorkouts: [standalone(), standalone({ id: secondId, title: 'Frisim', distance_meters: 4900 })] })
  const joined = await call(saveBody({ id: secondId }))
  assert.equal(joined.code, 200)
  assert.equal(state.workouts.length, 2)
  assert.equal(state.plans.length, 2)
  assert.ok(state.plans.every((row) => row.alternative_group_id === firstId))
  const detached = await call(saveBody({ id: secondId, occasionMode: 'new', alternativeToWorkoutId: '' }))
  assert.equal(detached.code, 200)
  assert.notEqual(detached.data.workout.alternativeGroupId, firstId)
  assert.equal(groupSwimOccasions(asPlanning(state.plans)).length, 2)
  assert.deepEqual(planningAmountRange(asPlanning(state.plans), 'distanceMeters'), { min: 9300, max: 9300 })
})

test('two explicit new occasions in the same afternoon keep separate groups and planning rows', async () => {
  const state = fixture()
  const a = await call(saveBody({ title: 'Första träningen', occasionMode: 'new', alternativeToWorkoutId: '' }))
  const b = await call(saveBody({ title: 'Andra träningen', occasionMode: 'new', alternativeToWorkoutId: '' }))
  assert.equal(a.code, 200)
  assert.equal(b.code, 200)
  assert.notEqual(a.data.workout.alternativeGroupId, b.data.workout.alternativeGroupId)
  assert.equal(state.plans.length, 2)
  assert.equal(groupSwimOccasions(asPlanning(state.plans)).length, 2)
  assert.deepEqual(planningAmountRange(asPlanning(state.plans), 'distanceMeters'), { min: 9800, max: 9800 })
})

test('wrong date, slot, group, self-link, removed target and invalid mode fail before writes', async () => {
  for (const extra of [{ date: '2026-10-30' }, { timeOfDay: 'morning' }, { targetGroups: ['other'] }, { id: firstId }, { alternativeToWorkoutId: secondId }, { occasionMode: 'unknown' }, { alternativeToWorkoutId: '' }]) {
    const state = fixture({ initialWorkouts: [standalone()] })
    const result = await call(saveBody(extra))
    assert.ok([400, 409].includes(result.code), JSON.stringify(result.data))
    assert.equal(state.writes.length, 0)
    assert.equal(state.workouts[0].alternative_group_id, null)
  }
  const state = fixture({ initialWorkouts: [standalone()] })
  assert.equal((await call({ occasionChoices: 'true', date }, '', 'GET')).code, 403)
  assert.equal(state.writes.length, 0)
})

test('legacy calendar alternatives are promoted together and new alternatives inherit the calendar', async () => {
  const calendarLink = { mode: 'linked', key: 'calendar-key', time: '18:00', location: 'Himlabadet' }
  const state = fixture({ initialWorkouts: [standalone({ time_of_day: 'morning' }), standalone({ id: secondId, title: 'Fjärilsim' })], initialPlans: [
    { id: randomUUID(), plan_date: date, activity_type: 'swim', source_workout_id: firstId, time_of_day: 'afternoon', target_groups: ['junior'], calendar_link: calendarLink, location: 'Himlabadet' },
    { id: randomUUID(), plan_date: date, activity_type: 'swim', source_workout_id: secondId, time_of_day: 'afternoon', target_groups: ['junior'], calendar_link: calendarLink, location: 'Himlabadet' },
  ] })
  const response = await call(saveBody())
  assert.equal(response.code, 200)
  assert.equal(state.workouts.length, 3)
  assert.ok(state.workouts.every((row) => row.alternative_group_id === firstId && row.time_of_day === 'afternoon'))
  assert.equal(state.plans.length, 3)
  assert.ok(state.plans.every((plan) => plan.calendar_link.time === '18:00'))
  assert.deepEqual(planningAmountRange(asPlanning(state.plans), 'distanceMeters'), { min: 4400, max: 4900 })
})

test('a workbook can extend an existing occasion and retries scope only that import’s own workouts', async () => {
  const state = fixture({ initialWorkouts: [standalone()] })
  const body = { ...requestBody(), occasionMode: 'existing', alternativeToWorkoutId: firstId }
  const response = await call(body)
  assert.equal(response.code, 200)
  assert.equal(response.data.workouts.length, 3)
  assert.equal(state.workouts.length, 4)
  assert.ok(state.workouts.every((row) => row.alternative_group_id === firstId))
  const repeated = await call(body)
  assert.equal(repeated.code, 200)
  assert.equal(repeated.data.workouts.length, 3)
  assert.equal(state.workouts.length, 4)
  assert.equal(state.plans.length, 4)
  assert.equal(groupSwimOccasions(asPlanning(state.plans)).length, 1)
  assert.deepEqual(planningAmountRange(asPlanning(state.plans), 'distanceMeters'), { min: 4400, max: 4900 })
})
