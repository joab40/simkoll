import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://storage-usage.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'legacy-coach'
const { default: handler } = await import('../api/profiles.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { supabaseStorageRequest } = await import('../server/supabase.js')
const admin = createCoachToken({ id: '11111111-1111-4111-8111-111111111111', role: 'superadmin' })
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
async function call(code, method = 'GET', body = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method, headers: { 'x-simkoll-code': code }, query: { storage: 'true', backup: 'export' }, body }, response)
  return response
}
test('profiles storage route cannot fall through to backup or profile mutations', async () => {
  const paths = []
  globalThis.fetch = async (url, options) => { paths.push({ url: String(url), options }); return json(String(url).includes('/coach_accounts?') ? [{ role: 'superadmin', status: 'active' }] : { current: { fileBytes: 33 }, settings: {}, history: [], events: [] }) }
  assert.equal((await call('legacy-coach')).code, 403)
  assert.equal(paths.length, 0)
  const response = await call(admin)
  assert.equal(response.code, 200); assert.equal(response.data.current.fileBytes, 33)
  assert.equal(paths.length, 2); assert.match(paths[1].url, /rpc\/storage_admin_overview$/)
  assert.equal((await call(admin, 'DELETE', { action: 'delete-profile' })).code, 405)
  assert.ok(paths.every((p) => /coach_accounts|storage_admin_overview/.test(p.url)))
})
test('storage wrapper logs metadata without consuming or changing responses', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return String(url).includes('/rest/v1/') ? json({}) : json({ Key: 'private-path-must-not-be-logged' }, 200) }
  const result = await supabaseStorageRequest('object/goal-analysis-videos/owner/goal/clip.mp4', { method: 'POST', body: new Uint8Array(10) })
  assert.equal((await result.json()).Key, 'private-path-must-not-be-logged')
  assert.equal(calls.length, 2)
  assert.match(calls[1].url, /storage_usage_events$/)
  const logged = JSON.parse(calls[1].options.body)
  assert.equal(logged.bytes, 10); assert.equal(logged.success, true)
  assert.doesNotMatch(calls[1].options.body, /owner|clip.mp4|private-path/)
  calls.length = 0
  await supabaseStorageRequest('object/sign/goal-analysis-videos/private', { method: 'POST', body: '{}' })
  assert.equal(calls.length, 1)
  globalThis.fetch = async (url) => { if (String(url).includes('/rest/v1/')) throw new Error('log offline'); return json({ uploaded: true }) }
  assert.equal((await (await supabaseStorageRequest('object/goal-analysis-images/file.jpg', { method: 'POST', body: new Uint8Array(2) })).json()).uploaded, true)
})
