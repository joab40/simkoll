import { supabaseRequest } from './supabase.js'
import { coachWeekAddDays, validCoachWeek } from '../shared/coach-week.js'

export async function loadCoachWeek(start, read = supabaseRequest) {
  if (!validCoachWeek(start)) { const error = new Error('Välj en giltig vecka med måndag som startdatum.'); error.status = 400; throw error }
  const end = coachWeekAddDays(start, 7)
  const within = (field) => `${field}=gte.${start}&${field}=lt.${end}`
  const rows = async (query) => {
    const all = []
    for (let offset = 0; offset < 20000; offset += 500) {
      const result = await read(`${query}&limit=500&offset=${offset}`)
      if (!result.ok) throw new Error('Veckans planering och närvaro kunde inte hämtas. Försök igen.')
      const page = await result.json()
      all.push(...page)
      if (page.length < 500) return all
    }
    throw new Error('Veckan innehåller för många registreringar för att kunna visas fullständigt.')
  }
  const [plans, sessions, attendance, responses] = await Promise.all([
    rows(`planned_training_sessions?${within('planned_date')}&select=profile_id,planned_date,session_slot&order=planned_date.asc,id.asc`),
    rows(`personal_training_sessions?${within('session_date')}&select=profile_id,session_date,session_slot,activity_type,source,completed_at&order=session_date.asc,id.asc`),
    rows(`session_attendance?${within('attendance_date')}&select=profile_id,attendance_date,session_slot,present,marked_at&order=attendance_date.asc,id.asc`),
    rows(`responses?${within('activity_date')}&profile_id=not.is.null&select=profile_id,activity_date,created_at,day_type,activity_type,session_slot,competition,training_registered&order=activity_date.asc,id.asc`),
  ])
  return {
    start,
    plans: plans.map((row) => ({ profileId: row.profile_id, date: row.planned_date, slot: row.session_slot })),
    sessions: sessions.map((row) => ({ profileId: row.profile_id, date: row.session_date, slot: row.session_slot, type: row.activity_type, source: row.source, completedAt: row.completed_at })),
    attendance: attendance.map((row) => ({ profileId: row.profile_id, date: row.attendance_date, slot: row.session_slot, present: row.present === true, markedAt: row.marked_at })),
    responses: responses.map((row) => ({ profileId: row.profile_id, date: row.activity_date, createdAt: row.created_at, type: row.day_type, activityType: row.activity_type, slot: row.session_slot, competition: row.competition === true, registerTraining: row.training_registered })),
  }
}
