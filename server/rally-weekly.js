import { supabaseRequest } from './supabase.js'
import { createRallyGame, projectRally, advanceRallyGates, validRallyReplay, RALLY_LAPS, RALLY_REPLAY_VERSION } from '../src/rally-engine.js'

// Shared replays need more than the local storage shape check. Check a plausible
// complete course, ordered gates, sample spacing and paid recovery teleports.
// This is a client-game sanity check, not an authoritative anti-cheat simulation.
export function sharedRallyReplay(input) {
  if (!validRallyReplay(input)) return null
  const replay = { version: input.version, duration: input.duration, frames: input.frames.map(frame => [...frame]) }
  if (Buffer.byteLength(JSON.stringify(replay), 'utf8') > 250000) return null
  const game = createRallyGame(), car = game.cars[0], track = game.track, first = replay.frames[0]
  if (first[4] || Math.hypot(first[1] - car.x, first[2] - car.y) > .2 || replay.duration < track.length * RALLY_LAPS / 300 * 1000) return null
  let previous = first, previousS = projectRally(track, first[1], first[2]).s
  for (const frame of replay.frames.slice(1)) {
    const dt = (frame[0] - previous[0]) / 1000, point = projectRally(track, frame[1], frame[2])
    if (frame[4]) {
      // Recovery adds exactly three seconds and cannot itself advance a gate.
      if (Math.abs(dt - 3) > .002) return null
    } else {
      if (dt > .08 || Math.hypot(frame[1] - previous[1], frame[2] - previous[2]) > 280 * dt + .3) return null
      car.speed = 280
      advanceRallyGates(car, previousS, point.s, track, point.distance <= track.width / 2 + 101, dt)
    }
    previous = frame; previousS = point.s
  }
  return car.gates === RALLY_LAPS * 12 ? replay : null
}

export async function loadWeeklyRallyGhost(weekStart) {
  const result = await supabaseRequest(`rally_weekly_ghosts?week_start=eq.${weekStart}&track_version=eq.${RALLY_REPLAY_VERSION}&profiles.active=eq.true&profiles.approval_status=eq.approved&profiles.is_test_profile=eq.false&select=profile_id,duration_ms,replay,profiles!inner(display_name,emoji)&order=duration_ms.asc,achieved_at.asc,profile_id.asc&limit=1`)
  if (!result.ok) throw new Error('Weekly rally ghost lookup failed')
  const [row] = await result.json()
  if (!row) return null
  if (!validRallyReplay(row.replay) || row.duration_ms !== row.replay.duration) throw new Error('Invalid stored rally ghost')
  return { profileId: row.profile_id, displayName: row.profiles?.display_name || 'Simmare', emoji: row.profiles?.emoji || '🏎️', durationMs: row.duration_ms, replay: row.replay }
}

export async function saveWeeklyRallyGhost(profileId, weekStart, replay) {
  // Conditional UPSERT in SQL: simultaneous slower runs cannot overwrite a best.
  const result = await supabaseRequest('rpc/keep_weekly_rally_ghost', { method: 'POST', body: JSON.stringify({ p_profile_id: profileId, p_week_start: weekStart, p_replay: replay }) })
  if (!result.ok) throw new Error('Weekly rally ghost save failed')
}
