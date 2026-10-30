import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://dryland-api.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: training } = await import('../api/training.js')
const id = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222', programId = '33333333-3333-4333-8333-333333333333'
const token = (role) => createCoachToken({ id, role })
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
async function call(code, body, query = {}) { const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }; await training({ method: 'POST', headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, query, body }, res); return res }
test('ordinary coaches may assign dryland but cannot manage its shared library, even through legacy create', async () => {
  const paths = []
  globalThis.fetch = async (url) => { paths.push(String(url)); return json(String(url).includes('coach_accounts?') ? [{ id, role: 'coach' }] : null) }
  for (const action of ['save-strength-import', 'create-strength-from-library', 'save-strength-images', 'archive-program', 'delete-program', 'update-program', 'create-program']) assert.equal((await call(token('coach'), { action, type: 'dryland' })).code, 403)
  assert.equal(paths.length, 0)
  assert.equal((await call(token('coach'), { action: 'assign', type: 'dryland', programId, profileId: owner })).code, 201)
  assert.ok(paths[1].endsWith('/rpc/assign_dryland_program'))
  assert.equal((await call('legacy-code', { action: 'assign', type: 'dryland', programId, profileId: owner })).code, 403)
})
test('stale coach roles are denied and reviewed imports save the requested type only', async () => {
  globalThis.fetch = async () => json([])
  assert.equal((await call(token('head_coach'), { action: 'save-strength-import', type: 'dryland' })).code, 403)
  const writes = []
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('coach_accounts?')) return json([{ id, role: 'head_coach' }]); writes.push({ url: String(url), opts }); const row = JSON.parse(opts.body); return json([{ id: programId, ...row }]) }
  const draft = { title: 'Land', description: 'Balans', passes: [{ title: 'Pass A', exercises: [{ name: 'Balans', prescription: '30 sek' }] }] }
  assert.equal((await call(token('head_coach'), { action: 'save-strength-import', type: 'dryland', draft })).code, 400)
  const saved = await call(token('head_coach'), { action: 'save-strength-import', type: 'dryland', reviewed: true, draft })
  assert.equal(saved.code, 201); assert.equal(saved.data.program.type, 'dryland')
  assert.equal(JSON.parse(writes[0].opts.body).program_type, 'dryland')
})
test('swimmer log route ignores submitted owner and cannot log a strength or other profile assignment', async () => {
  const paths = []
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url); paths.push(path)
    if (path.includes('profile_sessions?')) return json([{ profile_id: owner }])
    if (path.includes('profiles?')) return json([{ id: owner, active: true, approval_status: 'approved' }])
    if (path.includes('program_assignments?')) return json([])
    throw new Error(`Unexpected ${path}`)
  }
  const result = await call('swimmer-fixture', { action: 'log-dryland-pass', assignmentId: id, profileId: 'another-owner' })
  assert.equal(result.code, 403)
  assert.ok(paths.some((path) => path.includes(`profile_id=eq.${owner}&removed_at=is.null`)))
  assert.equal((await call(token('coach'), { action: 'log-dryland-pass' })).code, 403)
})
test('dryland library edits, source exercises and deletion checks stay bound to the land program type', async () => {
  const paths = []
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url); paths.push({ path, opts })
    if (path.includes('coach_accounts?')) return json([{ id, role: 'head_coach' }])
    if (path.includes('program_assignments?')) return json([])
    if (path.includes('dryland_program_logs?')) return json([{ id: 'historic' }])
    if (path.includes('training_programs?')) return json([{ id: programId, program_type: 'dryland', title: 'Balans', description: 'Land', content: '1. Balans — 30 sek' }])
    throw new Error(path)
  }
  assert.equal((await call(token('head_coach'), { action: 'delete-program', type: 'dryland', programId })).code, 409)
  assert.ok(paths.some((c) => c.path.includes('dryland_program_logs?')))
  assert.ok(paths.every((c) => c.opts.method !== 'DELETE'))
  const edit = await call(token('head_coach'), { action: 'update-program', type: 'dryland', programId, title: 'Land A', description: 'Rörlighet', content: '1. Rotation — 8 reps' })
  assert.equal(edit.code, 200)
  assert.ok(paths.filter((c) => c.opts.method === 'PATCH').every((c) => c.path.includes('program_type=eq.dryland')))
  paths.length = 0
  const fromSource = await call(token('head_coach'), { action: 'create-strength-from-library', type: 'dryland', title: 'Nytt land', description: 'Balans', passes: [{ title: 'A', exercises: [{ sourceProgramId: programId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Invented', prescription: '20 sek' }] }] })
  assert.equal(fromSource.code, 422)
  assert.ok(paths.some((c) => c.path.includes('program_type=eq.dryland&active=eq.true')))
})
test('swimmer reads only own land results and assigned land content, without read-side recreation', async () => {
  const requests = []
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url); requests.push({ path, opts })
    if (path.includes('profile_sessions?')) return json([{ profile_id: owner }])
    if (path.includes('profiles?')) return json([{ id: owner, active: true, approval_status: 'approved', training_group: 'junior' }])
    if (path.includes('program_assignments?')) return json([{ id, profile_id: owner, program_id: programId }])
    if (path.includes('training_programs?')) return json([{ id: programId, program_type: 'dryland', title: 'Own land', content: '1. Balans — 30 sek' }, { id: 'other-program', program_type: 'dryland', title: 'Not assigned', content: 'private unassigned content' }])
    if (path.includes('dryland_program_logs?')) { assert.match(path, new RegExp(`profile_id=eq.${owner}`)); return json([{ id: 'log', profile_id: owner, assignment_id: id, session_date: '2026-10-29', results: {} }]) }
    return json([])
  }
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await training({ method: 'GET', headers: { 'x-simkoll-code': 'swimmer-fixture', cookie: 'simkoll_session=fixture' }, query: { profileId: 'ignored' } }, res)
  assert.equal(res.code, 200); assert.equal(res.data.programs.length, 1); assert.equal(res.data.drylandLogs[0].profileId, owner)
  assert.ok(requests.every((r) => !/personal_training_sessions/.test(r.path) || !r.opts.method))
  assert.doesNotMatch(JSON.stringify(res.data), /private unassigned content/)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => String(url).includes('dryland_program_logs?') ? Promise.reject(new Error('optional log unavailable')) : originalFetch(url, options)
  await training({ method: 'GET', headers: { 'x-simkoll-code': 'swimmer-fixture', cookie: 'simkoll_session=fixture' }, query: {} }, res)
  assert.equal(res.code, 200); assert.equal(res.data.drylandLogsAvailable, false)
  assert.equal(res.data.programs.length, 1)
})
