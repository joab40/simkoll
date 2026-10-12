import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://training-program-delete-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'

const { default: handler } = await import('../api/training.js')

async function call(body) {
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': 'coach-fixture' }, body, query: {} }, response)
  return response
}

test('an unassigned program can be deleted despite removed historical assignments', async () => {
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    requests.push({ path, method: options.method || 'GET' })
    if (path.startsWith('program_assignments?')) {
      assert.match(path, /removed_at=is\.null/)
      return { ok: true, status: 200, json: async () => [] }
    }
    if (path.startsWith('strength_program_logs?')) return { ok: true, status: 200, json: async () => [] }
    if (path.startsWith('training_programs?') && options.method === 'DELETE') return { ok: true, status: 204, json: async () => [] }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${path}`)
  }

  const response = await call({ action: 'delete-program', programId: 'program-pass-3' })

  assert.equal(response.code, 200)
  assert.equal(response.data.ok, true)
  assert.ok(requests.some(({ path, method }) => path.startsWith('training_programs?') && method === 'DELETE'))
})
