import assert from 'node:assert/strict'
import test from 'node:test'
import { BOB_SCORE_BASE } from '../src/bobsled-engine.js'

process.env.SUPABASE_URL = 'https://bob-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'bob-swimmer'
const { default: handler } = await import('../api/points.js')

test('bobsläde keeps the fastest time across weeks and leaves level points alone', async t => {
  let best = BOB_SCORE_BASE - 24500
  const writes = []
  t.mock.method(globalThis, 'fetch', async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    const reply = rows => new Response(JSON.stringify(rows))
    if (table === 'profile_sessions') return reply([{ profile_id: 'bob-profile' }])
    if (table === 'profiles') return reply([{ id: 'bob-profile' }])
    assert.equal(table, 'game_scores')
    if (options.method === 'POST') {
      const insert = JSON.parse(options.body)
      assert.equal(insert.profile_id, 'bob-profile')
      assert.equal(insert.game_key, 'bobsled')
      assert.match(options.headers.Prefer, /ignore-duplicates/)
      writes.push(options.method)
      return reply([])
    }
    assert.equal(url.searchParams.get('game_key'), 'eq.bobsled')
    if (options.method === 'PATCH') {
      const { score } = JSON.parse(options.body)
      assert.equal(url.searchParams.get('score'), `lt.${score}`)
      best = Math.max(best, score)
      writes.push(options.method)
      return reply([])
    }
    assert.equal(url.searchParams.get('week_start'), null)
    return reply([{ game_key: 'bobsled', profile_id: 'bob-profile', score: best, created_at: '2026-11-20' }])
  })
  async function call(time) {
    const body = time == null ? undefined : { action: 'submit-game-score', gameKey: 'bobsled', score: BOB_SCORE_BASE - time, profileId: 'other' }
    const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data } }
    await handler({ method: body ? 'POST' : 'GET', query: { game: 'bobsled', lifetime: 'true' },
      headers: { 'x-simkoll-code': 'bob-swimmer', cookie: 'simkoll_session=fixture' }, body }, response)
    return response
  }
  assert.equal((await call(12000)).code, 400)
  assert.deepEqual(writes, [])
  assert.equal((await call(26500)).data.ownBest, BOB_SCORE_BASE - 24500)
  assert.equal((await call(23200)).data.ownBest, BOB_SCORE_BASE - 23200)
  assert.deepEqual((await call()).data.leaderboard.map(row => row.displayTime), ['23,200 s'])
  assert.deepEqual(writes, ['POST', 'PATCH', 'POST', 'PATCH'])
})
