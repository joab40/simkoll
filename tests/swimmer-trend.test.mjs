import assert from 'node:assert/strict'
import { buildSwimmerTrend } from '../server/swimmer-trend.js'

const rows = (start, feeling, body) => [0, 1, 2].map((offset) => ({ profile_id: 'one', activity_date: `2026-10-${String(start + offset).padStart(2, '0')}`, created_at: '2026-10-10T12:00:00Z', feeling, body }))
const fixture = { currentResponses: rows(5, 4, 4), previousResponses: rows(1, 3, 3), currentSessions: [{ session_date: '2026-10-05', session_slot: 'afternoon_swim', activity_type: 'swim' }], previousSessions: [], start: '2026-10-05T00:00:00Z', end: '2026-10-12T00:00:00Z', previousStart: '2026-09-28T00:00:00Z', previousEnd: '2026-10-05T00:00:00Z' }
const result = buildSwimmerTrend(fixture)
assert.equal(result.state, 'up'); assert.equal(result.changes.feeling, 1)
assert.equal(result.current.metrics.feeling.days, 3)
assert.equal(result.continuity.current, 1)
assert.equal(buildSwimmerTrend({ ...fixture, currentResponses: rows(5, 3, 3) }).state, 'steady')
assert.equal(buildSwimmerTrend({ ...fixture, currentResponses: rows(5, 4, 2) }).state, 'mixed')
assert.equal(buildSwimmerTrend({ ...fixture, currentResponses: rows(5, 2, 2) }).state, 'down')
assert.equal(buildSwimmerTrend({ ...fixture, currentResponses: rows(5, 4, 4).slice(0, 2) }).state, 'insufficient')
assert.equal(buildSwimmerTrend({ ...fixture, truncated: true }).state, 'insufficient')
const duplicates = buildSwimmerTrend({ ...fixture, currentResponses: [...fixture.currentResponses, ...Array(20).fill(fixture.currentResponses[0])], currentSessions: [...fixture.currentSessions, ...fixture.currentSessions] })
assert.equal(duplicates.current.metrics.feeling.value, 4)
assert.equal(duplicates.continuity.currentPasses, 1)
assert.equal(buildSwimmerTrend({ ...fixture, currentResponses: [], previousResponses: [] }).state, 'insufficient')
console.log('PASS swimmer direction: periods, daily weighting, late-entry dates, direction, sparse data, truncated data and deduplicated sessions')
