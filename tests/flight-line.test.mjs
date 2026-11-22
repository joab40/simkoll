import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { changeFlightWeight, defaultFlightWeights, flightLine, flightSignalGroups, flightTimeLifts, readFlightWeights, sleepGoalScore, validateFlightWeights } from '../shared/flight-line.js'

const asOf = '2026-11-21'
const days = Array.from({ length: 35 }, (_, index) => ({
  date: coachWeekAddDays(asOf, index - 34),
  speedFeeling: index < 28 ? 3 : 4,
  body: index < 28 ? 3 : 2,
}))
const legacyWeights = { speedFeeling: 4, body: 1, energy: 0, sleepQuality: 0, feeling: 0, motivation: 0, times: 0 }
const weights = { ...defaultFlightWeights, speedFeeling: 80, body: 20, energy: 0, sleepQuality: 0, times: 0 }
const { sleepGoal: _sleepGoal, ...percentageWeights136 } = weights
const latest = (history, overrides, lifts = []) => flightLine(history.slice(-1), history.slice(0, -1), lifts, { ...weights, ...overrides })[0]

test('priorities change the combined line in the expected direction', () => {
  assert.equal(latest(days).value, 57.5)
  assert.equal(latest(days, { speedFeeling: 20, body: 80 }).value, 42.5)
  assert.equal(latest(days, { speedFeeling: 100, body: 0 }).value, 62.5)
  assert.equal(latest(days, { body: 0, speedFeeling: 0 }).value, null)
})

test('the selected period stays honest about missing and insufficient readings', () => {
  const limited = latest(days, { speedFeeling: 25, body: 20, energy: 30, sleepQuality: 25 })
  assert.equal(limited.value, 51.4)
  assert.equal(limited.usedWeight, 45)
  assert.equal(limited.limited, true)
  const sparse = days.map((row, index) => index >= 28 && index < 34 ? { ...row, speedFeeling: null, body: null } : row)
  assert.equal(latest(sparse).value, null)
  const partial = latest(days, { speedFeeling: 64, body: 16, energy: 20 })
  assert.equal(partial.value, 57.5)
  assert.equal(partial.usedWeight, 80)
  assert.equal(partial.totalWeight, 100)
  assert.equal(partial.limited, false)
  assert.equal(partial.components.find(item => item.key === 'energy').score, null)
})

test('adding a measure with missing responses preserves values, even when coverage drops below half', () => {
  const initial = { ...weights, speedFeeling: 30, body: 22, energy: 15, feeling: 20, sleepQuality: 13 }
  const before = latest(days, initial)
  const after = latest(days, changeFlightWeight(initial, 'motivation', 17))
  assert.equal(before.usedWeight, 52)
  assert.equal(before.limited, false)
  assert.equal(after.usedWeight, 43)
  assert.equal(after.limited, true)
  assert(Math.abs(after.value - before.value) < .2)

  const oneSignal = days.map(({ body, ...row }) => row)
  assert.equal(latest(oneSignal, { speedFeeling: 30, body: 70 }).value, 62.5)
  assert.equal(latest(oneSignal, { speedFeeling: 30, body: 70 }).limited, true)
  assert.equal(latest(oneSignal, { speedFeeling: 100, body: 0 }).limited, false)
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
  assert.equal(latest(days, { times: 60 }, [lift(0)]).timeLift, 3)
  assert.equal(latest(days, { times: 100 }, [lift(0)]).timeLift, 5)
  assert(latest(days, { times: 100 }, [lift(4)]).timeLift < 3)
  assert.equal(latest(days, { times: 100 }, [lift(7)]).timeLift, 0)
  assert.equal(latest(days, { times: 100 }, [lift(0), lift(1), lift(2)]).timeLift, 5)
})

test('percentage edits preserve the chosen share and automatically adjust the other checked measures', () => {
  const selected = { ...weights, speedFeeling: 50, body: 30, passRating: 20 }
  assert.deepEqual(changeFlightWeight(selected, 'speedFeeling', 60), { ...selected, speedFeeling: 60, body: 24, passRating: 16 })
  assert.deepEqual(changeFlightWeight(selected, 'passRating', 0), { ...selected, speedFeeling: 63, body: 37, passRating: 0 })
  assert.deepEqual(changeFlightWeight(selected, 'setupRating', 20), { ...selected, speedFeeling: 40, body: 24, passRating: 16, setupRating: 20 })
  assert.deepEqual(changeFlightWeight(selected, 'speedFeeling', 100), { ...selected, speedFeeling: 98, body: 1, passRating: 1 })
  assert.deepEqual(changeFlightWeight(selected, 'times', 30), { ...selected, times: 30 })
  assert.equal(changeFlightWeight(weights, 'body', 0).speedFeeling, 100)
})

