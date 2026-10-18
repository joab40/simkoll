import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://workout-library.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'

const { createCoachToken } = await import('../server/coach-auth.js')
const { default: workouts } = await import('../api/workouts.js')
const workoutId = '11111111-1111-4111-8111-111111111111'
const row = { id: workoutId, workout_date: '2026-10-15', title: 'Sprint och starter', content: '8 × 25 m max', note: 'Full vila.', focus: 'sprint', distance_meters: 4200, duration_minutes: 120, time_of_day: 'afternoon', target_groups: ['junior'] }
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', email: 'coach@example.invalid', display_name: 'Coach', role: 'head_coach' })

async function call(query, token = code) {
  const response = { setHeader() {}, status(status) { this.code = status; return this }, json(data) { this.data = data; return this } }
  await workouts({ method: 'GET', headers: { 'x-simkoll-code': token }, query }, response)
  return response
}

test('workout picker fetches a lightweight coach-only library summary', async () => {
  let path
  globalThis.fetch = async (url) => { path = String(url).split('/rest/v1/')[1]; return { ok: true, json: async () => [row] } }
  const response = await call({ library: 'true' })
  assert.equal(response.code, 200)
  assert.match(path, /select=id,workout_date,title,focus/)
  assert.match(path, /or=\(focus\.is\.null,focus\.neq\.tavling\)/)
  assert.doesNotMatch(path, /select=\*/)
  assert.equal(response.data.workouts[0].title, row.title)
  assert.equal('content' in response.data.workouts[0], false)
  assert.equal('note' in response.data.workouts[0], false)
})

test('full workout details are loaded only when a coach selects one', async () => {
  let path
  globalThis.fetch = async (url) => { path = String(url).split('/rest/v1/')[1]; return { ok: true, json: async () => [row] } }
  const response = await call({ libraryItem: workoutId })
  assert.equal(response.code, 200)
  assert.match(path, new RegExp(`daily_workouts\\?id=eq\\.${workoutId}`))
  assert.equal(response.data.workout.content, row.content)
  assert.equal(response.data.workout.note, row.note)
})

test('invalid IDs and unauthenticated library access are rejected before database reads', async () => {
  globalThis.fetch = async () => { throw new Error('No database request expected') }
  assert.equal((await call({ libraryItem: 'not-an-id' })).code, 400)
  assert.equal((await call({ library: 'true' }, '')).code, 403)
})

test('competition and warm-up focuses can be saved as distinct workouts', async () => {
  const saved = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    if (path === 'daily_workouts' && options.method === 'POST') {
      const payload = JSON.parse(options.body)
      saved.push(payload)
      return { ok: true, json: async () => [{ ...row, ...payload }] }
    }
    return { ok: false, json: async () => [], text: async () => '' }
  }
  for (const focus of ['tavlingsinsim', 'tavling']) {
    const response = { setHeader() {}, status(status) { this.code = status; return this }, json(data) { this.data = data; return this } }
    await workouts({ method: 'POST', headers: { 'x-simkoll-code': code }, body: { date: row.workout_date, title: row.title, content: row.content, focus, targetGroups: ['junior'] } }, response)
    assert.equal(response.code, 200)
    assert.equal(response.data.workout.focus, focus)
  }
  assert.deepEqual(saved.map((item) => item.focus), ['tavlingsinsim', 'tavling'])
})
