import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { defaultFlightWeights, flightLine, flightTimeLifts, validateFlightWeights } from '../shared/flight-line.js'

const asOf = '2026-11-21'
const days = Array.from({ length: 35 }, (_, index) => ({
  date: coachWeekAddDays(asOf, index - 34),
  speedFeeling: index < 28 ? 3 : 4,
  body: index < 28 ? 3 : 2,
}))
const weights = { ...defaultFlightWeights, speedFeeling: 4, body: 1, energy: 0, sleepQuality: 0, times: 0 }
const latest = (history, overrides, lifts = []) => flightLine(history.slice(-1), history.slice(0, -1), lifts, { ...weights, ...overrides })[0]

test('priorities change the combined line in the expected direction', () => {
  assert.equal(latest(days).value, 57.5)
  assert.equal(latest(days, { speedFeeling: 1, body: 4 }).value, 42.5)
  assert.equal(latest(days, { body: 0 }).value, 62.5)
  assert.equal(latest(days, { body: 0, speedFeeling: 0 }).value, null)
})

test('the selected period stays honest about missing and insufficient readings', () => {
  assert.equal(latest(days, { body: 1, energy: 5, sleepQuality: 5 }).value, null)
  const sparse = days.map((row, index) => index >= 28 && index < 34 ? { ...row, speedFeeling: null, body: null } : row)
  assert.equal(latest(sparse).value, null)
  const partial = latest(days, { energy: 1 })
  assert.equal(partial.value, 57.5)
  assert.equal(partial.usedWeight, 5)
  assert.equal(partial.totalWeight, 6)
  assert.equal(partial.components.find(item => item.key === 'energy').score, null)
})

test('time lift uses earlier comparable days, at most one event per day', () => {
  const point = (offset, centis) => ({ date: coachWeekAddDays(asOf, offset), centis })
  const fast = [point(-21, 6300), point(-17, 6200), point(-13, 6235), point(0, 6147)]
  const result = flightTimeLifts([
    { label: '100 m frisim', points: fast },
    { label: '50 m fjäril', points: [point(-22, 3045), point(-12, 3030), point(-2, 3020), point(0, 3010)] },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].label, '100 m frisim')
  assert.equal(result[0].reference, 6235)
  assert.equal(result[0].priorDays, 3)
  assert(result[0].strength > 2.8 && result[0].strength < 2.9)
  assert.deepEqual(flightTimeLifts([{ label: '100 m frisim', points: fast.slice(1) }]), [])
  assert.deepEqual(flightTimeLifts([{ label: '100 m frisim', points: [...fast.slice(0, 3), point(0, 6400)] }]), [])
  assert.deepEqual(flightTimeLifts([{ label: '100 m frisim', points: [point(-60, 6300), ...fast.slice(1)] }]), [])
})

test('time lift respects priority, decays, expires after a week and caps repeated fast times', () => {
  const lift = (age) => ({ date: coachWeekAddDays(asOf, -age), strength: 5 })
  assert.equal(latest(days, { times: 0 }, [lift(0)]).timeLift, 0)
  assert.equal(latest(days, { times: 3 }, [lift(0)]).timeLift, 3)
  assert.equal(latest(days, { times: 5 }, [lift(0)]).timeLift, 5)
  assert(latest(days, { times: 5 }, [lift(4)]).timeLift < 3)
  assert.equal(latest(days, { times: 5 }, [lift(7)]).timeLift, 0)
  assert.equal(latest(days, { times: 5 }, [lift(0), lift(1), lift(2)]).timeLift, 5)
})

test('priority validation accepts only the defined keys and integer weights', () => {
  assert.deepEqual(validateFlightWeights(weights), weights)
  for (const invalid of [null, { ...weights, invented: 4 }, { ...weights, energy: '4' }, { ...weights, times: 6 }, { ...weights, times: 1.5 }]) {
    assert.throws(() => validateFlightWeights(invalid), /vikt/)
  }
})

test('SQL 135 stores valid weights and rejects malformed preferences', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id integer primary key); insert into profiles values (1);')
    const sql = await readFile(new URL('../supabase/migrations/135_flight_record_weights.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const update = (value) => db.query('update profiles set flight_record_weights=$1::jsonb', [JSON.stringify(value)])
    await update(weights)
    assert.deepEqual((await db.query('select flight_record_weights from profiles')).rows[0].flight_record_weights, weights)
    for (const invalid of [[5], { ...weights, times: 7 }, { ...weights, times: 2.5 }, { ...weights, times: '4' }, { ...weights, times: [4] }, { ...weights, another: 2 }, {}]) {
      await assert.rejects(update(invalid), /profiles_flight_record_weights_check/)
    }
  } finally { await db.close() }
})
