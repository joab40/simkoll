import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://drive-settings.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'drive-settings-fixture'
process.env.GOOGLE_DRIVE_API_KEY = 'fixture-secret-never-returned'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const token = role => createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role, email: 'coach@example.invalid' })
const admin = token('superadmin'), coach = token('coach'), head = token('head_coach')
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
async function call(method, code, body = {}, query = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(handler)({ method, headers: { 'x-simkoll-code': code }, body, query }, response)
  return response
}
test('only superadmin sees env status or tests/saves folders; normal coaches can use configured pickers', async () => {
  const original = globalThis.fetch, writes = [], folders = []
  let settings = { workoutFolderId: 'workouts_12345678', planningFolderId: 'planning_12345678', useWorkoutFolder: false }
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    if (url.hostname === 'drive-settings.invalid' && table === 'app_settings') {
      if (options.method === 'POST') { const saved = JSON.parse(options.body); writes.push(saved); settings = saved.setting_value; return json({}) }
      return json([{ setting_value: settings }])
    }
    if (url.hostname === 'www.googleapis.com') {
      if (table === 'files') { folders.push(url.searchParams.get('q')); return json({ files: [] }) }
      return json({ id: table, name: table, mimeType: 'application/vnd.google-apps.folder' })
    }
    throw Error(`Unexpected request: ${table}`)
  }
  try {
    for (const code of [coach, head, '']) {
      assert.equal((await call('POST', code, { action: 'save-drive-settings', settings })).code, 403)
      assert.equal((await call('POST', code, { action: 'test-drive-folder', purpose: 'planning', folder: settings.planningFolderId })).code, 403)
      assert.equal((await call('GET', code, {}, { driveSettings: 'true' })).code, 403)
    }
    assert.equal(writes.length, 0); assert.equal(folders.length, 0)
    const config = await call('GET', admin, {}, { driveSettings: 'true' })
    assert.equal(config.code, 200); assert.equal(config.data.apiKeyConfigured, true)
    assert.ok(!JSON.stringify(config.data).includes(process.env.GOOGLE_DRIVE_API_KEY))
    const plans = await call('GET', coach, {}, { drive: 'true', purpose: 'planning' })
    assert.equal(plans.code, 200); assert.equal(plans.data.folderId, settings.planningFolderId)
    const workouts = await call('GET', coach, {}, { drive: 'true' })
    assert.equal(workouts.code, 200); assert.equal(workouts.data.folderId, settings.workoutFolderId)
    assert.equal((await call('GET', coach, {}, { drive: 'true', purpose: 'other' })).code, 400)
    const checked = await call('POST', admin, { action: 'test-drive-folder', folder: settings.planningFolderId, purpose: 'planning' })
    assert.equal(checked.code, 200); assert.equal(checked.data.verified.hasItems, false)
    assert.equal(writes.length, 0)
    const saved = await call('POST', admin, { action: 'save-drive-settings', settings })
    assert.equal(saved.code, 200); assert.equal(saved.data.saved, true)
    assert.equal(writes.length, 1); assert.equal(writes[0].setting_key, 'google_drive')
    assert.ok(!JSON.stringify(saved.data).includes(process.env.GOOGLE_DRIVE_API_KEY))
  } finally { globalThis.fetch = original }
})
