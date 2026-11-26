import test from 'node:test'
import assert from 'node:assert/strict'
import { diaryAddDays } from '../shared/training-diary.js'

process.env.SUPABASE_URL = 'https://diary-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
const { default: handler } = await import('../api/training.js')
const { stockholmDate } = await import('../server/profile-auth.js')

const id = '11111111-1111-4111-8111-111111111111'
const workoutId = '22222222-2222-4222-8222-222222222222'
const profile = { id, active: true, approval_status: 'approved', training_group: 'junior' }
const today = stockholmDate(), yesterday = diaryAddDays(today, -1), start = diaryAddDays(today, -89)
const entryKey = `${yesterday}:swim:afternoon_swim`

async function open(query, cookie = 'simkoll_session=fixture') {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.code = code; return this }, json(value) { this.data = value } }
  await handler({ method: 'GET', query: { diary: 'true', ...query }, headers: { 'x-simkoll-code': 'swimmer', cookie } }, response)
  return response
}

test('the 90-day diary overview keeps both periods and search data, while opening a day reads its full details', async t => {
  const calls = []
  const swim = { activity_type: 'swim', session_slot: 'afternoon_swim', profile_id: id, source: 'manual' }
  const old = diaryAddDays(start, -1)
  const rows = {
    profile_sessions: [{ profile_id: id }],
    profiles: [profile],
    personal_training_sessions: [old, yesterday, today].map(session_date => ({ ...swim, session_date })),
    responses: [{ ...swim, activity_date: yesterday, created_at: `${yesterday}T17:00:00Z`, day_type: 'after', rpe: 7, comment: 'Bra vändningar' }],
    daily_workouts: [old, yesterday, today].map(workout_date => ({ id: workoutId, workout_date, title: 'Fart', focus: 'fart', time_of_day: 'afternoon', target_groups: ['junior'], distance_meters: 4000, duration_minutes: 90, content: 'Passinstruktioner', note: 'Tränarens passnotering' })),
    strength_program_logs: [{ profile_id: id, session_date: yesterday, pass_number: 1, assignment_id: 'a', weights: { Knäböj: 45 } }],
    program_assignments: [{ id: 'a', profile_id: id, training_programs: { title: 'Styrka A', content: 'Programinstruktioner' } }],
    training_diary_reflections: [{ profile_id: id, entry_key: entryKey, activity_date: yesterday, what_worked: 'Bra kickar', next_time: 'Längre streamline' }],
  }
  t.mock.method(globalThis, 'fetch', async url => {
    const { pathname, searchParams } = new URL(url), table = pathname.split('/').at(-1)
    calls.push({ table, searchParams })
    const select = searchParams.get('select')
    const result = (rows[table] ?? []).filter(row => [...searchParams].every(([field, filter]) => {
      if (filter.startsWith('gte.')) return row[field] >= filter.slice(4)
      if (filter.startsWith('lt.')) return row[field] < filter.slice(3)
      return field !== 'profile_id' || filter === `eq.${row.profile_id}`
    })).map(row => {
      if (select === '*') return row
      if (table === 'program_assignments') return select.includes('content') ? row : { ...row, training_programs: { title: row.training_programs.title } }
      return Object.fromEntries(select.split(',').filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]))
    })
    return new Response(JSON.stringify(result))
  })

  const overview = await open({ start, end: today, view: 'overview' })
  assert.equal(overview.code, 200)
  assert.match(overview.headers['Cache-Control'], /no-store/)
  assert.equal(overview.data.current.days.length, 90)
  assert.equal(overview.data.previous.sessions, 1)
  assert.equal(overview.data.entries.find(entry => entry.key === entryKey).reflection.whatWorked, 'Bra kickar')
  assert.equal(overview.data.entries.find(entry => entry.key === entryKey).comments[0].text, 'Bra vändningar')
  assert.ok(overview.data.entries.some(entry => entry.title === 'Styrka A'))
  assert.doesNotMatch(JSON.stringify(overview.data), /Passinstruktioner|Programinstruktioner|Knäböj/)
  assert.ok(!calls.some(call => call.table === 'workout_unlocks'))
  assert.equal(calls.find(call => call.table === 'responses').searchParams.get('profile_id'), `eq.${id}`)

  const full = await open({ start, end: today })
  assert.deepEqual(overview.data.current, full.data.current)
  assert.deepEqual(overview.data.previous, full.data.previous)
  const day = await open({ start: yesterday, end: yesterday, view: 'day' })
  assert.equal(day.code, 200)
  assert.deepEqual(day.data.entries, full.data.entries.filter(entry => entry.date === yesterday))
  assert.equal(day.data.entries.find(entry => entry.key === entryKey).content, 'Passinstruktioner')
  const currentDay = await open({ start: today, end: today, view: 'day' })
  assert.equal(currentDay.data.entries[0].contentLocked, true)
  assert.equal(currentDay.data.entries[0].content, '')
  assert.equal((await open({ start, end: today, view: 'day' })).code, 400)
  assert.equal((await open({ start, end: today, view: 'overview' }, '')).code, 403)
})
