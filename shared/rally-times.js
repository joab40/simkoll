import { validRallyScore, RALLY_REPLAY_VERSION } from '../src/rally-engine.js'

export const validRallyTime = value => Number.isInteger(value) && value > 0 && value <= 180000
export function rallyTimeText(ms, approximate = false) {
  if (!Number.isInteger(ms) || ms < 0 || ms > 180000) return '—'
  const cs = Math.round(ms / 10)
  return `${approximate ? '≈ ' : ''}${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')},${String(cs % 100).padStart(2, '0')}`
}
export function convertedRallyTime(score) {
  if (!validRallyScore(score)) return null
  const durationMs = Math.round(180000 * (999 - score % 1000) / 999)
  if (!validRallyTime(durationMs)) return null
  return { durationMs, timeSource: 'converted', trackVersion: `legacy-stage-${Math.floor(score / 10000) - 1}` }
}
const original = row => row.timeSource !== 'converted'
const bin = ms => Math.round(999 * (1 - ms / 180000))
// A known original within the same legacy rounding bin is more informative
// than the centre-of-bin estimate. This never invents an original timestamp.
export function preferRallyTime(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.timeSource === 'converted' && original(b) && bin(a.durationMs) === bin(b.durationMs)) return b
  if (b.timeSource === 'converted' && original(a) && bin(a.durationMs) === bin(b.durationMs)) return a
  return b.durationMs < a.durationMs ? b : a
}
export function rankedRallyTimes(rows) {
  const best = new Map()
  // Establish the fastest converted/original candidate separately first, so
  // input ordering cannot change the chosen result near a rounding boundary.
  for (const row of rows) {
    if (!row?.profileId || !validRallyTime(row.durationMs) || !['recorded','recovered','converted'].includes(row.timeSource)) continue
    const key = `${row.profileId}:${row.timeSource === 'converted' ? 'converted' : 'original'}`
    const prior = best.get(key)
    if (!prior || row.durationMs < prior.durationMs || (row.durationMs === prior.durationMs && String(row.savedAt).localeCompare(String(prior.savedAt)) < 0)) best.set(key, row)
  }
  const people = new Map()
  for (const row of best.values()) people.set(row.profileId, preferRallyTime(people.get(row.profileId), row))
  return [...people.values()].sort((a,b) => a.durationMs - b.durationMs || String(a.savedAt).localeCompare(String(b.savedAt)) || a.profileId.localeCompare(b.profileId)).map((row,index) => ({...row,rank:index+1,rankingPoints:Math.max(0,10-index),displayTime:rallyTimeText(row.durationMs,row.timeSource==='converted'),historicalTrack:row.trackVersion!==RALLY_REPLAY_VERSION}))
}
