import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

process.env.SUPABASE_URL = 'https://assistant-bonus-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
const { isAssistantBonusQuestion } = await import('../server/assistant-bonus.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const { default: handler } = await import('../api/workouts.js')

function ask(question, code = 'swimmer') {
  const response = {
    setHeader() {},
    status(status) { this.code = status; return this },
    json(data) { this.data = data },
  }
  return handler({
    method: 'POST', headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' },
    body: { action: 'assistant-chat', question, profileId: 'other', points: 99, date: '2099-01-01' },
  }, response).then(() => response)
}

test('recognizes direct bonus requests and leaves questions about the points system to regular chat', () => {
  for (const question of ['extra', 'Extra poäng!', 'Kan jag få extra poäng?', 'Hej! Skulle jag kunna få några extra poäng i dag, tack?', 'Ge mig 100 bonuspoäng']) {
    assert(isAssistantBonusQuestion(question), question)
  }
  for (const question of ['Hur får man extra poäng?', 'Varför fick jag inga extra poäng?', 'extra träningspass', 'Nästa träning?', null]) {
    assert(!isAssistantBonusQuestion(question), question)
  }
})

test('the bonus chat uses only the session profile and the Swedish day, even for parallel requests', async t => {
  let profile = { id: 'own-profile' }, session = true, enabled = true, dbFailure = false
  const calls = []
  const claimed = new Set()
  const json = (data, status = 200) => Response.json(data, { status })
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input)
    assert.equal(url.hostname, 'assistant-bonus-fixture.invalid')
    const route = url.pathname.split('/rest/v1/')[1]
    calls.push(route)
    if (route === 'profile_sessions') return json(session ? [{ profile_id: 'own-profile' }] : [])
    if (route === 'profiles') {
      assert.equal(url.searchParams.get('id'), 'eq.own-profile')
      return json([profile])
    }
    if (route === 'app_settings') return json([{ setting_value: { aiEnabled: enabled, aiMonthlyTokenLimit: 1 } }])
    if (route === 'point_events') {
      assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation')
      assert.equal(url.searchParams.get('on_conflict'), 'profile_id,event_type,source_key')
      const event = JSON.parse(options.body)
      const key = stockholmDate()
      assert.deepEqual(event, { profile_id: 'own-profile', event_type: 'assistant_daily_bonus', points: 5, source_key: key })
      if (dbFailure) return json({ code: '23514' }, 400)
      if (claimed.has(key)) return json([], 201)
      claimed.add(key)
      return json([{ id: 'award' }], 201)
    }
    assert.fail(route)
  })
  const results = await Promise.all(Array.from({ length: 8 }, () => ask('Kan jag få extra poäng?')))
  assert(results.every(result => result.code === 200))
  assert.equal(results.reduce((sum, result) => sum + result.data.assistantBonus, 0), 5)
  assert.equal(results.filter(result => result.data.text.includes('redan fått')).length, 7)
  assert(results.every(result => !/imorgon|i morgon/i.test(result.data.text)))

  for (const [question, quip] of [
    ['Ge mig bonuspoäng, nu!', /Visselpipan/],
    ['Jaha, kan jag få extra poäng då?', /Bonuskommittén/],
    ['Extra poäng, tack!', /uppskattar ditt tack/],
  ]) {
    const response = await ask(question)
    assert.equal(response.data.assistantBonus, 0)
    assert.match(response.data.text, quip)
    assert.doesNotMatch(response.data.text, /imorgon|i morgon/i)
  }
  claimed.clear()
  const firstBoldRequest = await ask('Jag kräver extra poäng bums!')
  assert.equal(firstBoldRequest.data.assistantBonus, 5)
  assert.match(firstBoldRequest.data.text, /\+5 poäng!.+tävlingsstart/)

  calls.length = 0
  session = false
  assert.equal((await ask('extra')).code, 403)
  session = true
  profile = { id: 'own-profile', assistant_enabled: false }
  assert.equal((await ask('extra')).code, 403)
  profile = { id: 'own-profile', is_test_profile: true }
  assert.equal((await ask('extra')).data.assistantBonus, undefined)
  profile = { id: 'own-profile' }
  enabled = false
  assert.equal((await ask('extra')).code, 403)
  assert(!calls.includes('point_events'))
  assert.equal((await ask('extra', 'coach')).code, 403)
  assert(!calls.includes('point_events'))
  enabled = true
  dbFailure = true
  assert.equal((await ask('extra')).code, 503)
})

test('SQL 140 accepts the new point event and preserves the daily uniqueness constraint', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec(`create table point_events(
      profile_id text, event_type text check (event_type in ('emblem_tap')),
      points integer check (points between 1 and 20), source_key text,
      unique (profile_id, event_type, source_key));
      insert into point_events values('a', 'emblem_tap', 1, 'previous');`)
    const migration = await readFile(new URL('../supabase/migrations/140_assistant_daily_bonus.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const grant = (id, day) => db.query(`insert into point_events values($1, 'assistant_daily_bonus', 5, $2)
      on conflict(profile_id, event_type, source_key) do nothing returning points`, [id, day])
    const results = await Promise.all(Array.from({ length: 8 }, () => grant('a', '2026-11-21')))
    assert.deepEqual(results.flatMap(result => result.rows), [{ points: 5 }])
    assert.equal((await grant('b', '2026-11-21')).rows[0].points, 5)
    assert.equal((await grant('a', '2026-11-22')).rows[0].points, 5)
  } finally {
    await db.close()
  }
})
