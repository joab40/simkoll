import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleVideo } from './fixtures/goal-video.mjs'
process.env.SUPABASE_URL = 'https://goal-video-api.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only-secret'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
const { default: handler } = await import('../api/goals.js')
const goalId = '22222222-2222-4222-8222-222222222222', owner = '11111111-1111-4111-8111-111111111111'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
async function call(action, code = 'coach-fixture', extra = {}, query = null) {
  const headers = {}, response = { setHeader(key, value) { headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data; this.headers = headers; return this } }
  await handler({ method: query ? 'GET' : 'POST', headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, body: { action, goalId, ...extra }, query: query || {} }, response)
  return response
}
function fixture({ owned = true } = {}) {
  let row = { id: goalId, profile_id: owner, title: 'Vändning', description: 'Teknikmål', next_step: 'Följ upp', status: 'active', updated_at: '2026-10-30T08:00:00Z', video_path: `${owner}/${goalId}/33333333-3333-4333-8333-333333333333.mp4`, video_duration_ms: 5000, video_bytes: 2000, video_codec: 'avc1' }
  const paths = [], files = new Map()
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); paths.push({ path, options })
    if (path.includes('/profile_sessions?')) return json([{ profile_id: owner }])
    if (path.includes('/profiles?')) return json([{ id: owner, active: true, approval_status: 'approved' }])
    if (path.includes('/rest/v1/development_goals?')) {
      if (path.includes('select=video_path&limit=0')) return json([])
      if (path.includes(`profile_id=eq.${owner}`) && !owned) return json([])
      if (options.method === 'PATCH') row = { ...row, ...JSON.parse(options.body) }
      return json([row])
    }
    if (path.includes('/storage/v1/bucket/')) return json({ public: false, file_size_limit: 25000000 })
    if (path.includes('/object/list/')) return json([])
    if (path.includes('/object/upload/sign/')) return json({ url: `${path.split('/storage/v1')[1]}?token=fixture` })
    if (path.includes('/object/sign/')) return json({ signedURL: '/object/sign/goal-analysis-videos/fixture?token=fixture' })
    if (path.endsWith('/object/goal-analysis-videos')) return json({})
    if (path.includes('/object/goal-analysis-videos/')) {
      const key = path.split('/object/goal-analysis-videos/')[1]
      if (options.method === 'POST') { files.set(key, options.body); return json({}) }
      return new Response(files.get(key) || sampleVideo())
    }
    throw new Error(`Unexpected request ${path}`)
  }
  return { paths, files }
}

test('anonymous and swimmers cannot start, attach, replace, clear or cancel goal media', async () => {
  globalThis.fetch = async () => { throw new Error('No read/write should occur') }
  for (const action of ['begin-goal-video', 'finish-goal-video', 'replace-goal-image', 'clear-goal-media', 'cancel-goal-video']) for (const code of ['', 'swimmer-fixture']) assert.equal((await call(action, code)).code, 403)
})
test('private playback requires a swimmer session and scopes the goal lookup to its owner', async () => {
  const f = fixture()
  const own = await call(null, 'swimmer-fixture', {}, { video: 'true', goalId, profileId: 'ignored-other-profile' })
  assert.equal(own.code, 200); assert.match(own.data.url, /object\/sign/)
  assert.equal(own.headers['Cache-Control'], 'no-store')
  assert.ok(f.paths.some(({ path }) => path.includes(`development_goals?id=eq.${goalId}&profile_id=eq.${owner}`)))
  const denied = fixture({ owned: false })
  assert.equal((await call(null, 'swimmer-fixture', {}, { video: 'true', goalId })).code, 404)
  assert.ok(denied.paths.every(({ path }) => !path.includes('/storage/v1/')))
  globalThis.fetch = async () => json([])
  assert.equal((await call(null, '', {}, { video: 'true', goalId })).code, 403)
})
test('coach can attach only inspected video bytes to an existing goal, without affecting text/status/points', async () => {
  const f = fixture(), bytes = sampleVideo()
  const began = await call('begin-goal-video', 'coach-fixture', { bytes: bytes.length })
  assert.equal(began.code, 200)
  const ticket = JSON.parse(Buffer.from(began.data.ticket.split('.')[0], 'base64url').toString())
  f.files.set(ticket.path, bytes)
  const done = await call('finish-goal-video', 'coach-fixture', { ticket: began.data.ticket, video_path: 'untrusted/path', profileId: 'other-profile', videoDurationMs: 1 })
  assert.equal(done.code, 200); assert.equal(done.data.goal.hasVideo, true)
  assert.equal(done.data.goal.videoDurationMs, 5000)
  assert.equal(done.data.goal.video_path, undefined)
  assert.equal(done.data.goal.profileId, owner); assert.equal(done.data.goal.status, 'active')
  const patch = JSON.parse(f.paths.find(({ options }) => options.method === 'PATCH').options.body)
  assert.ok(!Object.hasOwn(patch, 'profile_id') && !Object.hasOwn(patch, 'title'))
  assert.ok(f.paths.every(({ path }) => !path.includes('point_events') && !path.includes('openai.com')))
})
