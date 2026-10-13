import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeExerciseImage, resolveExerciseImages, storeExerciseImage, signedExerciseImages, generateExerciseImage, ensureStrengthImageStorage } from '../server/strength-images.js'
import { normalizeStrengthDraft, draftExerciseImages, strengthDraftContent } from '../shared/strength-import.js'

const coach = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGasAAAAASUVORK5CYII='

test('uploads reject wrong types, false MIME labels and oversized bodies', () => {
  assert.equal(decodeExerciseImage(png).mime, 'image/png')
  assert.throws(() => decodeExerciseImage('data:image/svg+xml;base64,PHN2Zz4='), /JPG/)
  assert.throws(() => decodeExerciseImage(png.replace('image/png', 'image/jpeg')), /filformat/)
  assert.throws(() => decodeExerciseImage('a'.repeat(4_000_101)), /3 MB/)
})

test('image references remain outside the text content and retain their exercise position', () => {
  const draft = normalizeStrengthDraft({ title: 'Program', passes: [{ title: 'Bål', exercises: [{ name: 'Planka', imageId: assetId, imageUrl: 'https://fixture.invalid/signed-image', imageSource: 'upload' }] }] })
  assert.deepEqual(draftExerciseImages(draft), [{ imageId: assetId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Planka' }])
  assert.doesNotMatch(strengthDraftContent(draft), /signed-image/)
})

test('a coach cannot attach another coach’s unattached draft image', async () => {
  const reference = { imageId: assetId, passNumber: 1, exerciseIndex: 0, exerciseName: 'Planka' }
  const deps = { db: async () => ({ ok: true, json: async () => [{ id: assetId, coach_id: other, storage_path: `${other}/${assetId}.png`, source: 'upload' }] }) }
  await assert.rejects(resolveExerciseImages(coach, [reference], [], deps), /tillhör inte/)
  const images = await resolveExerciseImages(coach, [reference], [{ imageId: assetId }], deps)
  assert.equal(images[0].imageSource, 'upload')
  assert.equal(images[0].exerciseIndex, 0)
})

test('own images are stored privately and previewed through a signed URL', async () => {
  let row
  const requests = []
  const result = await storeExerciseImage(coach, decodeExerciseImage(png), 'upload', {
    db: async (path, options) => { row = JSON.parse(options.body); return { ok: true } },
    storage: async (path, options) => {
      requests.push([path, options])
      if (path.startsWith('object/sign/')) {
        const body = JSON.parse(options.body)
        assert.equal(body.expiresIn, 3600)
        return { ok: true, json: async () => body.paths.map((path) => ({ path, signedURL: `/object/sign/strength-exercise-images/${path}?token=fixture` })) }
      }
      assert.equal(options.headers['Content-Type'], 'image/png')
      return { ok: true }
    },
  })
  assert.equal(row.coach_id, coach)
  assert.match(row.storage_path, new RegExp(`^${coach}/`))
  assert.equal(result.imageId, row.id)
  assert.match(result.imageUrl, /object\/sign/)
  assert.equal(result.storagePath, undefined)
  assert.equal(requests.length, 2)
})

test('signing failure does not expose a permanent public URL', async () => {
  const images = await signedExerciseImages([{ imageId: assetId, storagePath: `${coach}/${assetId}.png` }], { storage: async () => ({ ok: false }) })
  assert.equal(images[0].imageUrl, null)
  assert.equal(images[0].storagePath, undefined)
})

test('missing storage setup fails before image generation', async () => {
  await assert.rejects(ensureStrengthImageStorage({ db: async () => ({ ok: false }), storage: async () => ({ ok: false }) }), /migration 086/)
})

test('AI generation makes one text-only image call and logs returned usage', async () => {
  process.env.OPENAI_API_KEY = 'fixture'
  delete process.env.OPENAI_STRENGTH_IMAGE_MODEL
  let logged
  const decoded = await generateExerciseImage({ headers: {} }, { name: 'Benpress', instructions: 'Håll ryggen mot stödet.' }, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/generations')
      const body = JSON.parse(options.body)
      assert.equal(body.model, 'gpt-image-2.5-flare')
      assert.equal(body.n, 1)
      assert.equal(body.output_format, 'jpeg')
      assert.match(body.prompt, /Benpress/)
      return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('ffd8ffe0', 'hex').toString('base64') }], usage: { input_tokens: 200, output_tokens: 1800, total_tokens: 2000 } }) }
    }, log: async (request, entry) => { logged = entry },
  })
  assert.equal(decoded.mime, 'image/jpeg')
  assert.equal(logged.feature, 'strength_exercise_image')
  assert.equal(logged.response.usage.total_tokens, 2000)
})
