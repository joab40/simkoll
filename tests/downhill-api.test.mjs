import assert from 'node:assert/strict'
import test from 'node:test'
import { DOWNHILL_COURSE, DOWNHILL_SCORE_BASE } from '../src/downhill-engine.js'

process.env.SUPABASE_URL = 'https://ski-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'ski-swimmer'
const { default: handler } = await import('../api/points.js')

test('downhill ranks times across weeks for each course without overwriting old records or granting app points', async () => {
  const previousKey = 'downhill', newKey = `downhill-${DOWNHILL_COURSE}`
  const records = new Map([[previousKey, DOWNHILL_SCORE_BASE - 31500], [newKey, DOWNHILL_SCORE_BASE - 41500]])
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
        assert.equal(payload.game_key, newKey)
        assert.match(options.headers.Prefer, /ignore-duplicates/)
      } else {
        assert.equal(url.searchParams.get('score'), `lt.${payload.score}`)
        assert.equal(url.searchParams.get('game_key'), `eq.${newKey}`)
        records.set(newKey, Math.max(records.get(newKey), payload.score))
      }
      return reply([])
    }
    assert.equal(url.searchParams.get('week_start'), null)
    const key = url.searchParams.get('game_key').slice(3)
    assert(records.has(key))
    const row = { game_key: key, profile_id: 'ski-profile', score: records.get(key), created_at: '2026-11-20' }
    return reply([{ ...row, profile_id: 'bad', score: DOWNHILL_SCORE_BASE - 1000 }, row])
  }
  async function call(score, course = DOWNHILL_COURSE) {
    const body = score === undefined ? undefined : { action: 'submit-game-score', gameKey: 'downhill', score, course, profileId: 'other' }
    const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data } }
    await handler({ method: body ? 'POST' : 'GET', query: { game: 'downhill', lifetime: 'true', course: course ?? undefined },
      headers: { 'x-simkoll-code': 'ski-swimmer', cookie: 'simkoll_session=fixture' }, body }, response)
    return response
  }
  assert.equal((await call(DOWNHILL_SCORE_BASE - 31500)).code, 400)
  assert.equal((await call(DOWNHILL_SCORE_BASE - 42000, 'missing')).code, 400)
  assert.deepEqual(writes, [])
  assert.equal((await call(DOWNHILL_SCORE_BASE - 43500)).data.ownBest, DOWNHILL_SCORE_BASE - 41500)
  assert.equal((await call(DOWNHILL_SCORE_BASE - 38127)).data.ownBest, DOWNHILL_SCORE_BASE - 38127)
  const result = await call()
  assert.deepEqual(result.data.leaderboard.map(row => row.displayTime), ['0:38,127'])
  const previous = await call(undefined, null)
  assert.deepEqual(previous.data.leaderboard.map(row => row.displayTime), ['0:31,500'])
  assert.deepEqual(writes, ['POST', 'PATCH', 'POST', 'PATCH'])
})
