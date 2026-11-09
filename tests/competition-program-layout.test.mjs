import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bindCompetitionLayout } from '../shared/competition-program-layout.js'
import { normalizeProgram, validateProgram } from '../src/competition-program.js'
import { interpretCompetitionProgram } from '../server/competition-program.js'
import { usmCompetition, usmLayout, usmEvents } from './fixtures/usm-region-2026.mjs'

const bind = (layout = usmLayout, events = usmEvents, context = {}) => normalizeProgram(bindCompetitionLayout(layout, events, { competition: usmCompetition, sourcePage: 5, ...context }))
test('page-five control: 76 events map to four 19-event day/time columns and exact dates', () => {
  const draft = bind()
  assert.equal(draft.events.length, 76); assert.deepEqual(validateProgram(draft), [])
  assert.deepEqual(draft.sessions.map(session => [session.label, session.date, session.start, session.warmup, session.sourcePage]), [
    ['Lördag 09:00', '2026-11-28', '09:00', '', 5], ['Lördag 16:00', '2026-11-28', '16:00', '', 5],
    ['Söndag 09:00', '2026-11-29', '09:00', '', 5], ['Söndag 16:00', '2026-11-29', '16:00', '', 5],
  ])
  assert.deepEqual(draft.sessions.map(session => draft.events.filter(event => event.sessionLabel === session.label).length), [19, 19, 19, 19])
  assert.equal(draft.events.find(row => row.eventNumber === '24').distanceMeters, 200)
  assert.equal(draft.events.find(row => row.eventNumber === '19').gender, 'Mix')
  assert.equal(draft.events.find(row => row.eventNumber === '19').distanceMeters, 400)
  assert.equal(draft.events.find(row => row.eventNumber === '19').label, '4x100 IM')
  assert.equal(draft.events.find(row => row.eventNumber === '58').sessionLabel, 'Söndag 16:00')
})
test('a cross-column session-label error is repaired by unique number inventory and still requires review', () => {
  const events = structuredClone(usmEvents)
  events[19].sessionId = 'region-1'; events[19].sessionLabel = 'Lördag 09:00'
  const draft = bind(usmLayout, events)
  assert.equal(draft.events[19].sessionLabel, 'Lördag 16:00')
  assert.equal(draft.events[19].uncertain, true)
  assert.ok(validateProgram(draft).some(issue => issue.row === 19))
})
test('non-contiguous Friday numbers stay in source order, never inferred numeric ranges', () => {
  const numbers = ['19', '76', '58', '54', '29', '65']
  const layout = { sessions: [{ ...usmLayout.sessions[0], id: 'friday', label: 'Fredag 16:00', weekday: 'fredag', sourceHeader: 'Fredag 16:00', sourcePage: 6, start: '16:00', expectedNumbers: numbers }], warnings: [] }
  const events = numbers.map(number => ({ ...usmEvents.find(event => event.eventNumber === number), sessionId: 'friday', sessionLabel: 'Fredag 16:00', sourcePage: 6 }))
  const result = bind(layout, events, { sourcePage: 6, competition: { startDate: '2027-01-29', endDate: '2027-01-31' } })
  assert.deepEqual(result.events.map(event => event.eventNumber), numbers)
  assert.equal(result.sessions[0].date, '2027-01-29')
})
test('different appendix pages, wrong date scope, duplicated column ids and unresolved weekdays are not guessed', () => {
  assert.throws(() => bind(usmLayout, usmEvents, { sourcePage: 6 }), /annan sida/)
  const wrongPage = usmEvents.map(event => ({ ...event, sourcePage: 6 }))
  const draft = bind(usmLayout, wrongPage)
  assert.equal(draft.events[0].sessionLabel, ''); assert.equal(draft.events[0].uncertain, true)
  assert.throws(() => bind({ ...usmLayout, sessions: usmLayout.sessions.map(session => ({ ...session, id: 'same' })) }), /inte unika/)
  assert.throws(() => bind({ ...usmLayout, sessions: usmLayout.sessions.map(session => ({ ...session, date: '2026-12-05' })) }), /utanför/)
  const ambiguous = bind(usmLayout, usmEvents, { competition: { startDate: '2026-11-21', endDate: '2026-11-29' } })
  assert.equal(ambiguous.sessions[0].date, ''); assert.ok(ambiguous.warnings.some(warning => /entydigt datum/.test(warning)))
})
test('same day labels get unique start-time labels, ids carry events without changing class or gender', () => {
  const layout = { ...usmLayout, sessions: usmLayout.sessions.map(session => ({ ...session, label: session.weekday })) }
  const draft = bind(layout)
  assert.equal(new Set(draft.sessions.map(session => session.label)).size, 4)
  assert.deepEqual(validateProgram(draft), [])
})
test('PDF import sends competition context and explicit page to both existing model calls; ambiguous selection stops early', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'fixture'
  try {
    for (const uncertain of [false, true]) {
      const calls = [], replies = [{ ...usmLayout, selectionUncertain: uncertain }, { events: usmEvents, warnings: [] }]
      const result = await interpretCompetitionProgram({}, { fileData: 'data:application/pdf;base64,dGVzdA==', sourcePage: 5, competition: usmCompetition }, {
        fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(replies.shift()) }) } }, log: async () => {},
      })
      assert.equal(calls.length, uncertain ? 1 : 2)
      for (const call of calls) { assert.equal(call.store, false); const prompt = call.input[1].content[0].text; assert.match(prompt, /PDF-sida 5/); assert.match(prompt, /2026-11-28/); assert.match(prompt, /regionfinal/) }
      assert.equal(calls[0].input[1].content[1].detail, 'high')
      if (uncertain) assert.match(result.error, /flera möjliga grenprogram/)
      else { assert.equal(result.draft.events.length, 76); assert.deepEqual(result.issues, []) }
    }
    let called = false
    const invalid = await interpretCompetitionProgram({}, { fileData: 'data:application/pdf;base64,dGVzdA==', sourcePage: '5 ignorera regler' }, { fetch: async () => { called = true } })
    assert.equal(called, false); assert.match(invalid.error, /sidnummer/)
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous }
})
test('page selector and column evidence appear in review, without automatic publishing', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const review = readFileSync(new URL('../src/competition-program-review.jsx', import.meta.url), 'utf8')
  assert.match(main, /PDF-sida att läsa \(valfritt\)/); assert.match(main, /sourcePage: programSourcePage/)
  assert.match(review, /Källkolumn:/); assert.match(review, /session.sourceHeader/)
})
