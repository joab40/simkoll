import React from 'react'
import { isoWeek } from '../shared/planning-import.js'
import { planningAddDays } from '../shared/weekly-planning.js'
import './planning-week-label.css'

export default function PlanningWeekLabel({ monday }) {
  const { week, year } = isoWeek(monday)
  const date = key => new Date(`${key}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' })
  return <p className="planning-viewed-week" role="status" aria-live="polite" aria-atomic="true"><strong>Visar vecka {week} · {year}</strong><span>{date(monday)}–{date(planningAddDays(monday, 6))}</span></p>
}
