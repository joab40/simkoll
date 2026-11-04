import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { isoWeek, isoWeekMonday, planningDriveId, validatePlanningDraft } from '../shared/planning-import.js'
import { openPlanningSpreadsheet, inspectPlanningSpreadsheet, planningSource, parsePlanningTables, validPlanningSourceReference, normalizePlanningSourceReference, planningSourceReferenceHasContent } from '../server/planning-spreadsheet.js'
import { analyzePlanningFile, planningCalendarChoices, preparePlanningImport, loadPlanningFile, loadPlanningRows, planningDateConflict } from '../server/planning-import.js'
import { groupSwimOccasions } from '../shared/swim-workout-options.js'

const id = '11111111-1111-4111-8111-111111111111'
const row = { date: '2026-11-09', title: 'Fart', activityType: 'swim', timeOfDay: 'afternoon', distanceMeters: 3000, durationMinutes: null, notes: '', calendarKey: 'none' }
const week = { monday: '2026-11-09', groups: ['junior', 'ungdom_svart'], mode: 'add', sessions: [row] }
const event = { calendarId: 'junior', uid: 'one', date: row.date, title: 'Träning Junior', time: '18:00', location: 'Himlabadet', targetGroups: ['junior'], durationMinutes: 120 }
const black = { ...event, calendarId: 'black', title: 'Träning Svart', targetGroups: ['ungdom_svart'] }
function fixture() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Veckoplanering Junior-Ungdom Svart', null, null, null, null, null, null, null, null, null, null, null, 'Veckoplanering Ungdom Orange'],
    [null, 'Vecka', 'Datum'], [null, 46, '9-15 november'], [], ['Medel', 'Morgon', null, null, null, null, 'Eftermiddag'],
    ['Dag', 'Inriktning', 'Huvudserie', 'Längd', 'Banor', 'Tränare', 'Inriktning', 'Huvudserie', 'Längd', 'Banor', 'Tränare'],
    ['Måndag', null, null, null, null, null, 'Återhämtning', null, 3500],
    ['Tisdag', null, null, null, null, null, 'F2 Spec', 'Uppdelade träningstider', 4500],
    [null, null, null, null, null, null, 'Bröstsim/Medley', null, 4500],
    ['Onsdag', 'Benpass/Distans', '2 pass, välj 3000-4000', 3500, 3, 'E.W', 'Fart', '12x50 spec st.4,00', 3000],
    ['Torsdag', null, null, null, null, null, 'F2 Frisim', null, 4500],
    ['Fredag'], ['Lördag'], ['Söndag', null, null, null, null, null, 'F2 Spec', null, 4000],
    ['Summa', null, null, 28000, null, null, null, 'Anpassa fartpass för sprint'],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Närmsta veckorna')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Old']]), 'Genomförda veckor 2025')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Notes']]), 'Uppdelning tisdagar')
  return { workbook, bytes: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), fileName: 'Veckoplanering.xlsx' }
}

