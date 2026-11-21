import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { changeFlightWeight, defaultFlightWeights, flightLine, validateFlightWeights } from '../shared/flight-line.js'
import { defaultFlightBoostSettings, taperBoostSteps, validateFlightBoostSettings } from '../shared/flight-boosts.js'
import { flightRecordDays } from '../shared/flight-record.js'
import { flightTaperAdjustments } from '../shared/flight-taper.js'

const date = offset => coachWeekAddDays('2026-09-01', offset)
const training = { kind: 'training', meters: 4000, load: 600, sessions: 1, rpe: 6 }
const light = { kind: 'training', meters: 2400, load: 300, sessions: 1, rpe: 4 }
const rest = { kind: 'rest', meters: 0, load: 0, sessions: 0, rpe: null }
const repeated = (count, value) => Array(count).fill(value)
const makeDays = observations => observations.map((taperObservation, index) => ({ date: date(index), taperObservation }))

test('lighter training uses a fixed reference and turns from a boost into a penalty', () => {
  const stableDays = 42
  const adjustments = new Map(flightTaperAdjustments(makeDays([
    ...repeated(stableDays, training), ...repeated(30, light), ...repeated(8, training),
  ])).map(point => [point.date, point]))
  const onDay = day => adjustments.get(date(stableDays + day - 1))
  const steps = day => taperBoostSteps(onDay(day), defaultFlightBoostSettings.taper)
  assert.equal(onDay(14).start, date(stableDays))
  assert.equal(onDay(14).duration, 14)
  assert.equal(steps(14), 5)
  assert(steps(15) < 5 && steps(15) > 0)
  assert(steps(20) < steps(15) && steps(20) > 0)
  assert(steps(21) < 0)
  assert.equal(steps(30), -5)
  assert.equal(onDay(38), undefined)
})

test('rest is evidence, while missing data, illnesses and harder effort cannot masquerade as lighter training', () => {
  const baseline = repeated(42, training)
  assert.equal(flightTaperAdjustments(makeDays([...baseline, ...repeated(25, null)])).length, 0)
  const explicitRest = flightTaperAdjustments(makeDays([...baseline, rest]))
  assert.deepEqual(explicitRest.at(-1), { date: date(42), kind: 'rest' })
  assert.equal(taperBoostSteps(explicitRest.at(-1), defaultFlightBoostSettings.taper), 1.5)
  const attendanceOnly = repeated(42, { kind: 'training', sessions: 1 })
  const longRest = flightTaperAdjustments(makeDays([...attendanceOnly, ...repeated(21, rest)]))
  assert.equal(longRest.at(-1).duration, 21)
  assert(taperBoostSteps(longRest.at(-1), defaultFlightBoostSettings.taper) < 0)
  const illness = flightTaperAdjustments(makeDays([...baseline, { kind: 'sick' }, ...repeated(6, rest)]))
  assert.equal(illness.length, 0)
  const harder = flightTaperAdjustments(makeDays([...baseline, ...repeated(20, { ...light, rpe: 9 })]))
  assert.equal(harder.at(-1), undefined)
})

test('the diary distinguishes completed training, recorded rest and an empty day', () => {
  const records = flightRecordDays(date(0), date(4), {
    entries: [
      { date: date(0), type: 'rest', state: 'status' },
      { date: date(2), type: 'rest', state: 'status' },
      { date: date(2), type: 'swim', state: 'completed', linked: true, estimatedMeters: 3000, estimatedMinutes: 60, rpe: 4 },
      { date: date(3), type: 'rest', state: 'status' },
      { date: date(3), type: 'sick', state: 'status' },
      { date: date(4), type: 'swim', state: 'completed', rpe: 4 },
    ],
  })
  assert.deepEqual(records.map(day => day.taperObservation), [
    rest, null, { kind: 'training', meters: 3000, rpe: 4, load: 240, sessions: 1 },
    { kind: 'sick' }, { kind: 'training', meters: null, rpe: 4, load: null, sessions: 1 },
  ])
})

test('taper strength is independent of the base weights and appears only with a base value', () => {
  const observed = Array.from({ length: 35 }, (_, index) => ({ date: date(index), speedFeeling: 3 }))
  const weights = Object.fromEntries(Object.keys(defaultFlightWeights).map(key => [key, 0]))
  weights.speedFeeling = 100
  const configured = changeFlightWeight(weights, 'taper', 50)
  assert.deepEqual(validateFlightWeights(configured), configured)
  const latest = (duration, current = configured, history = observed) => flightLine(history.slice(-1), history.slice(0, -1), [], current, [], [{ date: date(34), kind: 'reduced', duration }])[0]
  assert.equal(latest(14).value, 52.5)
  assert.equal(latest(28).taperEffect, -2.5)
  assert.equal(latest(14, weights).value, 50)
  assert.equal(latest(14, configured, observed.slice(-1)).value, null)
})

test('custom boost values hold at their configured peak, then fade for the selected days', () => {
  const configured = validateFlightBoostSettings({
    times: { maxSteps: 8, fullDays: 3, fadeDays: 2 },
    taper: { maxSteps: 8, minusSteps: 4, fullDays: 10, fadeDays: 3 },
  })
  const reduced = duration => taperBoostSteps({ kind: 'reduced', duration }, configured.taper)
  assert.equal(reduced(10), 8)
  assert.equal(reduced(11), 6)
  assert.equal(reduced(13), 2)
  assert(reduced(14) < 0)
  assert.equal(reduced(20), -4)
  const observed = Array.from({ length: 35 }, (_, index) => ({ date: date(index), speedFeeling: 3 }))
  const weights = { ...Object.fromEntries(Object.keys(defaultFlightWeights).map(key => [key, 0])), speedFeeling: 100, times: 100 }
  const timeLift = age => flightLine(observed.slice(-1), observed.slice(0, -1), [
    { date: date(34 - age), strength: 5 },
  ], weights, [], [], configured)[0].timeLift
  assert.equal(timeLift(2), 8)
  assert.equal(timeLift(3), 5.3)
  assert.equal(timeLift(4), 2.7)
  assert.equal(timeLift(5), 0)
  assert.throws(() => validateFlightBoostSettings({ ...configured, times: { maxSteps: 4, fullDays: 90, fadeDays: 1 } }), /högst 90 dagar/)
})

test('SQL 138 keeps old profiles off and constrains the saved strength', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id integer primary key); insert into profiles values (1);')
    const sql = await readFile(new URL('../supabase/migrations/138_flight_record_taper_weight.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query('select flight_record_taper_weight from profiles')).rows[0].flight_record_taper_weight, 0)
    await db.exec('update profiles set flight_record_taper_weight=100')
    await assert.rejects(db.exec('update profiles set flight_record_taper_weight=101'), /check constraint/)
    const save = settings => db.query('update profiles set flight_record_boost_settings=$1::jsonb', [JSON.stringify(settings)])
    await save(defaultFlightBoostSettings)
    await assert.rejects(save({ ...defaultFlightBoostSettings, taper: { ...defaultFlightBoostSettings.taper, fullDays: 90 } }), /check constraint/)
    await assert.rejects(save({ ...defaultFlightBoostSettings, times: { maxSteps: '5', fullDays: 1, fadeDays: 6 } }), /check constraint/)
  } finally { await db.close() }
})
