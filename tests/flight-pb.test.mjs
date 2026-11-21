import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { defaultFlightBoostSettings } from '../shared/flight-boosts.js'
import { defaultFlightWeights, flightLine, flightTimeLifts } from '../shared/flight-line.js'
import { flightTimeSeries } from '../shared/flight-record.js'
import { defaultFlightPbSettings, flightPbCandidates, pbBoostFraction, tempusPbLookup, validateFlightPbSettings } from '../shared/flight-pb.js'

const date = '2026-11-21'
const time = (overrides = {}) => ({
  result_date: date, result_time: 6100, distance_meters: 100, stroke: 'freestyle', pool_length: 25,
  kind: 'test', exercise: 'full', start_type: 'push', timing_method: 'hand', equipment: [], ...overrides,
})
const race = (overrides = {}) => ({
  source: 'tempus', result_date: '2022-06-11', event: '100m Frisim', pool: '25 m', result_time: 6000, ...overrides,
})

test('Tempus PB uses only the matching earlier individual event, including old results', () => {
  const referenceFor = tempusPbLookup([
    race(), race({ result_date: date, result_time: 5500 }),
    race({ result_date: '2026-11-22', result_time: 5300 }),
    race({ event: '4x100 m Frisim', result_time: 3000 }),
    race({ event: '100m Bröstsim', result_time: 5100 }),
    race({ pool: '50m', result_time: 5200 }),
    race({ source: 'manual', result_time: 5400 }),
    race({ result_date: '2026-01-01', result_time: 6050 }),
  ])
  const series = flightTimeSeries([
    time(), time({ result_time: 5800, equipment: ['fins'] }),
    time({ result_time: 5900, conditions: 'Motström' }), time({ result_time: 5900, exercise: 'arms' }),
  ], [])
  const candidates = flightPbCandidates(series, referenceFor, date)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].reference, 6000)
  assert.equal(candidates[0].referenceDate, '2022-06-11')
  assert.equal(candidates[0].pbKind, 'near')
  assert.match(candidates[0].label, /Frånskjut.*Handtid/)
  const medley = tempusPbLookup([race({ event: '200 Medley', pool: '50 meter' })])
  assert.equal(medley({ distance: 200, stroke: 'medley', pool: 50 }, date).centis, 6000)
})

test('near-PB cutoffs are configurable per distance and a faster test is a separate boost', () => {
  const settings = defaultFlightPbSettings()
  assert.deepEqual(settings.margins, { 50: 50, 100: 100, 200: 300 })
  const fraction = (distance, gap) => pbBoostFraction({ pbKind: gap < 0 ? 'faster' : 'near', distance, reference: 6000, centis: 6000 + gap }, settings)
  assert.equal(fraction(50, 50), .5)
  assert.equal(fraction(50, 51), 0)
  assert.equal(fraction(100, 0), 1)
  assert.equal(fraction(100, 50), .75)
  assert.equal(fraction(200, 300), .5)
  assert.equal(fraction(200, 301), 0)
  assert.equal(fraction(200, -25), 1)
  assert.throws(() => validateFlightPbSettings({ ...settings, faster: { maxSteps: 8, fullDays: 4, fadeDays: 4 } }), /högst 7 dagar/)
})

test('a like-for-like practice improvement is available when no matching Tempus PB exists', () => {
  const series = flightTimeSeries([
    time({ result_date: '2026-11-10', result_time: 6350 }),
    time({ result_date: '2026-11-12', result_time: 6335 }),
    time({ result_date: '2026-11-14', result_time: 6360 }),
    time({ result_time: 6199 }),
  ], [])
  const historyWithoutPb = tempusPbLookup([race({ pool: '50m' })])
  const fallback = reference => flightTimeLifts(series, (group, point) => !reference(group.raceReference, point.date))
  assert.equal(fallback(historyWithoutPb)[0].reference, 6350)
  assert.equal(fallback(tempusPbLookup([race()])).length, 0)
})

test('the strongest practice lift wins and expires on day eight even with a longer competition setting', () => {
  const observed = Array.from({ length: 35 }, (_, index) => ({ date: coachWeekAddDays(date, index - 34), speedFeeling: 3 }))
  const weights = { ...Object.fromEntries(Object.keys(defaultFlightWeights).map(key => [key, 0])), speedFeeling: 100, times: 100 }
  const boosts = { ...defaultFlightBoostSettings, times: { maxSteps: 5, fullDays: 30, fadeDays: 10 } }
  const latest = (lifts, pb = undefined) => flightLine(observed.slice(-1), observed.slice(0, -1), lifts, weights, [], [], boosts, pb)[0]
  const faster = { date, kind: 'test', pbKind: 'faster', centis: 5980, reference: 6000, distance: 100 }
  const near = { ...faster, kind: 'training', pbKind: 'near', centis: 6010 }
  assert.equal(latest([near, faster]).timeLift, 8)
  assert.equal(latest([near, faster]).events[0].pbKind, 'faster')
  const age = (event, days) => ({ ...event, date: coachWeekAddDays(date, -days) })
  assert(latest([age(faster, 6)]).timeLift > 0)
  assert.equal(latest([age(faster, 7)]).timeLift, 0)
  assert.equal(latest([age({ kind: 'training', strength: 5 }, 7)]).timeLift, 0)
  assert.equal(latest([age({ kind: 'race', strength: 5 }, 7)]).timeLift, 5)
  const configured = { ...defaultFlightPbSettings(), near: { maxSteps: 10, fullDays: 7, fadeDays: 0 } }
  assert.equal(latest([near, faster], configured).events[0].pbKind, 'near')
  const shortFaster = { ...defaultFlightPbSettings(), faster: { maxSteps: 8, fullDays: 1, fadeDays: 0 } }
  assert.equal(latest([age(near, 1), age(faster, 1)], shortFaster).events[0].pbKind, 'near')
  assert.equal(latest([age(faster, 7), age({ kind: 'race', strength: 5 }, 7)]).timeLift, 5)
})

test('SQL 139 accepts configured boosts and limits practice horizons to seven days', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id integer primary key); insert into profiles values (1);')
    const migration = await readFile(new URL('../supabase/migrations/139_flight_record_pb_boosts.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const settings = defaultFlightPbSettings()
    const save = value => db.query('update profiles set flight_record_pb_boost_settings=$1::jsonb', [JSON.stringify(value)])
    await save(settings)
    await assert.rejects(save({ ...settings, faster: { ...settings.faster, fullDays: 2 } }), /check constraint/)
    await assert.rejects(save({ ...settings, margins: { ...settings.margins, 50: '50' } }), /check constraint/)
  } finally { await db.close() }
})
