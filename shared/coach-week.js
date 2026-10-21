export const COACH_WEEK_SLOTS = [
  { key: 'morning_swim', label: 'Morgon', icon: '🌅', type: 'swim' },
  { key: 'strength', label: 'Styrka', icon: '🏋️', type: 'strength' },
  { key: 'dryland', label: 'Land', icon: '🤸', type: 'dryland' },
  { key: 'afternoon_swim', label: 'Eftermiddag', icon: '🌇', type: 'swim' },
]
export const coachWeekAddDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export const coachWeekMonday = (date) => coachWeekAddDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
export const validCoachWeek = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date && coachWeekMonday(date) === date
const stamp = (value) => Date.parse(value || '') || 0
const latest = (rows, field) => rows.reduce((found, row) => !found || stamp(row[field]) >= stamp(found[field]) ? row : found, null)
const responseSlot = (row) => row.competition ? null : row.slot || (['strength', 'dryland'].includes(row.activityType) ? row.activityType : null)
const dayStatus = (row) => row?.competition ? (row.type === 'after' ? 'Har tävlat idag' : 'Ska tävla idag') : ({ rest: 'Vilar idag', sick: 'Känner sig sjuk' }[row?.type] || '')

// Counts people once per date/slot; a day-level answer is never guessed onto AM/PM.
export function buildCoachWeek(profiles, data, start) {
  const days = Array.from({ length: 7 }, (_, index) => coachWeekAddDays(start, index))
  const roster = profiles.filter((profile) => !profile.isTestProfile && profile.active !== false && (!profile.approvalStatus || profile.approvalStatus === 'approved'))
    .slice().sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'))
  const plans = new Set((data.plans || []).map((row) => `${row.profileId}|${row.date}|${row.slot}`))
  const index = (rows) => {
    const grouped = new Map()
    rows.forEach((row) => { const key = `${row.profileId}|${row.date}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row) })
    return grouped
  }
  const responses = index(data.responses || []), sessions = index(data.sessions || []), attendance = index(data.attendance || [])
  const cells = COACH_WEEK_SLOTS.flatMap((slot) => days.map((date) => {
    const entries = roster.map((profile) => {
      const personDay = `${profile.id}|${date}`
      const own = responses.get(personDay) || []
      const matched = own.filter((row) => !row.competition && ['before', 'after'].includes(row.type) && responseSlot(row) === slot.key && (!row.activityType || row.activityType === slot.type))
      const checkin = latest(matched, 'createdAt'), after = latest(matched.filter((row) => row.type === 'after'), 'createdAt')
      const coach = latest((attendance.get(personDay) || []).filter((row) => row.slot === slot.key), 'markedAt')
      // Historical "checkin" session rows can have guessed PM slots. Only
      // trust those when a matching response or coach attendance corroborates them.
      const registered = latest((sessions.get(personDay) || []).filter((row) => row.slot === slot.key && row.type === slot.type && row.source !== 'checkin'), 'completedAt')
      const reported = after && after.registerTraining !== false ? after : null
      const evidenceTime = Math.max(stamp(after?.createdAt), stamp(registered?.completedAt))
      const coachDecides = coach && (!evidenceTime || stamp(coach.markedAt) >= evidenceTime)
      const completed = Boolean(coachDecides ? coach.present : reported || registered)
      const planned = plans.has(`${personDay}|${slot.key}`)
      const other = latest(own.filter((row) => row.competition || ['rest', 'sick'].includes(row.type)), 'createdAt')
      const unassigned = slot.type === 'swim' ? latest(own.filter((row) => !row.competition && ['before', 'after'].includes(row.type) && (!row.activityType || row.activityType === 'swim') && !responseSlot(row)), 'createdAt') : null
      let status, source = ''
      if (completed) {
        status = 'Har tränat'
        source = coachDecides ? 'Närvaro registrerad av tränare' : reported ? 'Simmarens efterrapport' : registered.source === 'program' ? 'Registrerat styrkepass' : 'Markerat i Min träning'
      } else if (coachDecides && !coach.present) {
        status = 'Ej närvarande'; source = 'Markerat av tränare'
      } else if (checkin?.type === 'after') {
        status = 'Har tränat'; source = 'Efterrapport utan närvaroregistrering'
      } else if (checkin?.type === 'before' && !(other && !other.competition && stamp(other.createdAt) > stamp(checkin.createdAt))) {
        status = 'Ska träna idag'; source = 'Incheckat för detta pass'
      } else if (other) {
        status = dayStatus(other); source = 'Dagens incheckning'
      } else if (unassigned) {
        status = 'Incheckning utan passval'; source = 'Kan inte kopplas till morgon eller eftermiddag'
      } else {
        status = 'Ingen incheckning för passet'
      }
      return { profileId: profile.id, displayName: profile.displayName, emoji: profile.emoji || '🏊', planned, completed, status, source }
    })
    return { key: `${date}|${slot.key}`, date, slot: slot.key, entries, planned: entries.filter((entry) => entry.planned).length, completed: entries.filter((entry) => entry.completed).length, unplanned: entries.filter((entry) => !entry.planned).length }
  }))
  return { days, slots: COACH_WEEK_SLOTS, cells, profileCount: roster.length }
}
