import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://strength-builder.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'

const { createCoachToken } = await import('../server/coach-auth.js')
const { default: training } = await import('../api/training.js')
const coachId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const imageId = '33333333-3333-4333-8333-333333333333'
const source = {
  id: sourceId,
  title: 'Basstyrka',
  content: 'Pass 1 · Överkropp\n1. Bänkpress — 3 x 8\nInstruktion: Håll skulderbladen samlade.\n2. Planka — 3 x 30 sek',
  exercise_images: [{ imageId, storagePath: `${coachId}/${imageId}.png`, passNumber: 1, exerciseIndex: 0, exerciseName: 'Bänkpress', imageInstructions: 'Bänk och stång framifrån' }],
}
const draft = { action: 'create-strength-from-library', title: 'Eget program', description: 'Två övningar för överkropp.', passes: [{ title: 'Pass A', exercises: [{ sourceProgramId: sourceId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Bänkpress', prescription: '4 x 6', name: 'Falskt namn', instructions: 'Falsk instruktion', imageId: 'falsk-bild' }] }] }

async function call(role, body) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await training({ method: 'POST', headers: { 'x-simkoll-code': createCoachToken({ id: coachId, email: 'coach@example.invalid', display_name: 'Coach', role }) }, body, query: {} }, response)
  return response
}

test('ordinary coaches cannot create a strength program from the library', async () => {
  globalThis.fetch = async () => { throw new Error('No database request expected') }
  assert.equal((await call('coach', draft)).code, 403)
})

test('saved exercises provide the instruction and image; only the dosage is customized', async () => {
  let inserted
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path.startsWith('training_programs?')) return { ok: true, json: async () => [source] }
    if (path.startsWith('strength_exercise_images?')) return { ok: true, json: async () => [{ id: imageId, coach_id: '44444444-4444-4444-8444-444444444444', storage_path: source.exercise_images[0].storagePath, source: 'upload' }] }
    if (path === 'training_programs' && options.method === 'POST') { inserted = JSON.parse(options.body); return { ok: true, json: async () => [{ id: 'new-program', ...inserted }] } }
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await call('head_coach', draft)
  assert.equal(response.code, 201)
  assert.match(inserted.content, /1\. Bänkpress — 4 x 6\nInstruktion: Håll skulderbladen samlade\./)
  assert.doesNotMatch(inserted.content, /Falsk instruktion|Falskt namn/)
  assert.equal(inserted.exercise_images[0].imageId, imageId)
  assert.equal(inserted.exercise_images[0].exerciseName, 'Bänkpress')
  assert.equal(inserted.exercise_images[0].imageInstructions, 'Bänk och stång framifrån')
})

test('a stale or invented exercise reference is rejected before saving', async () => {
  let inserted = false
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path.startsWith('training_programs?')) return { ok: true, json: async () => [source] }
    if (options.method === 'POST') inserted = true
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await call('superadmin', { ...draft, passes: [{ title: 'Pass A', exercises: [{ ...draft.passes[0].exercises[0], exerciseIndex: 9 }] }] })
  assert.equal(response.code, 422)
  assert.equal(inserted, false)
  const renamed = await call('superadmin', { ...draft, passes: [{ title: 'Pass A', exercises: [{ ...draft.passes[0].exercises[0], exerciseName: 'Planka' }] }] })
  assert.equal(renamed.code, 422)
})

test('a new exercise can create a reusable strength program without an existing source', async () => {
  let inserted
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path === 'training_programs' && options.method === 'POST') { inserted = JSON.parse(options.body); return { ok: true, json: async () => [{ id: 'new-program', ...inserted }] } }
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await call('head_coach', { ...draft, passes: [{ title: 'Pass A', exercises: [{ kind: 'custom', name: 'Enbensknäböj', prescription: '3 × 8 per ben', instructions: 'Håll knät i linje med foten.' }] }] })
  assert.equal(response.code, 201)
  assert.match(inserted.content, /1\. Enbensknäböj — 3 × 8 per ben\nInstruktion: Håll knät i linje med foten\./)
  assert.equal(inserted.exercise_images, undefined)
})

test('a new exercise may only attach an image owned by the coach', async () => {
  let inserted = false
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path.startsWith('strength_exercise_images?')) return { ok: true, json: async () => [{ id: imageId, coach_id: '44444444-4444-4444-8444-444444444444', storage_path: `${coachId}/${imageId}.png`, source: 'upload' }] }
    if (path === 'training_programs' && options.method === 'POST') inserted = true
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await call('superadmin', { ...draft, passes: [{ title: 'Pass A', exercises: [{ kind: 'custom', name: 'Enbensknäböj', prescription: '', instructions: '', imageId }] }] })
  assert.equal(response.code, 422)
  assert.equal(inserted, false)
})

test('a mixed program keeps a source image and a newly uploaded coach image separate', async () => {
  const ownImageId = '55555555-5555-4555-8555-555555555555'
  let inserted
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1] || ''
    if (path.startsWith('training_programs?')) return { ok: true, json: async () => [source] }
    if (path.startsWith('strength_exercise_images?')) return { ok: true, json: async () => [
      { id: imageId, coach_id: '44444444-4444-4444-8444-444444444444', storage_path: source.exercise_images[0].storagePath, source: 'upload' },
      { id: ownImageId, coach_id: coachId, storage_path: `${coachId}/${ownImageId}.png`, source: 'upload' },
    ] }
    if (path === 'training_programs' && options.method === 'POST') { inserted = JSON.parse(options.body); return { ok: true, json: async () => [{ id: 'new-program', ...inserted }] } }
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await call('head_coach', { ...draft, passes: [{ title: 'Pass A', exercises: [draft.passes[0].exercises[0], { kind: 'custom', name: 'Enbensknäböj', prescription: '3 × 8', instructions: 'Håll balansen.', imageId: ownImageId }] }] })
  assert.equal(response.code, 201)
  assert.deepEqual(inserted.exercise_images.map(({ imageId }) => imageId), [imageId, ownImageId])
  assert.equal(inserted.exercise_images[1].exerciseIndex, 1)
})
