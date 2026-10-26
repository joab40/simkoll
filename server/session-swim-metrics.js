import { buildSwimmerPasses } from './individual-analysis.js'

export function sessionSwimMetrics({ sessions, responses, workouts, plans, profiles }) {
  const metrics = new Map()
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
  for (const profileId of new Set(sessions.map((row) => row.profile_id))) {
    const profile = profiles.find((row) => row.id === profileId)
    const ownResponses = responses.filter((row) => row.profile_id === profileId && row.competition !== true)
    const passes = buildSwimmerPasses({ sessions: sessions.filter((row) => row.profile_id === profileId && row.activity_type === 'swim'), responses: ownResponses, workouts, plans, trainingGroup: profile?.training_group })
    for (const pass of passes) {
      const reports = ownResponses.filter((row) => row.day_type === 'after' && row.activity_date === pass.date && row.session_slot === pass.sessionSlot && (!row.activity_type || row.activity_type === 'swim')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      const report = reports[0]
      const estimate = report?.planned_completion !== 'partial' && report?.planned_completion !== 'no'
      metrics.set(`${profileId}|${pass.date}|${pass.sessionSlot}`, { distanceMeters: number(report?.activity_distance_meters) ?? (estimate ? pass.distanceMeters : null), durationMinutes: number(report?.activity_minutes) ?? (estimate ? pass.durationMinutes : null) })
    }
  }
  return metrics
}
