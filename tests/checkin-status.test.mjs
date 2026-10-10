import assert from 'node:assert/strict'
import { checkinDay, compareCheckinsNewest, latestCheckinForDay, checkinStatus, checkinFollowUp } from '../src/checkin-status.js'

const day = '2026-10-10'
const before = { activityDate: day, createdAt: `${day}T08:00:00Z`, type: 'before', competition: false }
const after = { ...before, createdAt: `${day}T19:00:00Z`, type: 'after', speedFeeling: 5, activityType: 'swim' }
const oldRace = { ...after, activityDate: '2026-10-04', createdAt: '2026-10-04T18:00:00Z', competition: true }
const late = { ...oldRace, activityDate: '2026-10-09', createdAt: `${day}T22:00:00Z` }
for (const rows of [[before, after, oldRace, late], [late, oldRace, after, before]]) {
  assert.equal(latestCheckinForDay(rows, day), after)
  assert.equal(checkinStatus(latestCheckinForDay(rows, day)), 'har simmat')
  assert.deepEqual(checkinFollowUp(rows, day), { followUp: false, raceFollowUp: false })
}
assert.equal(checkinDay(late), '2026-10-09')
assert.equal(checkinDay({ createdAt: '2026-10-09T22:30:00Z' }), day)
assert.equal([late, after].sort(compareCheckinsNewest)[0], after)
assert.equal(checkinStatus({ ...after, competition: true }), 'har tävlat')
assert.equal(checkinStatus({ ...before, speedFeeling: 5 }), 'ska träna')
assert.equal(checkinStatus({ ...before, competition: true }), 'ska tävla')
assert.deepEqual(checkinFollowUp([before], day), { followUp: true, raceFollowUp: false })
assert.deepEqual(checkinFollowUp([{ ...before, competition: true }], day), { followUp: false, raceFollowUp: true })
const sick = { ...after, createdAt: `${day}T20:00:00Z`, type: 'sick' }
assert.equal(checkinStatus(latestCheckinForDay([after, sick], day)), 'känner sig sjuk')
assert.equal(latestCheckinForDay([oldRace, late], day), undefined)
assert.equal(checkinStatus(null), null)
console.log('PASS check-in status: training vs competition, newest submission, late entries, Stockholm midnight, follow-up and newer sick status')