test('upgrading existing weights keeps their proportions and the existing time lift', () => {
  assert.deepEqual(readFlightWeights({ ...legacyWeights, times: 3 }), { ...weights, times: 60 })
  assert.deepEqual(readFlightWeights(weights), weights)
  assert.deepEqual(readFlightWeights(null), defaultFlightWeights)
  const neutral = Object.fromEntries(Object.keys(weights).map(key => [key, 0]))
  assert.deepEqual(changeFlightWeight(neutral, 'passRating', 20), { ...neutral, passRating: 100 })
  assert.deepEqual(changeFlightWeight({ ...neutral, passRating: 100 }, 'passRating', 0), neutral)
})

test('percentage validation requires known keys and 100% among selected base measures', () => {
  assert.deepEqual(validateFlightWeights(weights), weights)
  for (const invalid of [null, legacyWeights, { ...weights, invented: 4 }, { ...weights, energy: '4' },
    { ...weights, body: 10 }, { ...weights, times: 101 }, { ...weights, times: 1.5 }]) {
    assert.throws(() => validateFlightWeights(invalid), /procent/)
  }
})

test('sleep and custom measures use the same weighting and preserve missing observations', () => {
  assert.equal(sleepGoalScore(null, 480), null)
  assert.equal(sleepGoalScore(500, null), null)
  assert.equal(sleepGoalScore(360, 480), 4)
  assert.equal(sleepGoalScore(480, 480), 5)
  assert.equal(sleepGoalScore(600, 480), 5)
  const measure = { key: '10101010-1010-4010-8010-101010101010', label: 'Teknikkänsla', category: 'Teknik' }
  assert.deepEqual(flightSignalGroups([measure]).at(-1), { label: 'Teknik', signals: [measure] })
  const byShare = changeFlightWeight(changeFlightWeight(weights, 'sleepGoal', 15), measure.key, 40)
  assert.deepEqual(validateFlightWeights(byShare, [measure]), byShare)
  assert.throws(() => validateFlightWeights(byShare), /saknas/)
  const history = days.map((day, index) => ({
    ...day, sleepGoal: index < 28 ? 4 : 5, [measure.key]: index < 28 ? 2 : 4,
  }))
  const [point] = flightLine(history.slice(-1), history.slice(0, -1), [], byShare, [measure])
  assert.equal(point.components.find(item => item.key === measure.key).score, 75)
  assert.equal(point.components.find(item => item.key === 'sleepGoal').score, 62.5)
  assert.equal(point.totalWeight, 100)
})

test('SQL 136 accepts old and percentage weights, and rejects malformed preferences', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id integer primary key); insert into profiles values (1);')
    const original = await readFile(new URL('../supabase/migrations/135_flight_record_weights.sql', import.meta.url), 'utf8')
    const migration = await readFile(new URL('../supabase/migrations/136_flight_record_percentage_weights.sql', import.meta.url), 'utf8')
    await db.exec(original)
    const update = (value) => db.query('update profiles set flight_record_weights=$1::jsonb', [JSON.stringify(value)])
    await update(legacyWeights)
    await assert.rejects(update(percentageWeights136), /profiles_flight_record_weights_check/)
    await db.exec(migration)
    assert.deepEqual((await db.query('select flight_record_weights from profiles')).rows[0].flight_record_weights, legacyWeights)
    await update(percentageWeights136)
    await db.exec(migration)
    await db.exec(original)
    assert.deepEqual((await db.query('select flight_record_weights from profiles')).rows[0].flight_record_weights, percentageWeights136)
    for (const invalid of [[5], { ...percentageWeights136, body: 21 }, { ...percentageWeights136, times: 101 }, { ...percentageWeights136, times: 2.5 },
      { ...percentageWeights136, times: '4' }, { ...percentageWeights136, energy: null }, { ...percentageWeights136, times: [4] }, { ...percentageWeights136, another: 2 }, {}]) {
      await assert.rejects(update(invalid), /profiles_flight_record_weights_check/)
    }
  } finally { await db.close() }
})
