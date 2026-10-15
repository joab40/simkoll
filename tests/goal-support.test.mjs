import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://goal-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.OPENAI_API_KEY = 'fixture-only'
const { improveGoalText, saveGoalImage, goalImageUrl, removeUnattachedGoalImage } = await import('../server/goal-support.js')
const profileId = '11111111-1111-4111-8111-111111111111'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGasAAAAASUVORK5CYII='
const draft = { title: 'Stabilare vändningar', description: 'Arbeta med vändningen.', nextStep: 'Öva enligt samtalet.', imageObservations: ['Grafen visar en tidserie.'], uncertainties: ['Axeltexten är otydlig.'] }

test('goal improvement sends only provided text and image, with a reviewable draft and usage', async () => {
  let usage
  const result = await improveGoalText({}, { title: 'Vändning', description: 'Bättre vändning', nextStep: 'Öva', imageData: png, profileId: 'must-not-be-sent' }, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      const body = JSON.parse(options.body)
      assert.equal(body.store, false)
      assert.equal(body.text.format.strict, true)
      assert.equal(body.input[1].content[1].image_url, png)
      assert.doesNotMatch(options.body, /must-not-be-sent/)
      assert.match(body.input[0].content, /inga.*personnamn|Använd inga personnamn/i)
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(draft), usage: { total_tokens: 120 } }) }
    }, log: async (request, entry) => { usage = entry },
  })
  assert.deepEqual(result.draft, draft)
  assert.equal(usage.feature, 'goal_text_polish')
  assert.equal(usage.response.usage.total_tokens, 120)
})
test('rough text in the description can produce a complete swimmer-facing goal draft', async () => {
  const description = 'tappar fart in i väggen. vill få bättre flyt i voltvändning. jobba med tajming på teknikpassen, prata om hur det gick sen.'
  const proposed = { ...draft, title: 'Bättre flyt i voltvändningen', description: 'Du arbetar med tajmingen in mot väggen för att behålla farten genom voltvändningen.', nextStep: 'Öva tajmingen på teknikpassen och följ upp hur det går.' }
  const result = await improveGoalText({}, { description }, {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body)
      assert.deepEqual(JSON.parse(body.input[1].content[0].text), { notes: '', title: '', description, nextStep: '' })
      assert.match(body.input[0].content, /råa anteckningar/)
      assert.match(body.input[0].content, /du-form/)
      assert.match(body.input[0].content, /Hitta inte på prestationsnivåer/)
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(proposed) }) }
    }, log: async () => {},
  })
  assert.deepEqual(result.draft, proposed)
})
test('personal data is blocked before a goal text reaches OpenAI', async () => {
  let calls = 0
  const deps = { fetch: async () => { calls++; throw new Error('must not run') }, log: async () => {} }
  await assert.rejects(improveGoalText({}, { description: 'Johan Andersson behöver träna vändningar.' }, deps), /fullständigt namn/)
  await assert.rejects(improveGoalText({}, { description: 'Kontakt: simmare@example.se' }, deps), /e-postadressen/)
  await assert.rejects(improveGoalText({}, { description: 'Personnummer 20100101-1234' }, deps), /personnumret/)
  assert.equal(calls, 0)
})
test('text-only goals need no image storage, and invalid images never reach AI', async () => {
  let calls = 0
  const deps = { fetch: async (url, options) => { calls++; assert.equal(JSON.parse(options.body).input[1].content.length, 1); return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(draft) }) } }, log: async () => {} }
  await improveGoalText({}, { description: 'Bättre vändning' }, deps)
  assert.equal(calls, 1)
  for (const imageData of ['https://other.invalid/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', png.replace('image/png', 'image/jpeg')]) await assert.rejects(improveGoalText({}, { description: 'Test', imageData }, deps))
  assert.equal(calls, 1)
})
test('incomplete model output is rejected and billed usage still logged', async () => {
  let usage
  await assert.rejects(improveGoalText({}, { description: 'Test' }, { fetch: async () => ({ ok: true, json: async () => ({ status: 'incomplete', usage: { total_tokens: 50 }, output_text: JSON.stringify(draft) }) }), log: async (request, entry) => { usage = entry } }), /ofullständigt/)
  assert.equal(usage.status, 'failure')
  assert.equal(usage.response.usage.total_tokens, 50)
})
test('overlong fields and malformed responses do not overwrite a goal', async () => {
  let calls = 0
  const deps = { fetch: async () => { calls++; return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ ...draft, description: 'a'.repeat(2001) }) }) } }, log: async () => {} }
  await assert.rejects(improveGoalText({}, { description: 'a'.repeat(2001) }, deps), /textgränser/)
  await assert.rejects(improveGoalText({}, { notes: 'a'.repeat(5001) }, deps), /textgränser/)
  assert.equal(calls, 0)
  await assert.rejects(improveGoalText({}, { description: 'Test' }, deps), /ofullständigt/)
  await assert.rejects(improveGoalText({}, { notes: 'Volt' }, { fetch: async () => ({ ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ ...draft, description: '' }) }) }), log: async () => {} }), /ofullständigt/)
})
test('private image upload requires valid profile and migration; no arbitrary paths', async () => {
  const paths = []
  const path = await saveGoalImage(profileId, png, { storage: async (path, options) => {
    paths.push(path)
    if (path.startsWith('bucket/')) return { ok: true, json: async () => ({ public: false }) }
    assert.equal(options.headers['x-upsert'], 'false')
    assert.equal(options.headers['Content-Type'], 'image/png')
    return { ok: true }
  } })
  assert.match(path, new RegExp(`^${profileId}/[a-f0-9-]+\\.png$`))
  assert.equal(paths.length, 2)
  await assert.rejects(saveGoalImage('../other', png), /giltig/)
  await assert.rejects(saveGoalImage(profileId, png, { storage: async () => ({ ok: true, json: async () => ({ public: true }) }) }), /088/)
})
test('signed image URLs stay tied to goal owner, expire and never expose a public URL', async () => {
  const image_path = `${profileId}/22222222-2222-4222-8222-222222222222.png`
  const deps = { storage: async (path, options) => { assert.equal(JSON.parse(options.body).expiresIn, 3600); return { ok: true, json: async () => ({ signedURL: '/object/sign/goal-analysis-images/fixture?token=test' }) } } }
  assert.match(await goalImageUrl({ image_path, profile_id: profileId }, deps), /object\/sign/)
  assert.equal(await goalImageUrl({ image_path, profile_id: 'another' }, deps), null)
  assert.equal(await goalImageUrl({ image_path, profile_id: profileId }, { storage: async () => ({ ok: false }) }), null)
  let removed
  await removeUnattachedGoalImage(image_path, { storage: async (path, options) => { removed = JSON.parse(options.body).prefixes } })
  assert.deepEqual(removed, [image_path])
})
