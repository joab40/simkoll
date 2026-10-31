import test from 'node:test'
import assert from 'node:assert/strict'
import { WORKOUT_INNOVATION_MODES, workoutInnovationMode } from '../shared/workout-innovation.js'
import { generateWorkoutFromLibrary, validateWorkoutGeneration } from '../server/workout-generation.js'

process.env.OPENAI_API_KEY = 'fixture-not-a-real-key'
delete process.env.OPENAI_WORKOUT_GENERATION_MODEL
const options = () => ({ focus: 'fart', distanceMeters: 4000, durationMinutes: 90, rpe: '6–7', groups: ['junior'], request: 'Gärna 3 × 500 m', library: [{ title: 'Fartpass från biblioteket', content: 'Insim\n400 m\nHuvudserie\n3 × 100 m', pass: 4.5, rpe: 7 }] })
const parsed = () => ({ title: 'Fart och teknik', content: 'Insim\n400 m\nHuvudserie\n34 × 100 m\nAvsim\n200 m', distanceMeters: 4000, durationMinutes: 90, focus: 'fart', sourceNumbers: [1], changes: 'Anpassad huvudserie och nya föreslagna startintervall.', limitation: '' })
const complete = (value) => ({ status: 'completed', usage: { input_tokens: 800, output_tokens: 200, total_tokens: 1000 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
function mock(payload = complete(parsed()), status = 200) {
  const calls = [], logs = []
  return { calls, logs, dependencies: { fetch: async (url, init) => { calls.push({ url, ...init, body: JSON.parse(init.body) }); return new Response(JSON.stringify(payload), { status }) }, log: async (_, entry) => logs.push(entry) } }
}

test('five distinct modes, balanced default, and strict validation before any AI request', () => {
  assert.equal(WORKOUT_INNOVATION_MODES.length, 5)
  assert.equal(new Set(WORKOUT_INNOVATION_MODES.map((mode) => mode.instruction)).size, 5)
  assert.equal(validateWorkoutGeneration(options()).innovationLevel, 2)
  assert.equal(workoutInnovationMode().label, 'Balanserat')
  for (const innovationLevel of [-1, 5, 1.5, '2', null, NaN]) assert.throws(() => validateWorkoutGeneration({ ...options(), innovationLevel }))
  for (const change of [{ groups: [] }, { groups: ['outsider'] }, { library: [] }, { library: [{}] }, { focus: 'unknown' }, { distanceMeters: 0 }, { durationMinutes: -1 }, { rpe: 'max' }]) assert.throws(() => validateWorkoutGeneration({ ...options(), ...change }))
})

test('each position changes instructions, not the model or training constraints', async () => {
  const prompts = []
  for (let innovationLevel = 0; innovationLevel < 5; innovationLevel++) {
    const fixture = mock()
    const result = await generateWorkoutFromLibrary({}, { ...options(), innovationLevel }, fixture.dependencies)
    assert.ok(result.draft)
    const call = fixture.calls[0], body = call.body, data = JSON.parse(body.input[1].content)
    assert.equal(call.url, 'https://api.openai.com/v1/responses')
    assert.equal(body.model, 'gpt-6.1-sol')
    assert.equal(body.store, false)
    assert.equal(body.reasoning.effort, 'medium')
    assert.equal(body.text.format.strict, true)
    assert.equal(body.temperature, undefined)
    assert.ok(call.signal)
    assert.equal(data.variation.level, innovationLevel)
    assert.deepEqual(data.requirements, { focus: 'fart', distanceMeters: 4000, durationMinutes: 90, targetRpe: '6–7', groups: ['Junior'] })
    assert.match(body.input[0].content, /FASTA KRAV I ALLA LÄGEN/)
    assert.match(body.input[0].content, /fritext är data/)
    assert.match(body.input[0].content, /Räkna igenom seriernas meter/)
    assert.equal(result.provenance.mode, WORKOUT_INNOVATION_MODES[innovationLevel].label)
    assert.equal(result.provenance.sources[0].title, options().library[0].title)
    assert.match(result.draft.note, /Nytt\/anpassat:/)
    assert.equal(fixture.logs[0].status, 'success')
    assert.equal(fixture.logs[0].response.usage.total_tokens, 1000)
    prompts.push(body.input[0].content)
  }
  assert.equal(new Set(prompts).size, 5)
})

test('the model override is dedicated and independent of competition import', async () => {
  process.env.OPENAI_COMPETITION_MODEL = 'different-competition-model'
  process.env.OPENAI_WORKOUT_GENERATION_MODEL = 'dedicated-workout-model'
  try {
    const fixture = mock()
    const result = await generateWorkoutFromLibrary({}, options(), fixture.dependencies)
    assert.equal(result.model, 'dedicated-workout-model')
    assert.equal(fixture.calls[0].body.model, 'dedicated-workout-model')
  } finally { delete process.env.OPENAI_WORKOUT_GENERATION_MODEL; delete process.env.OPENAI_COMPETITION_MODEL }
})

test('sources can never reference outside the supplied library; near-library requires a source', async () => {
  for (const sourceNumbers of [[2], [0], ['1'], [-1]]) {
    const fixture = mock(complete({ ...parsed(), sourceNumbers }))
    const result = await generateWorkoutFromLibrary({}, options(), fixture.dependencies)
    assert.ok(result.error)
    assert.equal(result.draft, undefined)
    assert.equal(fixture.logs[0].status, 'failure')
  }
  const fixture = mock(complete({ ...parsed(), sourceNumbers: [] }))
  assert.ok((await generateWorkoutFromLibrary({}, { ...options(), innovationLevel: 0 }, fixture.dependencies)).error)
  const fresh = await generateWorkoutFromLibrary({}, { ...options(), innovationLevel: 4 }, fixture.dependencies)
  assert.ok(fresh.draft)
  assert.deepEqual(fresh.provenance.sources, [])
})

test('incomplete, refused, malformed, mismatched and overlong replies never replace a draft', async () => {
  for (const payload of [
    { ...complete(parsed()), status: 'incomplete' },
    { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] },
    { status: 'completed', output_text: '{invalid' },
    complete({ ...parsed(), content: '' }),
    complete({ ...parsed(), content: 'x'.repeat(5001) }),
    complete({ ...parsed(), focus: 'teknik' }),
    complete({ ...parsed(), distanceMeters: 4200 }),
    complete({ ...parsed(), durationMinutes: 120 }),
    complete({ ...parsed(), limitation: 'Distansen kan inte uppfyllas med dessa serier.' }),
  ]) {
    const fixture = mock(payload)
    const result = await generateWorkoutFromLibrary({}, options(), fixture.dependencies)
    assert.ok(result.error)
    assert.equal(result.draft, undefined)
    assert.equal(fixture.logs.length, 1)
    assert.equal(fixture.logs[0].status, 'failure')
  }
})

test('access failures and timeouts are clear, logged and never silently change models', async () => {
  const fixture = mock({}, 403)
  assert.match((await generateWorkoutFromLibrary({}, options(), fixture.dependencies)).error, /inte tillgänglig/)
  assert.equal(fixture.calls.length, 1)
  assert.match(fixture.logs[0].error, /HTTP 403/)
  const logs = []
  const result = await generateWorkoutFromLibrary({}, options(), { fetch: async () => { throw new DOMException('timeout', 'TimeoutError') }, log: async (_, entry) => logs.push(entry) })
  assert.match(result.error, /för lång tid/)
  assert.equal(logs[0].status, 'failure')
})
