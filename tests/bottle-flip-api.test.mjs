import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOTTLE_MAX_SCORE } from '../src/bottle-flip-engine.js'
process.env.SUPABASE_URL = 'https://bottle-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'bottle-swimmer'
process.env.SIMKOLL_COACH_CODE = 'bottle-coach'
const { default: handler } = await import('../api/points.js')
const row = { profile_id: 'flipper', game_key: 'bottleflip', score: 135, created_at: '2026-11-14T12:00:00Z', profiles: { display_name: 'Fiktiv spelare', emoji: '🏊' } }
async function call(body, query = {}, code = 'bottle-swimmer') {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: body ? 'POST' : 'GET', headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' }, body, query }, response)
  return response
}
function fixture({ existing = [], rows = [row], session = true, schedule } = {}) {
  const reads = [], writes = []
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw); assert.equal(url.hostname, 'bottle-fixture.invalid')
    const path = String(raw).split('/rest/v1/')[1]; let data = []
    if (options.method) writes.push({ path, method: options.method, body: JSON.parse(options.body || '{}') })
    else {
      reads.push(path)
      if (path.startsWith('profile_sessions?')) data = session ? [{ profile_id: 'flipper' }] : []
      else if (path.startsWith('profiles?')) data = [{ id: 'flipper' }]
      else if (path.startsWith('app_settings?') && schedule) data = [{ setting_value: { schedule } }]
      else if (path.includes('select=id,score')) data = existing
      else if (path.includes('select=profile_id&limit')) data = [{ profile_id: 'flipper' }]
      else if (path.startsWith('game_scores?')) data = rows
    }
    return { ok: true, json: async () => data }
  }
  return { reads, writes }
}

test('Bottle Flip saves to its own key and sessions owner, returns lifetime leaderboard and only improves weekly best', async () => {
  let db = fixture()
  const response = await call({ action: 'submit-game-score', gameKey: 'bottleflip', score: 135, profileId: 'another-profile' })
  assert.equal(response.code, 200)
  const insert = db.writes.find(write => write.path === 'game_scores').body
  assert.equal(insert.profile_id, 'flipper'); assert.equal(insert.game_key, 'bottleflip'); assert.equal(insert.score, 135)
  assert.equal(response.data.ownBest, 135)
  assert.ok(db.reads.some(path => path.includes(`game_key=eq.bottleflip&score=gt.0&score=lte.${BOTTLE_MAX_SCORE}`)))
  db = fixture({ existing: [{ id: 'old', score: 150 }] })
  await call({ action: 'submit-game-score', gameKey: 'bottleflip', score: 135 })
  assert.ok(db.writes.every(write => !write.path.startsWith('game_scores')))
  db = fixture({ existing: [{ id: 'old', score: 100 }] })
  await call({ action: 'submit-game-score', gameKey: 'bottleflip', score: 135 })
  assert.equal(db.writes.find(write => write.path === 'game_scores?id=eq.old').body.score, 135)
})

test('impossible scores and missing sessions never save or award points; coach preview cannot submit', async () => {
  let db = fixture()
  for (const score of [0, -1, BOTTLE_MAX_SCORE + 1, 1.5]) assert.equal((await call({ action: 'submit-game-score', gameKey: 'bottleflip', score })).code, 400)
  assert.equal(db.writes.length, 0)
  db = fixture({ session: false })
  assert.equal((await call({ action: 'submit-game-score', gameKey: 'bottleflip', score: 15 })).code, 403)
  assert.equal(db.writes.length, 0)
  db = fixture()
  assert.notEqual((await call({ action: 'submit-game-score', gameKey: 'bottleflip', score: 15 }, {}, 'bottle-coach')).code, 200)
  assert.equal(db.writes.length, 0)
})

test('library includes Bottle Flip without automatically publishing or writing a schedule', async () => {
  const db = fixture(), response = await call(null, { games: 'true' }, 'bottle-coach')
  assert.equal(response.code, 200)
  assert.ok(response.data.catalog.some(game => game.key === 'bottleflip' && game.route === 'bottleflip'))
  assert.ok(response.data.schedule.every(period => period.gameKey !== 'bottleflip'))
  assert.equal(db.writes.length, 0)
})

test('published current, archived, unpublished and future periods use existing scheduling rules', async () => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
  for (const [startDate, endDate, published, current, previous] of [[today, today, true, true, false], [today, today, false, false, false], ['2999-01-01', '2999-01-07', true, false, false], ['2000-01-01', '2000-01-07', true, false, true]]) {
    const db = fixture({ schedule: [{ id: 'fixture', gameKey: 'bottleflip', startDate, endDate, published }] }), response = await call(null, { games: 'true' })
    assert.equal(response.data.catalog.some(game => game.key === 'bottleflip'), current)
    assert.equal(response.data.previousGames.some(game => game.key === 'bottleflip'), previous)
    assert.equal(db.writes.length, 0)
  }
})

test('lifetime and combined standings include Bottle Flip but filter impossible historical scores', async () => {
  for (const query of [{ game: 'bottleflip', lifetime: 'true' }, { game: 'alltime' }]) {
    const db = fixture({ rows: [{ ...row, profile_id: 'invalid', score: BOTTLE_MAX_SCORE + 1 }, row] }), response = await call(null, query)
    assert.equal(response.code, 200); assert.equal(response.data.leaderboard.length, 1)
    assert.equal(response.data.leaderboard[0].displayName, 'Fiktiv spelare')
    assert.ok(db.reads.some(path => path.startsWith('game_scores?') && path.includes('bottleflip')))
  }
})

test('swimmer reset is scoped to their own Bottle Flip records', async () => {
  const db = fixture(), response = await call({ action: 'reset-game-score', gameKey: 'bottleflip', profileId: 'other' })
  assert.equal(response.code, 200)
  assert.equal(db.writes.find(write => write.method === 'DELETE').path, 'game_scores?profile_id=eq.flipper&game_key=eq.bottleflip')
})

test('lazy game is wired to library, swimmer home, archive and beta with a non-persisting preview', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8'), game = readFileSync(new URL('../src/bottle-flip-game.jsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/bottle-flip-game.css', import.meta.url), 'utf8')
  assert.match(main, /deferredPanel\(\(\) => import\('\.\/bottle-flip-game.jsx'\)/)
  assert.match(main, /screen === 'bottleflip'/)
  assert.match(main, /bottleflip: \(\) => onOpen\('bottleflip'\)/)
  assert.match(main, /bottleflip: BottleFlipGame/)
  assert.match(main, /<BottleFlipGame code=\{code\} onBack=\{\(\) => setTesting\(''\)\} preview request=\{apiRequest\}/)
  assert.match(game, /if \(preview\) return/); assert.match(game, /if \(preview \|\| !pending.current/)
  assert.match(game, /onPointerCancel=\{pointerCancel\}/); assert.match(game, /onLostPointerCapture=\{pointerCancel\}/)
  assert.match(game, /visibilitychange/); assert.match(game, /window.addEventListener\('blur', pause\)/)
  assert.match(game, /Försök spara igen/); assert.match(game, /cancelAnimationFrame/)
  assert.match(css, /touch-action: none/); assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(game, /360playzone|<iframe|localStorage|setInterval/)
})
