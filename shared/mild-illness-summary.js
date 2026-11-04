import { validIllnessDay } from './illness.js'

// A report count, not a diagnosis or a traffic-light rule. Each swimmer and
// calendar day is counted once, including on days with completed training.
export function buildMildIllnessSummary(profiles = [], records = [], start, end) {
  if (!validIllnessDay(start) || !validIllnessDay(end) || start > end) throw new Error('Ogiltig period för sjukdomskänningar.')
  const scoped = profiles.filter(profile => !profile.isTestProfile)
  const ids = new Set(scoped.map(profile => profile.id)), latestByDay = new Map()
  for (const row of records) {
    if (!ids.has(row.profile_id) || !validIllnessDay(row.activity_date) || row.activity_date < start || row.activity_date > end) continue
    const key = `${row.profile_id}|${row.activity_date}`, previous = latestByDay.get(key)
    if (!previous || String(row.updated_at || '') >= String(previous.updated_at || '')) latestByDay.set(key, row)
  }
  const swimmers = scoped.map(profile => {
    const answers = [...latestByDay.values()].filter(row => row.profile_id === profile.id).sort((a, b) => a.activity_date.localeCompare(b.activity_date))
    const dates = answers.filter(row => !row.skipped && row.status === 'mild').map(row => row.activity_date)
    const latest = answers.at(-1)
    return { profileId: profile.id, displayName: profile.displayName || profile.username || 'Simmare', emoji: profile.emoji || '🏊', dates, days: dates.length, lastDate: dates.at(-1), latestDate: latest?.activity_date, latestStatus: latest?.skipped ? null : latest?.status }
  }).filter(profile => profile.days).sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'))
  return { start, end, count: swimmers.length, days: swimmers.reduce((sum, swimmer) => sum + swimmer.days, 0), swimmers }
}
