import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://strength-images.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: workouts } = await import('../api/workouts.js')
const { default: training } = await import('../api/training.js')
const coach = '11111111-1111-4111-8111-111111111111'
const assetId = '33333333-3333-4333-8333-333333333333'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGasAAAAASUVORK5CYII='
async function call(handler, role, body) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': createCoachToken({ id: coach, email: 'fixture@example.invalid', display_name: 'Fixture', role }) }, body, query: {} }, response)
  return response
}
test('ordinary coaches cannot generate, upload or save exercise images', async () => {
  globalThis.fetch = async () => { throw new Error('Unexpected request') }
  for (const action of ['generate-strength-image', 'upload-strength-image']) assert.equal((await call(workouts, 'coach', { action })).code, 403)
  assert.equal((await call(training, 'coach', { action: 'save-strength-images' })).code, 403)
})
test('AI off blocks generation but does not block uploading an alternative', async () => {
  let storedPath
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('app_settings?')) return { ok: true, json: async () => [{ setting_value: { aiEnabled: false } }] }
    if (String(url).includes('strength_exercise_images?')) return { ok: true }
    if (String(url).includes('/bucket/')) return { ok: true, json: async () => ({ public: false }) }
    if (String(url).includes('/object/sign/')) return { ok: true, json: async () => [{ path: storedPath, signedURL: `/object/sign/strength-exercise-images/${storedPath}?token=fixture` }] }
    if (String(url).endsWith('/rest/v1/strength_exercise_images')) { storedPath = JSON.parse(options.body).storage_path; return { ok: true } }
    if (String(url).includes('/storage/v1/object/')) return { ok: true }
    throw new Error(`Unexpected request ${url}`)
  }
  assert.equal((await call(workouts, 'head_coach', { action: 'generate-strength-image', name: 'Planka' })).code, 403)
  const upload = await call(workouts, 'head_coach', { action: 'upload-strength-image', imageData: png })
  assert.equal(upload.code, 201)
  assert.equal(upload.data.image.imageSource, 'upload')
})
test('save validates the exact exercise and preserves only verified asset metadata', async () => {
  let saved
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PATCH') { saved = JSON.parse(options.body); return { ok: true } }
    if (String(url).includes('training_programs?')) return { ok: true, json: async () => [{ id: 'program', title: 'Basstyrka', content: '1. Planka — 3 x 30 sek', exercise_images: [] }] }
    if (String(url).includes('strength_exercise_images?')) return { ok: true, json: async () => [{ id: assetId, coach_id: coach, storage_path: `${coach}/${assetId}.png`, source: 'upload' }] }
    throw new Error(`Unexpected request ${url}`)
  }
  const base = { action: 'save-strength-images', programId: 'program', reviewed: true }
  const wrong = await call(training, 'superadmin', { ...base, images: [{ imageId: assetId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Benpress' }] })
  assert.equal(wrong.code, 422)
  assert.equal(saved, undefined)
  const correct = await call(training, 'superadmin', { ...base, images: [{ imageId: assetId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Planka', imageUrl: 'https://unsafe.invalid', imageSource: 'ai' }] })
  assert.equal(correct.code, 200)
  assert.equal(saved.exercise_images[0].imageSource, 'upload')
  assert.equal(saved.exercise_images[0].imageUrl, undefined)
})
test('a swimmer receives signed image URLs only for assigned programs', async () => {
  const foreignId = '44444444-4444-4444-8444-444444444444'
  const signedPaths = []
  const ownedPath = `${coach}/${assetId}.png`
  const foreignPath = `${coach}/${foreignId}.png`
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path.startsWith('profile_sessions?')) return { ok: true, json: async () => [{ profile_id: 'swimmer' }] }
    if (path.startsWith('profiles?')) return { ok: true, json: async () => [{ id: 'swimmer' }] }
    if (path.startsWith('program_assignments?')) return { ok: true, json: async () => [{ id: 'assignment', profile_id: 'swimmer', program_id: 'owned' }] }
    if (path.startsWith('training_programs?')) return { ok: true, json: async () => [
      { id: 'owned', program_type: 'strength', title: 'Eget', exercise_images: [{ imageId: assetId, storagePath: ownedPath, passNumber: 1, exerciseIndex: 0, exerciseName: 'Planka' }] },
      { id: 'other', program_type: 'strength', title: 'Annat', exercise_images: [{ imageId: foreignId, storagePath: foreignPath }] },
    ] }
    if (String(url).includes('/storage/v1/object/sign/')) {
      signedPaths.push(...JSON.parse(options.body).paths)
      return { ok: true, json: async () => [{ path: ownedPath, signedURL: `/object/sign/strength-exercise-images/${ownedPath}?token=fixture` }] }
    }
    return { ok: true, json: async () => [] }
  }
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await training({ method: 'GET', headers: { cookie: 'simkoll_session=fixture' }, query: {} }, response)
  assert.equal(response.code, 200)
  assert.deepEqual(signedPaths, [ownedPath])
  assert.match(response.data.assignments[0].program.exerciseImages[0].imageUrl, /object\/sign/)
  assert.deepEqual(response.data.programs.find((program) => program.id === 'other').exerciseImages, [])
})
