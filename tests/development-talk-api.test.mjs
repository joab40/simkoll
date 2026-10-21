import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://development-talk-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'

const { default: handler } = await import('../api/goals.js')

async function call(body, { swimmer = false, method = 'POST', query = {} } = {}) {
  const response = {
    setHeader() {},
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this },
  }
  await handler({ method, headers: { 'x-simkoll-code': swimmer ? '' : 'coach-fixture', ...(swimmer ? { cookie: 'simkoll_session=test-token' } : {}) }, body, query }, response)
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

const talkId = '11111111-1111-4111-8111-111111111111'
const swimmerId = '22222222-2222-4222-8222-222222222222'
function fixture(status = 'prepared', swimmerAnswers = { goals: 'Mitt eget svar' }) {
  let row = { id: talkId, swimmer_id: swimmerId, meeting_date: '2026-10-20', updated_at: '2026-10-20T08:00:00Z', enabled: true, status, swimmer_answers: swimmerAnswers, coach_notes: { summary: 'Privat' }, agreement: { summary: 'Gemensamt' } }
  const writes = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    const reply = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' })
    if (path.startsWith('profile_sessions?')) return reply([{ profile_id: swimmerId }])
    if (path.startsWith('profiles?')) return reply([{ id: swimmerId, active: true, approval_status: 'approved' }])
    if (path.startsWith('app_settings?')) return reply([{ setting_value: { enabled: true } }])
    if (path.startsWith('audit_logs')) return reply([])
    assert.ok(path.startsWith('development_talks?'), path)
    if (options.method === 'PATCH') { const body = JSON.parse(options.body); writes.push(body); if (path.includes('updated_at=eq.') && !path.includes(encodeURIComponent(row.updated_at))) return reply([]); row = { ...row, ...body } }
    return reply([row])
  }
  return writes
}

test('saving coach notes preserves readiness and swimmer answers', async () => {
  const writes = fixture()
  const response = await call({ action: 'update-talk', id: talkId, profileId: swimmerId, coachNotes: { summary: 'Nytt' } })
  assert.equal(response.code, 200)
  assert.equal(response.data.talk.status, 'prepared')
  assert.equal(response.data.talk.swimmerAnswers.goals, 'Mitt eget svar')
  assert.equal(response.data.talk.coachNotes.summary, 'Nytt')
  assert.equal(Object.hasOwn(writes[0], 'swimmer_answers'), false)
  assert.equal(Object.hasOwn(writes[0], 'swimmer_id'), false)
})

test('coach may correct existing swimmer answers with a version check', async () => {
  const writes = fixture()
  const response = await call({ action: 'update-talk', id: talkId, profileId: swimmerId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { goals: 'Rättat tillsammans' } })
  assert.equal(response.code, 200)
  assert.equal(response.data.talk.swimmerAnswers.goals, 'Rättat tillsammans')
  assert.equal(writes[0].swimmer_answers.goals, 'Rättat tillsammans')
})

test('coach can fill an unanswered form question while preserving earlier answers and metadata', async () => {
  const previous = { goals: 'Äldre svar', teknik: 'Bättre vändningar', __step: 5 }
  const writes = fixture('prepared', previous)
  const response = await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { ...previous, stod: 'Följa upp vändningarna tillsammans' } })
  assert.equal(response.code, 200)
  assert.equal(response.data.talk.swimmerAnswers.stod, 'Följa upp vändningarna tillsammans')
  assert.equal(response.data.talk.swimmerAnswers.__step, 5)
  assert.equal(writes[0].swimmer_answers.goals, 'Äldre svar')
  assert.equal(response.data.talk.status, 'prepared')
})

test('empty preparations can be filled in together, but internal metadata cannot be invented', async () => {
  const writes = fixture('draft', {})
  const invalid = await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { simPass: '6', __step: 4 } })
  assert.equal(invalid.code, 400)
  assert.equal(writes.length, 0)
  const result = await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { simPass: '6' } })
  assert.equal(result.code, 200)
  assert.equal(result.data.talk.swimmerAnswers.simPass, '6')
})

test('coach cannot overwrite newer or completed swimmer answers', async () => {
  const writes = fixture()
  assert.equal((await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-19T08:00:00Z', swimmerAnswers: { goals: 'Föråldrat' } })).code, 409)
  assert.equal((await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { unrelated: 'Nytt svar' } })).code, 400)
  assert.equal(writes.length, 0)
  fixture('completed')
  assert.equal((await call({ action: 'update-talk', id: talkId, expectedUpdatedAt: '2026-10-20T08:00:00Z', swimmerAnswers: { goals: 'Sent' } })).code, 403)
})

test('completion is explicit and invalid updates do not write', async () => {
  const writes = fixture()
  for (const extra of [{ status: 'invalid' }, { meetingDate: '2026-02-30' }, { profileId: 'another-swimmer' }, { followUpDate: '2026-10-19' }]) {
    assert.equal((await call({ action: 'update-talk', id: talkId, ...extra })).code, 400)
  }
  assert.equal(writes.length, 0)
  const response = await call({ action: 'update-talk', id: talkId, status: 'completed' })
  assert.equal(response.code, 200)
  assert.equal(response.data.talk.status, 'completed')
})

test('swimmer cannot reopen a completed conversation', async () => {
  const writes = fixture('completed')
  assert.equal((await call({ action: 'save-talk', id: talkId, status: 'draft' }, { swimmer: true })).code, 403)
  assert.equal(writes.length, 0)
})

test('swimmer cannot overwrite answers changed during the meeting', async () => {
  const writes = fixture()
  const response = await call({ action: 'save-talk', id: talkId, expectedUpdatedAt: '2026-10-19T08:00:00Z', swimmerAnswers: { goals: 'Äldre version' } }, { swimmer: true })
  assert.equal(response.code, 409)
  assert.equal(writes.length, 0)
})

test('private coach notes are excluded from swimmer reads and save responses', async () => {
  fixture()
  const read = await call(null, { swimmer: true, method: 'GET', query: { talks: 'true' } })
  assert.equal(read.code, 200)
  assert.equal(Object.hasOwn(read.data.talks[0], 'coachNotes'), false)
  assert.equal(read.data.talks[0].agreement.summary, 'Gemensamt')
  const save = await call({ action: 'save-talk', id: talkId, status: 'prepared', swimmerAnswers: { goals: 'Uppdaterat' } }, { swimmer: true })
  assert.equal(save.code, 200)
  assert.equal(Object.hasOwn(save.data.talk, 'coachNotes'), false)
  const coach = await call(null, { method: 'GET', query: { talks: 'true' } })
  assert.equal(coach.data.talks[0].coachNotes.summary, 'Privat')
})
