import { validRallyReplay, RALLY_REPLAY_VERSION } from './rally-engine.js'

export function weeklyGhostData(value) {
  if (!value || typeof value.active !== 'boolean' || value.trackVersion !== RALLY_REPLAY_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(value.weekStart)) throw new Error('Veckans ghost hade ett ogiltigt format.')
  const day = new Date(`${value.weekStart}T12:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.getUTCDay() !== 1 || day.toISOString().slice(0, 10) !== value.weekStart) throw new Error('Veckans ghost hade ett ogiltigt datum.')
  let leader = null
  if (value.active && value.leader !== null) {
    const row = value.leader
    if (!row || typeof row.profileId !== 'string' || !row.profileId || typeof row.displayName !== 'string' || !validRallyReplay(row.replay) || row.durationMs !== row.replay.duration) throw new Error('Veckans ghost kunde inte läsas.')
    leader = { profileId: row.profileId, displayName: row.displayName.slice(0, 120), emoji: typeof row.emoji === 'string' ? row.emoji.slice(0, 20) : '🏎️', durationMs: row.durationMs, replay: row.replay }
  }
  return { active: value.active, weekStart: value.weekStart, trackVersion: value.trackVersion, leader }
}

// A slow/offline shared ghost must never prevent playing the local game.
export async function requestWeeklyGhost(request, code, submission = null) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
  try {
    const options = submission ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-rally-ghost', ...submission }) } : {}
    return weeklyGhostData(await request(`/api/points${submission ? '' : '?rallyGhost=true'}`, code, { ...options, signal: controller.signal }))
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Veckans ghost svarade inte i tid. Du kan spela vidare och försöka igen senare.')
    throw error
  } finally { clearTimeout(timer) }
}
