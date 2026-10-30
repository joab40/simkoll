import test from 'node:test'
import assert from 'node:assert/strict'
import { drylandLogInput } from '../shared/dryland-program.js'
import { strengthPasses } from '../shared/strength-program.js'
import { buildDiaryEntries, summarizeDiary } from '../shared/training-diary.js'
import { saveDrylandLog } from '../server/dryland-program.js'
import { COACH_NAV_ITEMS } from '../shared/coach-navigation.js'
import { interpretStrengthProgram } from '../server/strength-import.js'

const owner = '11111111-1111-4111-8111-111111111111', assignment = '22222222-2222-4222-8222-222222222222'
const program = { program_type: 'dryland', title: 'Landprogram', content: 'Pass 1 · Balans\n1. Balans — 30 sek\n2. Balans — 20 sek\n\nPass 2 · Rörlighet\n1. Rotation — 8 reps', updated_at: '2026-10-30T08:00:00Z' }
const input = (extra = {}) => ({ assignmentId: assignment, sessionDate: '2026-10-29', passNumber: 1, completed: true, notes: '', results: { Balans: { completed: true, result: '30 sek' }, 'Balans (2)': { completed: false, result: '' } }, ...extra })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
test('land programs retain 1–5 passes, legacy text and separate repeated exercise keys', () => {
  assert.equal(strengthPasses({ ...program, content: '1. Balans: 30 sek' })[0].title, 'Landpass')
  assert.equal(strengthPasses(program).length, 2)
  const parsed = drylandLogInput(program, input(), '2026-10-30')
  assert.equal(parsed.results['Balans (2)'].completed, false)
  assert.equal(parsed.pass.title, 'Balans')
  const five = { ...program, content: Array.from({ length: 5 }, (_, i) => `Pass ${i + 1} · Del ${i + 1}\n1. Balans — 30 sek`).join('\n\n') }
  assert.equal(drylandLogInput(five, input({ passNumber: 5, results: {} }), '2026-10-30').pass.passNumber, 5)
  assert.ok(COACH_NAV_ITEMS.some((item) => item.key === 'dryland-programs'))
})
test('invalid dates, missing confirmation, nonexistent passes and forged exercises never become results', () => {
  for (const extra of [{ sessionDate: '2026-02-30' }, { sessionDate: '2026-11-01' }, { completed: false }, { passNumber: 3 }, { passNumber: '1' }, { results: { Invented: { completed: true, result: '8' } } }, { notes: 'x'.repeat(1001) }, { results: { Balans: { completed: true, result: 'x'.repeat(101) } } }, { results: { Balans: { completed: true, result: '8', points: 50 } } }]) assert.throws(() => drylandLogInput(program, input(extra), '2026-10-30'))
  assert.deepEqual(drylandLogInput(program, input({ results: {} }), '2026-10-30').results, {})
})
test('save uses session owner, real assignment and an atomic RPC, without points or strength writes', async () => {
  const calls = [], row = { id: 'log', assignment_id: assignment, profile_id: owner, pass_number: 1, session_date: '2026-10-29', results: input().results }
  const db = async (path, options = {}) => { calls.push({ path, options }); return json(path.startsWith('program_assignments?') ? [{ id: assignment, training_programs: program }] : row) }
  const saved = await saveDrylandLog(owner, input({ profileId: 'ignored', type: 'strength', rewardPoints: 100 }), db)
  assert.equal(saved.profileId, owner)
  assert.match(calls[0].path, new RegExp(`profile_id=eq.${owner}&removed_at=is.null`))
  const body = JSON.parse(calls[1].options.body)
  assert.equal(calls[1].path, 'rpc/save_dryland_program_log'); assert.equal(body.p_profile_id, owner)
  assert.equal(body.p_pass_title, 'Balans'); assert.equal(body.p_program_version, program.updated_at)
  assert.ok(calls.every((c) => !/strength_program_logs|point_events|personal_training_sessions/.test(c.path)))
})
test('wrong owners, wrong type, removed assignments, missing SQL and concurrent changes fail clearly', async () => {
  for (const rows of [[], [{ id: assignment, training_programs: { ...program, program_type: 'strength' } }]]) await assert.rejects(saveDrylandLog(owner, input(), async () => json(rows)), { status: 403 })
  for (const [message, status] of [['PGRST202', 503], ['DRYLAND_PROGRAM_CHANGED', 409], ['DRYLAND_ASSIGNMENT_UNAVAILABLE', 409], ['upstream failure', 502]]) await assert.rejects(saveDrylandLog(owner, input(), async (path) => path.startsWith('program_assignments?') ? json([{ id: assignment, training_programs: program }]) : json({ message }, 400)), { status })
})
test('planner plus program remains one dryland day; retained logs cannot restore an unmarked completion', () => {
  const log = { assignment_id: assignment, session_date: '2026-10-29', pass_number: 1, program_title: 'Historisk titel', pass_title: 'Balans', pass_content: 'Gamla instruktioner', results: input().results, notes: 'Reflektion' }
  const session = { session_date: '2026-10-29', activity_type: 'dryland', session_slot: 'dryland', source: 'manual' }
  const built = buildDiaryEntries({ sessions: [session], drylandLogs: [log, { ...log, pass_number: 2 }], today: '2026-10-30' })
  assert.equal(built.length, 1); assert.equal(built[0].state, 'completed'); assert.equal(built[0].drylandLogs.length, 2)
  assert.equal(built[0].drylandLogs[0].content, 'Gamla instruktioner')
  const unmarked = buildDiaryEntries({ sessions: [], drylandLogs: [log], today: '2026-10-30' })
  assert.equal(unmarked[0].state, 'feedback'); assert.equal(unmarked[0].drylandLogs.length, 1)
  assert.equal(summarizeDiary(unmarked, [], '2026-10-29', '2026-10-30').sessions, 0)
})
test('optional AI import keeps land-specific instructions and usage separate, without changing model configuration', async () => {
  process.env.OPENAI_API_KEY = 'fixture-only'
  let usage
  const draft = { title: 'Land', description: 'Balans', passes: [{ title: 'A', exercises: [{ name: 'Balans', prescription: '30 sek', instructions: '', uncertain: false }] }] }
  const parsed = await interpretStrengthProgram({ headers: {} }, { type: 'dryland', fileName: 'land.jpg', fileData: 'data:image/jpeg;base64,ZmFrZQ==', generateInstructions: false }, {
    fetch: async (url, options) => { const sent = JSON.parse(options.body); assert.match(sent.input[0].content, /landträningsprogram/); assert.match(sent.input[0].content, /lägg inte till vikter/); assert.match(sent.input[1].content[0].text, /Generera inga egna teknikråd/); assert.equal(sent.store, false); return json({ status: 'completed', output_text: JSON.stringify(draft) }) },
    log: async (request, entry) => { usage = entry },
  })
  assert.equal(parsed.draft.title, 'Land'); assert.equal(usage.feature, 'dryland_program_import')
})
