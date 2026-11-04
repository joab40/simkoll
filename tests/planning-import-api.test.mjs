import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
process.env.SUPABASE_URL = 'https://planning-import.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'planning-import-fixture'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler, parseSportAdminIcs } = await import('../api/workouts.js')
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'coach', email: 'coach@example.invalid' })
const importId = '11111111-1111-4111-8111-111111111111'
const week = { monday: '2026-11-09', mode: 'add', groups: ['junior'], sessions: [{ date: '2026-11-09', title: 'Fart', activityType: 'swim', timeOfDay: 'afternoon', calendarKey: 'none' }] }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
const groupRows = [{ id: 'junior', name: 'Junior' }, { id: 'ungdom_svart', name: 'Ungdom Svart' }, { id: 'ungdom_orange', name: 'Ungdom Orange' }, { id: 'junior_elit', name: 'Junior Elit' }]
async function call(body, token = code) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': token }, body, query: {} }, response)
  return response
}
test('calendar parser converts UTC to Stockholm, retains end-time duration and filters before its limit', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:one', 'DTSTART:20261109T170000Z', 'DTEND:20261109T190000Z', 'SUMMARY:Träning', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const parsed = parseSportAdminIcs(ics, { strict: true, from: '2026-11-09', to: '2026-11-15' })
  assert.equal(parsed[0].time, '18:00'); assert.equal(parsed[0].durationMinutes, 120)
  assert.equal(parseSportAdminIcs(ics, { strict: true, from: '2026-11-10' }).length, 0)
})
test('API requires coach, explicit preview and overwrite approval; stale state never writes', async () => {
  const original = globalThis.fetch; const writes = []; let rows = []
  globalThis.fetch = async (raw, options = {}) => {
    const path = new URL(raw).pathname.split('/').at(-1)
    if (path === 'training_groups') return json(groupRows)
    if (path === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [] } }])
    if (path === 'training_plans') return json(rows)
    if (path === 'planning_import_batches') return json([])
    if (path === 'apply_weekly_planning_import') { writes.push(JSON.parse(options.body)); return json({ added: 1 }) }
    throw Error(`Unexpected request: ${path}`)
  }
  try {
    assert.equal((await call({ action: 'planning-import-preview' }, '')).code, 403)
    const preview = await call({ action: 'planning-import-preview', importId, weeks: [week] })
    assert.equal(preview.code, 200); assert.equal(preview.data.summary.added, 1); assert.equal(writes.length, 0)
    assert.equal((await call({ action: 'planning-import-apply', importId, weeks: [week] })).code, 409)
    assert.equal((await call({ action: 'planning-import-apply', importId, weeks: [{ ...week, mode: 'replace' }], previewToken: preview.data.previewToken })).code, 400)
    rows = [{ id: '33333333-3333-4333-8333-333333333333', plan_date: '2026-11-09', target_groups: ['junior'], title: 'Newly changed', updated_at: '2026-11-04T00:00:00Z' }]
    assert.equal((await call({ action: 'planning-import-apply', importId, weeks: [week], previewToken: preview.data.previewToken })).code, 409)
    assert.equal(writes.length, 0)
    rows = []
    assert.equal((await call({ action: 'planning-import-apply', importId, weeks: [week], previewToken: preview.data.previewToken })).code, 200)
    assert.equal(writes.length, 1); assert.equal(writes[0].p_rows[0].target_groups[0], 'junior')
  } finally { globalThis.fetch = original }
})
test('analysis API uses explicit group/week scope and returns missing weeks without reading unrelated calendar or plans', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Veckoplanering Junior-Ungdom Svart'], [null, 'Vecka', 'Datum'], [null, 46, '9-15 november'], [], ['Medel', 'Morgon', null, null, null, null, 'Eftermiddag'],
    ['Dag', 'Inriktning', 'Huvudserie', 'Längd', 'Banor', 'Tränare', 'Inriktning', 'Huvudserie', 'Längd', 'Banor', 'Tränare'],
    ['Måndag', null, null, null, null, null, 'Återhämtning', null, 3500],
  ]), 'Planering')
  const body = { action: 'planning-import-analyze', fileName: 'Planering.xlsx', fileData: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })}`, sheets: ['Planering'], groups: ['ungdom_svart'], mondays: ['2026-11-09'], useAi: false }
  const original = globalThis.fetch, reads = []
  globalThis.fetch = async raw => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    reads.push(table)
    if (table === 'training_groups') return json(groupRows)
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [] } }])
    if (table === 'training_plans') { assert.match(url.search, /2026-11-09/); assert.match(url.search, /2026-11-15/); return json([]) }
    throw Error(`Unexpected request: ${table}`)
  }
  try {
    const scoped = await call(body)
    assert.equal(scoped.code, 200); assert.equal(scoped.data.weeks.length, 1)
    assert.deepEqual(scoped.data.weeks[0].groups, ['ungdom_svart'])
    assert.equal(scoped.data.weeks[0].sessions[0].distanceMeters, 3500)
    assert.deepEqual(scoped.data.missing, [])
    const fourGroups = await call({ ...body, groups: groupRows.map(group => group.id) })
    assert.equal(fourGroups.code, 200)
    assert.deepEqual(fourGroups.data.weeks[0].groups, ['junior', 'ungdom_svart'])
    assert.ok(fourGroups.data.missing.some(item => item.group === 'junior_elit'))
    reads.length = 0
    const missing = await call({ ...body, mondays: ['2026-11-16'] })
    assert.equal(missing.code, 200); assert.deepEqual(missing.data.weeks, [])
    assert.deepEqual(missing.data.missing, [{ monday: '2026-11-16', group: 'ungdom_svart' }])
    assert.deepEqual(reads, ['training_groups'])
    assert.equal((await call({ ...body, groups: [] })).code, 400)
    assert.equal((await call({ ...body, mondays: ['2026-11-10'] })).code, 400)
  } finally { globalThis.fetch = original }
})
test('planning view loads beyond the former 200-row limit without treating later published workouts as deleted', async () => {
  const original = globalThis.fetch, reads = [], writes = []
  const ids = Array.from({ length: 507 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
  const plans = ids.map(id => ({ id, plan_date: '2026-11-09', title: 'Published', activity_type: 'swim', target_groups: ['junior'], source_workout_id: id }))
  const workouts = ids.map(id => ({ id, workout_date: '2026-11-09', title: 'Published', target_groups: ['junior'] }))
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1), offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000)
    reads.push({ table, offset })
    if (options.method && options.method !== 'GET') writes.push(options.method)
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [] } }])
    if (table === 'training_plans') return json(plans.slice(offset, offset + limit))
    if (table === 'daily_workouts') return json(workouts.slice(offset, offset + limit))
    if (table === 'training_cycles') return json([])
    if (table === 'sportadmin_hidden_activities') return json([])
    throw Error(`Unexpected request: ${table}`)
  }
  try {
    const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
    await handler({ method: 'GET', headers: { 'x-simkoll-code': code }, query: { planning: 'true' } }, response)
    assert.equal(response.code, 200); assert.equal(response.data.plans.length, 507); assert.equal(response.data.workouts.length, 507)
    assert.equal(writes.length, 0)
    assert.ok(reads.some(read => read.table === 'training_plans' && read.offset === 500))
    assert.ok(reads.some(read => read.table === 'daily_workouts' && read.offset === 500))
  } finally { globalThis.fetch = original }
})
