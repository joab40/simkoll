import assert from 'node:assert/strict'
import { buildSwimmerPasses, analysisResponse, individualSignals, normalizeIndividualInsight, swimmerVisibleInsight } from '../server/individual-analysis.js'
import { requestSwimmerInsight } from '../server/swimmer-ai.js'

const day = '2026-10-08'
const workout = (id, time, group = 'junior') => ({ id, workout_date: day, title: `${time} syra`, time_of_day: time, target_groups: [group], focus: 'syra', distance_meters: 3100, duration_minutes: 60, content: 'Arm med dolme. 75 m syra.', note: 'Träningssyfte: fart.' })
const session = (slot, type = 'swim') => ({ session_date: day, session_slot: slot, activity_type: type })
const response = { created_at: '2026-10-09T08:00:00Z', activity_date: day, late_entry: true, day_type: 'after', body: 2, rpe: 9, speed_feeling: 5, feeling: 4, comment: 'Bra armpass trots besvär.' }
const input = { responses: [response], trainingGroup: 'junior', workouts: [workout('am', 'morning'), workout('pm', 'afternoon'), workout('other', 'afternoon', 'ungdom_svart')] }
const one = buildSwimmerPasses({ ...input, sessions: [session('afternoon_swim'), session('afternoon_swim')], plans: [{ source_workout_id: 'pm', target_groups: ['junior'], notes: 'Planlänkad notering.' }] })
assert.equal(one.length, 1)
assert.equal(one[0].title, 'afternoon syra')
assert.equal(one[0].matchStatus, 'slot')
assert.equal(one[0].feedbackLink, 'day_only')
assert(one[0].content.includes('dolme')); assert(one[0].note.includes('Planlänkad'))
assert.equal(one[0].feedback.date, day); assert.equal(one[0].feedback.lateEntry, true)
const two = buildSwimmerPasses({ ...input, sessions: [session('morning_swim'), session('afternoon_swim')] })
assert(two.every((row) => row.feedbackLink === 'ambiguous' && row.feedback === null))
const dualTraining = buildSwimmerPasses({ ...input, sessions: [session('afternoon_swim'), session('strength', 'strength')] })
assert.equal(dualTraining[0].feedbackLink, 'ambiguous')
const unknown = buildSwimmerPasses({ ...input, sessions: [session('legacy')] })
assert.equal(unknown[0].matchStatus, 'ambiguous'); assert.equal(unknown[0].distanceMeters, null)
const mismatched = buildSwimmerPasses({ ...input, workouts: [workout('am', 'morning')], sessions: [session('afternoon_swim')] })
assert.equal(mismatched[0].distanceMeters, null)
const signals = individualSignals({ responses: [analysisResponse(response)], workouts: two, coachNotes: [{ date: day, text: 'Stark 75 m prestation med dolme, motsvarar tränarens PB-bedömning.' }] })
assert.equal(signals.trend.length, 1); assert.equal(signals.trend[0].rpe, 9)
assert.equal(signals.volume.distanceMeters, 6200)
assert(signals.volume.basis.includes('Inte uppmätt'))
assert(signals.focuses.every((row) => row.rpe === null))
assert(signals.evidence.some((row) => row.source === 'coach_note' && row.text.includes('75 m')))
assert.equal(individualSignals({ responses: [], workouts: one }).trend[0].responses, 0)
const note = signals.evidence.find((row) => row.source === 'coach_note')
const parsed = { summary: 'Stark enskild prestation.', findings: [{ title: 'Avvikelse', observation: 'God armfart trots låg kroppskänsla.', kind: 'pattern', confidence: 'strong', evidenceIds: [note.id, 'invented-id'], hypothesis: 'Möjlig skillnad mellan passtyper.', alternativeExplanation: 'Olika förutsättningar.', followUp: 'Jämför nästa armpass.' }, { observation: 'Saknar stöd.', evidenceIds: ['invented'] }] }
const insight = normalizeIndividualInsight(parsed, signals.evidence, { methodVersion: 2 })
assert.equal(insight.findings.length, 1)
assert.equal(insight.findings[0].kind, 'observation')
assert.equal(insight.findings[0].confidence, 'limited')
assert.equal(insight.findings[0].evidence.length, 1)
assert(!swimmerVisibleInsight({ insight }).insight.findings[0].evidence[0].text.includes('75 m'))
const recurrent = normalizeIndividualInsight({ ...parsed, findings: [{ ...parsed.findings[0], evidenceIds: ['a', 'b', 'c'] }] }, ['01', '02', '03'].map((date, i) => ({ id: ['a', 'b', 'c'][i], date: `2026-10-${date}` })), {})
assert.equal(recurrent.findings[0].kind, 'pattern')

process.env.OPENAI_API_KEY = 'fixture-only'
process.env.OPENAI_MODEL = 'do-not-use-global-model'
let logs = [], status = 'completed'
const dependencies = { fetch: async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses')
  const body = JSON.parse(options.body)
  assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.reasoning.effort, 'medium')
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
  assert(!('temperature' in body)); assert(!('max_tokens' in body))
  return { ok: true, json: async () => ({ status, output: [{ content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }], usage: { input_tokens: 400, output_tokens: 800, total_tokens: 1200 } }) }
}, log: async (_, row) => logs.push(row) }
const result = await requestSwimmerInsight({ body: { profileId: 'fixture' } }, 'Fixture', dependencies)
assert.equal(result.model, 'gpt-6.1-sol'); assert.equal(logs[0].status, 'success')
status = 'incomplete'
await assert.rejects(requestSwimmerInsight({ body: { profileId: 'fixture' } }, 'Fixture', dependencies), /tidigare analysen finns kvar/)
assert.equal(logs[1].status, 'failure'); assert.equal(logs[1].response.usage.total_tokens, 1200)
console.log('PASS individual analysis: AM/PM, cross-training ambiguity, group isolation, duplicate slots, late check-ins, dated evidence, pattern threshold, private evidence, model routing and incomplete responses')
