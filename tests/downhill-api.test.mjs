import assert from 'node:assert/strict'
import test from 'node:test'
import { DOWNHILL_SCORE_BASE } from '../src/downhill-engine.js'

process.env.SUPABASE_URL = 'https://ski-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'ski-swimmer'
const { default: handler } = await import('../api/points.js')

test('downhill ranks by elapsed time plus penalties, keeps records across weeks and grants no app points', async () => {
  let best = DOWNHILL_SCORE_BASE - 39000
  const writes = []
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw)
    const path = url.pathname.split('/rest/v1/')[1]
    const reply = data => ({ ok: true, json: async () => data })
    if (path === 'profile_sessions') return reply([{ profile_id: 'ski-profile' }])
    if (path === 'profiles') return reply([{ id: 'ski-profile' }])
    assert.equal(path, 'game_scores')
    if (options.method) {
      const payload = JSON.parse(options.body)
      writes.push(options.method)
      if (options.method === 'POST') {
        assert.equal(payload.profile_id, 'ski-profile')
        assert.equal(payload.game_key, 'downhill')
        assert.match(options.headers.Prefer, /ignore-duplicates/)
      } else {
        assert.equal(url.searchParams.get('score'), `lt.${payload.score}`)
        best = Math.max(best, payload.score)
      }
      return reply([])
    }
    assert.equal(url.searchParams.get('week_start'), null)
    assert.equal(url.searchParams.get('game_key'), 'eq.downhill')
    const row = { game_key: 'downhill', profile_id: 'ski-profile', score: best, created_at: '2026-11-20' }
    return reply([{ ...row, profile_id: 'bad', score: DOWNHILL_SCORE_BASE - 1000 }, row])
  }
  async function call(score) {
    const body = score === undefined ? undefined : { action: 'submit-game-score', gameKey: 'downhill', score, profileId: 'other' }
    const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data } }
    await handler({ method: body ? 'POST' : 'GET', query: { game: 'downhill', lifetime: 'true' },
      headers: { 'x-simkoll-code': 'ski-swimmer', cookie: 'simkoll_session=fixture' }, body }, response)
    return response
  }
  assert.equal((await call(DOWNHILL_SCORE_BASE - 1000)).code, 400)
  assert.deepEqual(writes, [])
  assert.equal((await call(DOWNHILL_SCORE_BASE - 43500)).data.ownBest, DOWNHILL_SCORE_BASE - 39000)
  assert.equal((await call(DOWNHILL_SCORE_BASE - 35127)).data.ownBest, DOWNHILL_SCORE_BASE - 35127)
  const result = await call()
  assert.deepEqual(result.data.leaderboard.map(row => row.displayTime), ['0:35,127'])
  assert.deepEqual(writes, ['POST', 'PATCH', 'POST', 'PATCH'])
})
