import test from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE_MAX_SCORE } from '../src/balance-engine.js'
process.env.SUPABASE_URL = 'https://balance-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'balance-fixture'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'
const { default: handler } = await import('../api/points.js')
const row = { score: 420, profile_id: 'rider', game_key: 'balance', created_at: '2026-10-24T12:00:00Z', profiles: { display_name: 'Testcyklist', emoji: '🚲' } }

async function call(body, query = {}, code = 'balance-fixture') {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: body ? 'POST' : 'GET', headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, body, query }, response)
  return response
}
function db({ existing = [], session = true, schedule, scores = [row] } = {}) {
  const writes = [], reads = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/rest/v1/')[1]
    let data = []
    if (options.method) writes.push({ path, method: options.method, body: JSON.parse(options.body || '{}') })
    else {
      reads.push(path)
      if (path.startsWith('profile_sessions?')) data = session ? [{ profile_id: 'rider' }] : []
      else if (path.startsWith('profiles?')) data = [{ id: 'rider' }]
      else if (path.startsWith('app_settings?') && schedule) data = [{ setting_value: { schedule } }]
      else if (path.includes('select=id,score')) data = existing
      else if (path.includes('select=profile_id&limit')) data = [{ profile_id: 'rider' }]
      else if (path.startsWith('game_scores?')) data = scores
    }
    return { ok: true, json: async () => data }
  }
  return { writes, reads }
}

test('balance results are stored under their own key and authenticated profile, with a weekly board', async () => {
  const { writes, reads } = db()
  const response = await call({ action: 'submit-game-score', gameKey: 'balance', score: 420, profileId: 'someone-else' })
  assert.equal(response.code, 200)
  const insert = writes.find((item) => item.path === 'game_scores').body
  assert.equal(insert.profile_id, 'rider')
  assert.equal(insert.game_key, 'balance')
  assert.equal(insert.score, 420)
  assert.ok(response.data.weekStart)
  assert.equal(response.data.leaderboard[0].displayName, 'Testcyklist')
  assert.ok(reads.some((path) => path.includes('game_key=eq.balance&week_start=')))
})

test('only a better result updates the personal weekly record', async () => {
  let fixture = db({ existing: [{ id: 'personal-record', score: 500 }] })
  await call({ action: 'submit-game-score', gameKey: 'balance', score: 420 })
  assert.ok(fixture.writes.every((item) => !item.path.startsWith('game_scores')))
  fixture = db({ existing: [{ id: 'personal-record', score: 500 }] })
  await call({ action: 'submit-game-score', gameKey: 'balance', score: 600 })
  const update = fixture.writes.find((item) => item.path.startsWith('game_scores'))
  assert.equal(update.path, 'game_scores?id=eq.personal-record')
  assert.equal(update.method, 'PATCH')
  assert.equal(update.body.score, 600)
})

test('higher scores from the faster course can be saved above the old ceiling', async () => {
  const { writes } = db()
  const response = await call({ action: 'submit-game-score', gameKey: 'balance', score: 14500 })
  assert.equal(response.code, 200)
  assert.equal(writes.find((item) => item.path === 'game_scores').body.score, 14500)
})

test('impossible scores and unauthenticated submissions cannot write or award points', async () => {
  let fixture = db()
  for (const score of [0, -1, BALANCE_MAX_SCORE + 1, 2.5]) assert.equal((await call({ action: 'submit-game-score', gameKey: 'balance', score })).code, 400)
  assert.equal(fixture.writes.length, 0)
  fixture = db({ session: false })
  assert.equal((await call({ action: 'submit-game-score', gameKey: 'balance', score: 400 })).code, 403)
  assert.equal(fixture.writes.length, 0)
  fixture = db()
  assert.notEqual((await call({ action: 'submit-game-score', gameKey: 'balance', score: 400 }, {}, 'coach-fixture')).code, 200)
  assert.equal(fixture.writes.length, 0)
})

test('weekly, lifetime and combined record lists include balance without using another game key', async () => {
  for (const query of [{ game: 'balance' }, { game: 'balance', lifetime: 'true' }, { game: 'alltime' }]) {
    const { reads } = db()
    const response = await call(null, query)
    assert.equal(response.code, 200)
    assert.equal(response.data.leaderboard[0].displayName, 'Testcyklist')
    assert.ok(reads.some((path) => path.includes(query.game === 'alltime' ? 'dino,balance)' : 'game_key=eq.balance')))
  }
})

test('coaches can find balance in the library without accidental publication', async () => {
  db()
  const response = await call(null, { games: 'true' }, 'coach-fixture')
  assert.ok(response.data.catalog.some((item) => item.key === 'balance' && item.route === 'balance'))
  assert.ok(response.data.schedule.every((item) => item.gameKey !== 'balance'))
})

test('combined leaderboard ignores impossible historical balance scores', async () => {
  const { reads } = db({ scores: [
    { ...row, score: 99000, profile_id: 'impossible', profiles: { display_name: 'Invalid' } },
    row,
  ] })
  const response = await call(null, { game: 'alltime' })
  assert.equal(response.data.leaderboard.length, 1)
  assert.equal(response.data.leaderboard[0].displayName, 'Testcyklist')
  assert.equal(response.data.leaderboard[0].score, 10)
  assert.ok(reads.some((path) => path.includes('dino,balance)')))
  const lifetime = db()
  await call(null, { game: 'balance', lifetime: 'true' })
  assert.ok(lifetime.reads.some((path) => path.includes(`game_key=eq.balance&score=gt.0&score=lte.${BALANCE_MAX_SCORE}`)))
})

test('schedule only exposes the game during or after its published period', async () => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
  for (const [startDate, endDate, published, visible] of [
    ['2999-10-26', '2999-11-01', true, false],
    [today, today, false, false],
    [today, today, true, true],
    ['2000-10-26', '2000-11-01', true, 'archive'],
  ]) {
    db({ schedule: [{ id: 'balance-test', gameKey: 'balance', startDate, endDate, published }] })
    const response = await call(null, { games: 'true' })
    assert.equal(response.data.catalog.some((item) => item.key === 'balance'), visible === true)
    assert.equal(response.data.previousGames.some((item) => item.key === 'balance'), visible === 'archive')
  }
})
