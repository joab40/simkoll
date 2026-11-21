import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { changeFlightWeight, defaultFlightWeights } from '../shared/flight-line.js'

test('SQL 137 retains earlier weights, scopes dated scores and validates extended weights', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  const owner = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const metric = '33333333-3333-4333-8333-333333333333'
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table profiles(id uuid primary key);')
    await db.query('insert into profiles values ($1), ($2)', [owner, other])
    for (const migration of ['135_flight_record_weights', '136_flight_record_percentage_weights']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), 'utf8'))
    }
    const setWeight = weights => db.query('update profiles set flight_record_weights=$2::jsonb where id=$1', [owner, JSON.stringify(weights)])
    const { sleepGoal: _sleepGoal, ...previous } = defaultFlightWeights
    await setWeight(previous)
    const migration = await readFile(new URL('../supabase/migrations/137_flight_record_measures.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    assert.deepEqual((await db.query('select flight_record_weights from profiles where id=$1', [owner])).rows[0].flight_record_weights, previous)
    await assert.rejects(db.query('update profiles set flight_record_sleep_goal_minutes=841 where id=$1', [owner]), /check constraint/)
    await db.query('insert into flight_record_metrics values ($1,$2,\'Teknikkänsla\',\'Teknik\')', [metric, owner])
    const score = (profileId, value) => db.query("insert into flight_record_scores values ($1,$2,'2026-11-21',$3) on conflict (profile_id,metric_id,activity_date) do update set value=excluded.value", [profileId, metric, value])
    await score(owner, 3)
    await score(owner, 5)
    await assert.rejects(score(other, 4), /foreign key/)
    await assert.rejects(score(owner, 6), /check constraint/)
    assert.deepEqual((await db.query('select value from flight_record_scores')).rows, [{ value: 5 }])
    const configured = changeFlightWeight(changeFlightWeight(defaultFlightWeights, 'sleepGoal', 20), metric, 35)
    await setWeight(configured)
    await assert.rejects(setWeight({ ...configured, unrecognized: 0 }), /profiles_flight_record_weights_check/)
    await assert.rejects(setWeight({ ...configured, [metric]: 36 }), /profiles_flight_record_weights_check/)
    assert.equal((await db.query("select has_table_privilege('authenticated','flight_record_scores','select') as allowed")).rows[0].allowed, false)
  } finally { await db.close() }
})
