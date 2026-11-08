import { supabaseRequest } from './supabase.js'
import { rankedRallyTimes } from '../shared/rally-times.js'

export async function loadRallyTimeRows() {
  const result = await supabaseRequest('rally_times?profiles.active=eq.true&profiles.approval_status=eq.approved&profiles.is_test_profile=eq.false&select=profile_id,track_version,duration_ms,time_source,achieved_at,saved_at,profiles!inner(display_name,emoji)&order=duration_ms.asc,saved_at.asc&limit=10000')
  if (!result.ok) throw new Error('Rally time leaderboard lookup failed')
  return rankedRallyTimes((await result.json()).map(row => ({profileId:row.profile_id,trackVersion:row.track_version,durationMs:row.duration_ms,timeSource:row.time_source,savedAt:row.achieved_at||row.saved_at,displayName:row.profiles?.display_name||'Simmare',emoji:row.profiles?.emoji||'🏎️'})))
}
export async function rallyTimeLeaderboard(profileId) {
  const rows = await loadRallyTimeRows()
  return { leaderboard:rows.slice(0,10), ownBest:rows.find(row=>row.profileId===profileId)||null, scoring:'Snabbaste trevarvstiden ger 10 poäng i All time, därefter 9–1. ≈ markerar konverterad äldre tid.' }
}
export async function saveRallyTime(profileId, durationMs, trackVersion, timeSource = 'recorded') {
  const result = await supabaseRequest('rpc/keep_rally_time', {method:'POST',body:JSON.stringify({p_profile_id:profileId,p_duration_ms:durationMs,p_track_version:trackVersion,p_time_source:timeSource})})
  if (!result.ok) throw new Error('Rally time save failed')
}
