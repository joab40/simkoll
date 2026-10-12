import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://development-talk-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'

const { default: handler } = await import('../api/goals.js')

async function call(body) {
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': 'coach-fixture' }, body, query: {} }, response)
  return response
}

test('an inactive development talk can be switched on again', async () => {
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    requests.push({ path, options })
    if (!options.method) {
      assert.match(path, /select=status,enabled,swimmer_id/)
      return { ok: true, status: 200, json: async () => [{ status: 'prepared', enabled: false, swimmer_id: 'swimmer-a' }] }
    }
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'talk-a', swimmer_id: 'swimmer-a', meeting_date: '2026-10-13', status: 'draft', enabled: true }],
      text: async () => '',
    }
  }

  const response = await call({ action: 'toggle-talk', id: 'talk-a', enabled: true })

  assert.equal(response.code, 200)
  assert.equal(response.data.talk.enabled, true)
  assert.equal(response.data.talk.status, 'draft')
  const update = requests.find(({ options }) => options.method === 'PATCH')
  const updateBody = JSON.parse(update.options.body)
  assert.equal(updateBody.enabled, true)
  assert.equal(updateBody.status, 'draft')
  assert.match(updateBody.updated_at, /^\d{4}-\d{2}-\d{2}T/)
})
