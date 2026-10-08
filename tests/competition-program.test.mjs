import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProgram, validateProgram } from '../src/competition-program.js'
import { interpretCompetitionProgram, readProgramResponse } from '../server/competition-program.js'
import { salsimmet } from './fixtures/salsimmet.mjs'

test('Sälsimmet control: 55 races, 21/20/14 per session, Mix, F and relays', () => {
  const draft = normalizeProgram(salsimmet)
  assert.deepEqual(validateProgram(draft), [])
  assert.equal(draft.events.length, 55)
  assert.deepEqual(draft.sessions.map((s) => draft.events.filter((e) => e.sessionLabel === s.label).length), [21, 20, 14])
  assert.equal(draft.events[13].gender, 'Mix'); assert.equal(draft.events[13].ageClass, 'D')
  assert.equal(draft.events[15].label, '100 Medley'); assert.equal(draft.events[16].label, '50 Bröstsim')
  assert.equal(draft.events[3].ageClass, 'F & yngre'); assert.equal(draft.events[19].distanceMeters, 100)
})
test('missing 17–21, duplicate rows, class D in gender and invented numbered pause are blocked', () => {
  const draft = normalizeProgram(salsimmet)
  draft.events = draft.events.filter((e) => Number(e.eventNumber) < 17 || Number(e.eventNumber) > 21)
  assert(validateProgram(draft).some((i) => i.message.includes('17, 18, 19, 20, 21')))
  const bad = normalizeProgram(salsimmet)
  bad.events.push({ ...bad.events[0] })
  bad.events[13].gender = 'D'
  bad.events[16] = { ...bad.events[16], itemType: 'pause', label: 'Paus' }
  const issues = validateProgram(bad)
  assert(issues.some((i) => i.message.includes('flera gånger')))
  assert(issues.some((i) => i.row === 13)); assert(issues.some((i) => i.row === 16))
})
test('uncertain extraction needs review; explicit unnumbered pause remains nonselectable', () => {
  const draft = normalizeProgram(salsimmet)
  draft.events[0].uncertain = true
  assert(validateProgram(draft).some((i) => i.row === 0))
  draft.events[0].uncertain = false
  draft.events.push({ ...draft.events[0], itemType: 'pause', eventNumber: '', label: 'Paus', distanceMeters: null, stroke: 'Annat' })
  assert.deepEqual(validateProgram(draft), [])
  assert.equal(normalizeProgram(draft).events.at(-1).entryAllowed, false)
})
test('incomplete, refused and malformed AI responses cannot be treated as programs', () => {
  assert.throws(() => readProgramResponse({ status: 'incomplete', output_text: '{"events":[]}' }))
  assert.throws(() => readProgramResponse({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }))
  assert.throws(() => readProgramResponse({ status: 'completed', output_text: '{' }))
})
test('two-step vision contract returns an editable draft without database writes', async () => {
  const oldKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only'
  const calls = []
  const replies = [{ sessions: salsimmet.sessions, ageClasses: 'A–F', warnings: [] }, { events: salsimmet.events, warnings: [] }]
  try {
    const result = await interpretCompetitionProgram({}, { fileData: 'data:image/jpeg;base64,dGVzdA==', mimeType: 'image/jpeg' }, {
      fetch: async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/responses')
        calls.push(JSON.parse(init.body))
        return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(replies.shift()) }) }
      }, log: async () => {},
    })
    assert.equal(calls.length, 2)
    assert.equal(calls[0].model, process.env.OPENAI_COMPETITION_PROGRAM_MODEL || 'gpt-6.1-sol')
    assert.equal(calls[0].input[1].content[1].detail, 'high')
    assert.equal(calls[0].store, false)
    assert.equal(result.draft.events.length, 55)
    assert.deepEqual(result.issues, [])
    assert(!('events' in result), 'No legacy auto-save contract')
  } finally { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey }
})
