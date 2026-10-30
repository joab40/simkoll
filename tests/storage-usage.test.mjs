import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStorageBudget, storageBudgetInput, storageBudgetState, storageBytes } from '../shared/storage-usage.js'
import { validStorageBudget, handleStorageAdmin } from '../server/storage-admin.js'
import { storageMutationEvent, recordStorageEvent } from '../server/storage-events.js'
import { createCoachToken } from '../server/coach-auth.js'

const adminId = '11111111-1111-4111-8111-111111111111'
const token = (role = 'superadmin') => createCoachToken({ id: adminId, role })
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
async function call({ method = 'GET', code = token(), body = {}, db = async () => json([{ role: 'superadmin', status: 'active' }]) } = {}) {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handleStorageAdmin({ method, headers: { 'x-simkoll-code': code }, body }, response, db)
  return response
}
test('decimal GB budgets support Swedish input, empty unknown limits and safe boundaries', () => {
  assert.equal(parseStorageBudget(''), null); assert.equal(parseStorageBudget('0,5'), 500000000)
  assert.equal(parseStorageBudget('12.125'), 12125000000)
  assert.equal(parseStorageBudget('1000000'), 1000000000000000)
  assert.equal(storageBudgetInput(500000000), '0.5'); assert.equal(storageBudgetInput(null), '')
  for (const input of ['0', '-1', '1e6', 'Infinity', '12 GB', '1.1234567', '1000001']) assert.throws(() => parseStorageBudget(input))
  for (const value of [undefined, '', -2, 0, 2.5, Infinity, 1000000000000001]) assert.equal(validStorageBudget(value), false)
  assert.equal(validStorageBudget(null), true)
})
test('remaining space is budget-relative, never guessed when unset or file sizes are unknown', () => {
  assert.equal(storageBudgetState(800, 1000).level, 'warning')
  assert.equal(storageBudgetState(900, 1000).level, 'danger')
  assert.equal(storageBudgetState(700, 1000).level, 'ok')
  assert.equal(storageBudgetState(1200, 1000).remaining, 0)
  assert.equal(storageBudgetState(1200, 1000).over, 200)
  assert.equal(storageBudgetState(700, null).remaining, null)
  assert.equal(storageBudgetState(700, 1000, 1).remaining, null)
  assert.equal(storageBudgetState(700, 1000, 1).level, 'unknown')
  assert.equal(storageBudgetState(NaN, 1000).level, 'unknown')
  assert.equal(storageBytes(null), 'Uppgift saknas'); assert.equal(storageBytes(0), '0 B')
  assert.match(storageBytes(1000000000), /1 GB/)
})
test('non-admin and forged sessions never query storage, including the legacy group code', async () => {
  let queries = 0
  for (const code of ['', 'legacy-code', 'swimmer', token('coach'), token('head_coach'), token().slice(0, -5) + 'false']) {
    assert.equal((await call({ code, db: async () => { queries++; throw new Error('must not query') } })).code, 403)
  }
  assert.equal(queries, 0)
})
test('an old superadmin token is denied after account deactivation or role change', async () => {
  for (const row of [{ role: 'coach', status: 'active' }, { role: 'superadmin', status: 'disabled' }, null]) {
    const queries = []
    const result = await call({ db: async (path) => { queries.push(path); return json(row ? [row] : []) } })
    assert.equal(result.code, 403); assert.equal(queries.length, 1); assert.match(queries[0], /coach_accounts\?id=eq/)
  }
})
test('GET only measures, explicit capture writes a snapshot, and reads are not cached', async () => {
  for (const method of ['GET', 'POST']) {
    const queries = [], overview = { current: { fileBytes: 200 }, settings: {}, history: [], events: [] }
    const result = await call({ method, body: { action: 'capture', profileId: 'ignored' }, db: async (path, options) => { queries.push({ path, options }); return json(path.startsWith('coach_accounts') ? [{ role: 'superadmin', status: 'active' }] : overview) } })
    assert.equal(result.code, 200); assert.equal(result.headers['Cache-Control'], 'no-store')
    assert.equal(queries[1].path, 'rpc/storage_admin_overview')
    assert.deepEqual(JSON.parse(queries[1].options.body), { p_capture: method === 'POST' })
    assert.deepEqual(result.data, overview)
  }
})
test('budget changes are validated, version-protected and limited to known fields', async () => {
  const queries = [], version = '2026-10-30T08:00:00Z'
  const result = await call({ method: 'POST', body: { action: 'save-budgets', databaseBudgetBytes: null, fileBudgetBytes: 500000000, expectedUpdatedAt: version, arbitrarySetting: 'ignored' }, db: async (path, options) => { queries.push({ path, options }); return json(path.startsWith('coach_accounts') ? [{ role: 'superadmin', status: 'active' }] : { file_budget_bytes: 500000000 }) } })
  assert.equal(result.code, 200)
  assert.deepEqual(JSON.parse(queries[1].options.body), { p_database: null, p_files: 500000000, p_expected_updated_at: version })
  const invalid = await call({ method: 'POST', body: { action: 'save-budgets', databaseBudgetBytes: -2, fileBudgetBytes: 3, expectedUpdatedAt: version } })
  assert.equal(invalid.code, 400)
  const conflict = await call({ method: 'POST', body: { action: 'save-budgets', databaseBudgetBytes: null, fileBudgetBytes: null, expectedUpdatedAt: version }, db: async (path) => path.startsWith('coach_accounts') ? json([{ role: 'superadmin', status: 'active' }]) : json({ message: 'STORAGE_BUDGET_CONFLICT' }, 400) })
  assert.equal(conflict.code, 409)
})
test('unsupported methods/actions and unavailable migrations fail without storage exposure', async () => {
  assert.equal((await call({ method: 'DELETE' })).code, 405)
  assert.equal((await call({ method: 'POST', body: { action: 'delete-files' } })).code, 400)
  const missing = await call({ db: async (path) => path.startsWith('coach_accounts') ? json([{ role: 'superadmin', status: 'active' }]) : json({ code: 'PGRST202' }, 404) })
  assert.equal(missing.code, 503); assert.match(missing.data.error, /110_storage_usage/)
  const unknown = await call({ db: async () => { throw new Error('private URL secret must not escape') } })
  assert.equal(unknown.code, 503); assert.doesNotMatch(unknown.data.error, /secret/)
})
test('storage operation logs never retain filenames, tokens, owner IDs or provider messages', async () => {
  const event = storageMutationEvent('object/goal-analysis-videos/owner/goal/private-name.mp4?token=secret', { method: 'POST', body: new Uint8Array(25) })
  assert.deepEqual(event, { action: 'upload', bucket_id: 'goal-analysis-videos', stage: 'saved', bytes: 25, object_count: 1 })
  const temporary = storageMutationEvent('object/goal-analysis-videos/owner/goal/incoming/file.mp4', { method: 'POST', body: new Uint8Array(3) })
  assert.equal(temporary.stage, 'temporary')
  const removal = storageMutationEvent('object/goal-analysis-videos', { method: 'DELETE', body: JSON.stringify({ prefixes: ['owner/goal/incoming/private.mp4'] }) })
  assert.equal(removal.object_count, 1); assert.equal(removal.stage, 'temporary')
  for (const path of ['object/sign/bucket/private?token=secret', 'object/upload/sign/bucket/private', 'object/list/bucket', 'bucket/private']) assert.equal(storageMutationEvent(path, { method: 'POST' }), null)
  const writes = []
  await recordStorageEvent(async (path, options) => { writes.push({ path, row: JSON.parse(options.body) }); return json({}) }, event, json({ privateProviderError: 'must not save' }, 500))
  assert.equal(writes[0].path, 'storage_usage_events'); assert.equal(writes[0].row.success, false)
  assert.equal(writes[0].row.http_status, 500)
  assert.doesNotMatch(JSON.stringify(writes), /owner|private-name|token|secret|privateProviderError/)
  await assert.doesNotReject(recordStorageEvent(async () => { throw new Error('offline') }, event))
})