test('ISO weeks handle new year, week 53 and DST without local timezone arithmetic', () => {
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 })
  assert.equal(isoWeekMonday(2026, 46), '2026-11-09')
  assert.equal(isoWeekMonday(2026, 53), '2026-12-28')
  assert.throws(() => isoWeekMonday(2025, 53))
  assert.deepEqual(isoWeek('2026-03-29'), { year: 2026, week: 13 })
})
test('only Drive/Sheets IDs are accepted, not arbitrary external downloads', () => {
  assert.equal(planningDriveId('https://docs.google.com/spreadsheets/d/abcdefgh123/edit?usp=sharing'), 'abcdefgh123')
  assert.throws(() => planningDriveId('https://attacker.invalid/file/abcdefgh123'))
  assert.throws(() => planningDriveId('https://docs.google.com.attacker.invalid/spreadsheets/d/abcdefgh123'))
})
test('date labels flag wrong year/week combinations, including cross-month weeks', () => {
  assert.equal(planningDateConflict('2026-11-09', '9-15 november'), false)
  assert.equal(planningDateConflict('2026-11-09', '10-16 november'), true)
  assert.equal(planningDateConflict('2026-10-26', '26 oktober-1 november'), false)
  assert.equal(planningDateConflict('2026-11-09', '2025-11-10'), true)
})
test('workbook inspection excludes archive and support tabs; source parser preserves merged weekdays and alternatives', () => {
  const { bytes } = fixture(), workbook = openPlanningSpreadsheet(bytes)
  assert.deepEqual(inspectPlanningSpreadsheet(workbook, 'x.xlsx').sheets.map(sheet => sheet.suggested), [true, false, false])
  assert.equal(planningSource(workbook, ['Närmsta veckorna']).sheets.length, 1)
  const draft = parsePlanningTables(workbook, ['Närmsta veckorna'], 2026)
  assert.equal(draft.weeks.length, 1)
  assert.deepEqual(draft.weeks[0].groups, week.groups)
  const tuesday = draft.weeks[0].sessions.filter(row => row.date === '2026-11-10')
  assert.equal(tuesday.length, 2)
  assert.equal(tuesday[1].title, 'Bröstsim/Medley')
  assert.equal(tuesday[1].distanceMeters, 4500)
  assert.match(draft.weeks[0].sessions.find(row => row.timeOfDay === 'morning').notes, /3000-4000/)
  assert.ok(!draft.weeks[0].sessions.some(row => row.title === 'Summa'))
})
test('invalid, oversized and uncached formula sources fail safely', async () => {
  assert.throws(() => openPlanningSpreadsheet(Buffer.from('not excel')), /riktig/)
  const { workbook } = fixture()
  assert.throws(() => planningSource(workbook, ['nope']))
  workbook.Sheets['Närmsta veckorna'].B7 = { t: 'n', f: '1+1' }
  assert.throws(() => planningSource(workbook, ['Närmsta veckorna']), /saknar sparat resultat/)
  await assert.rejects(loadPlanningFile({ fileName: 'x.png', fileData: 'data:image/png;base64,AA==' }), /XLS/)
})
test('source references allow blank leading cells, absolute/sheet-qualified ranges, unions and merged weekdays', () => {
  const { workbook } = fixture()
  workbook.Sheets['Närmsta veckorna']['!merges'] = [{ s: { r: 7, c: 0 }, e: { r: 8, c: 0 } }]
  const sheet = planningSource(workbook, ['Närmsta veckorna']).sheets[0]
  assert.equal(normalizePlanningSourceReference(sheet, "'Närmsta veckorna'!$A$9 : $K$9"), 'A9:K9')
  assert.equal(planningSourceReferenceHasContent(sheet, 'A9:K9'), true) // A9 is blank, G9 has the activity.
  assert.equal(planningSourceReferenceHasContent(sheet, 'A9'), true) // Merged weekday anchored at A8.
  assert.equal(planningSourceReferenceHasContent(sheet, 'G9, I9:K9'), true)
  assert.equal(validPlanningSourceReference(sheet, 'G9–K9'), true)
  assert.equal(planningSourceReferenceHasContent(sheet, 'B8:F8'), false)
  assert.equal(validPlanningSourceReference(sheet, 'A999:K999'), false)
  assert.equal(validPlanningSourceReference(sheet, "'Wrong sheet'!A9:K9"), false)
  assert.equal(validPlanningSourceReference(sheet, 'K9:A9'), false)
})
test('draft validation rejects overlapping group weeks, dates outside week, missing slot and negative quantity', () => {
  assert.equal(validatePlanningDraft([week])[0].sessions[0].distanceMeters, 3000)
  assert.throws(() => validatePlanningDraft([week, week]), /förekommer/)
  for (const patch of [{ date: '2026-11-16' }, { timeOfDay: '' }, { distanceMeters: -10 }, { durationMinutes: 0 }, { date: '2026-02-30' }]) assert.throws(() => validatePlanningDraft([{ ...week, sessions: [{ ...row, ...patch }] }]))
})
test('calendar matches merge simultaneous groups, exclude other events and require deliberate ambiguous selection', () => {
  const choices = planningCalendarChoices([event, black, { ...event, title: 'Anmälan läger' }])
  assert.equal(choices.length, 1); assert.deepEqual(choices[0].groups, week.groups)
  const prepared = preparePlanningImport([{ ...week, sessions: [{ ...row, calendarKey: choices[0].key }] }], [], [event, black], id)
  assert.equal(prepared.rows[0].duration_minutes, 120)
  assert.equal(prepared.rows[0].location, 'Himlabadet')
  assert.equal(prepared.rows[0].calendar_link.keys.length, 2)
  assert.throws(() => preparePlanningImport([{ ...week, sessions: [{ ...row, calendarKey: '' }] }], [], [event, black], id), /Välj kalender/)
  assert.throws(() => preparePlanningImport([{ ...week, sessions: [{ ...row, calendarKey: choices[0].key }] }], [], [{ ...event, date: '2026-11-10' }], id), /ändrats/)
})
test('alternatives share an occasion, independent sessions do not; repeated imports skip exact duplicates', () => {
  const prepared = preparePlanningImport([{ ...week, sessions: [row, { ...row, title: 'Bröstsim', distanceMeters: 4500 }] }], [], [], id)
  assert.equal(prepared.rows[0].alternative_group_id, prepared.rows[1].alternative_group_id)
  const options = prepared.rows.map(p => ({ ...p, id: p.id, date: p.plan_date, activityType: p.activity_type, alternativeGroupId: p.alternative_group_id, timeOfDay: p.time_of_day }))
  assert.equal(groupSwimOccasions(options).length, 1)
  const split = preparePlanningImport([{ ...week, sessions: [row, { ...row, title: 'Eget pass', separate: true }] }], [], [], id)
  assert.notEqual(split.rows[0].alternative_group_id, split.rows[1].alternative_group_id)
  assert.equal(preparePlanningImport([week], prepared.rows, [], id).summary.duplicates, 1)
})
test('published workouts and competition plans are protected from replacing', () => {
  const existing = [{ ...preparePlanningImport([week], [], [], id).rows[0], source_workout_id: id, updated_at: '2026-11-01T00:00:00Z' }]
  const prepared = preparePlanningImport([{ ...week, mode: 'replace' }], existing, [], id)
  assert.equal(prepared.summary.replaced, 0); assert.equal(prepared.summary.protected, 1); assert.equal(prepared.rows.length, 0)
})
test('complementing a previous import reuses its occasion and does not duplicate covered groups', () => {
  const previous = preparePlanningImport([week], [], [], id).rows
  const nextId = '22222222-2222-4222-8222-222222222222'
  const changed = preparePlanningImport([{ ...week, sessions: [{ ...row, title: 'Spec' }] }], previous, [], nextId)
  assert.equal(changed.rows[0].alternative_group_id, previous[0].alternative_group_id)
  const subset = preparePlanningImport([{ ...week, groups: ['junior'] }], previous, [], nextId)
  assert.equal(subset.rows.length, 0)
  const partlyCovered = preparePlanningImport([week], [{ ...previous[0], target_groups: ['junior'] }], [], nextId)
  assert.deepEqual(partlyCovered.rows[0].target_groups, ['ungdom_svart'])
})
test('incomplete existing planning cannot be used for overwrite', async () => {
  await assert.rejects(loadPlanningRows([week], async () => new Response('{}', { status: 500 })), /kunde inte hämtas/)
  await assert.rejects(loadPlanningRows([week], async () => new Response(JSON.stringify(Array(2001).fill({})))), /för stor/)
})
test('existing planning is paged below the database row cap, including a full first page', async () => {
  const offsets = []
  const rows = await loadPlanningRows([week], async path => { const offset = Number(new URL(`https://fixture.invalid/${path}`).searchParams.get('offset')); offsets.push(offset); return new Response(JSON.stringify(Array(offset ? 7 : 500).fill({}))) })
  assert.equal(rows.length, 507); assert.deepEqual(offsets, [0, 500])
})
test('GPT-6.1 uses selected source only, structured output, no storage, and validated references', async () => {
  const original = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'fixture-not-real'
  const { bytes, fileName } = fixture(), aiWeek = { ...week, weekNumber: 46, year: 2026, sourceSheet: 'Närmsta veckorna', sourceRange: 'A2:K15', sourceDateLabel: '9-15 november', warnings: [], sessions: [{ ...row, sourceCells: 'G7:K7' }] }
  const logs = []; let body
  const dependencies = { log: async (...args) => logs.push(args[1]), fetch: async (_, options) => { body = JSON.parse(options.body); return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify({ weeks: [aiWeek], warnings: [] }) })) } }
  try {
    const draft = await analyzePlanningFile({}, { bytes, fileName }, { sheets: ['Närmsta veckorna'], year: 2026, useAi: true }, dependencies)
    assert.equal(draft.weeks[0].monday, week.monday)
    assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
    assert.ok(!body.input[1].content.includes('Genomförda veckor 2025'))
    assert.equal(logs[0].feature, 'weekly_planning_import')
    aiWeek.sessions[0].sourceCells = "'Närmsta veckorna'!$A$9:$K$9"
    const blankLeading = await analyzePlanningFile({}, { bytes, fileName }, { sheets: ['Närmsta veckorna'], year: 2026, useAi: true }, dependencies)
    assert.equal(blankLeading.usedAi, true); assert.equal(blankLeading.weeks[0].sessions[0].sourceCells, 'A9:K9')
    aiWeek.sessions[0].sourceCells = 'A999:K999'
    const fallback = await analyzePlanningFile({}, { bytes, fileName }, { sheets: ['Närmsta veckorna'], year: 2026, useAi: true }, dependencies)
    assert.equal(fallback.usedAi, false); assert.match(fallback.warnings.join(' '), /direkt från Excel/)
    assert.ok(fallback.weeks[0].sessions.length > 1)
    const unknown = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(unknown, XLSX.utils.aoa_to_sheet([['Titel'], ['Fart']]), 'Planering')
    aiWeek.sourceSheet = 'Planering'; aiWeek.sourceRange = 'A1:A2'
    await assert.rejects(analyzePlanningFile({}, { bytes: XLSX.write(unknown, { type: 'buffer', bookType: 'xlsx' }), fileName }, { sheets: ['Planering'], year: 2026, useAi: true }, dependencies), /cellhänvisningar/)
  } finally { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original }
})
