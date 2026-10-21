import React, { useState } from 'react'
import { planningDates } from '../shared/weekly-planning.js'
import './swimmer-week-planner.css'

const slots = [
  { key: 'morning_swim', short: 'Morgon', icon: '🌅' }, { key: 'strength', short: 'Styrka', icon: '🏋️' },
  { key: 'dryland', short: 'Land', icon: '🤸' }, { key: 'afternoon_swim', short: 'Eftermiddag', icon: '🌇' },
]
const dateLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })
const dayLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'short' }).replace('.', '')

export default function SwimmerWeekPlanner({ today, sessions, plans, saving, onToggle, onPlan, onWeekChange }) {
  const [offset, setOffset] = useState(0)
  const days = planningDates(today, offset)
  const shownPlans = plans.filter((item) => item.date >= days[0] && item.date <= days[6])
  const plannedDays = new Set(shownPlans.map((item) => item.date)).size
  const select = (next) => { setOffset(next); onWeekChange?.() }
  return <div className="swimmer-week-planner">
    <div className="swimmer-week-picker"><div className="swimmer-week-options" role="group" aria-label="Välj vecka att planera"><button type="button" aria-pressed={offset === 0} disabled={saving.size > 0} onClick={() => select(0)}>Denna vecka</button><button type="button" aria-pressed={offset === 1} disabled={saving.size > 0} onClick={() => select(1)}>Nästa vecka</button></div><p aria-live="polite"><strong>{dateLabel(days[0])}–{dateLabel(days[6])}</strong><span>{plannedDays} {plannedDays === 1 ? 'planerad dag' : 'planerade dagar'}</span></p></div>
    {offset === 1 && <p className="swimmer-next-week-help">Planera passen med ◆. Minst tre planerade dagar ger +2 poäng, en gång per vecka. Genomförd träning kan registreras till och med idag.</p>}
    <p className="plan-hint">◆ Planerat · ✓ Genomfört</p>
    <div className="week-log" role="group" aria-label={`Träningsplanering ${dateLabel(days[0])}–${dateLabel(days[6])}`}>
      <div className="week-log-head"><span>Pass</span>{days.map((date) => <b key={date}>{dayLabel(date)}<small>{Number(date.slice(-2))}</small></b>)}</div>
      {slots.map((slot) => <div className="week-log-row" key={slot.key}><span title={slot.short}>{slot.icon}<small>{slot.short}</small></span>{days.map((date) => {
        const marked = sessions.some((item) => item.date === date && item.slot === slot.key)
        const planned = shownPlans.some((item) => item.date === date && item.slot === slot.key)
        const key = `${date}-${slot.key}`, planKey = `plan-${key}`, future = date > today
        return <div className="week-cell" key={date}><button type="button" className={`plan-toggle ${planned ? 'planned' : ''} ${saving.has(planKey) ? 'saving' : ''}`} disabled={date < today} onClick={() => onPlan(date, slot.key)} aria-busy={saving.has(planKey)} aria-label={`${saving.has(planKey) ? 'Sparar planering för' : planned ? 'Ta bort planering för' : 'Planera'} ${slot.short} ${date}`}>{saving.has(planKey) ? '…' : '◆'}</button><label className={`${marked ? 'marked' : ''} ${future ? 'future' : ''} ${saving.has(key) ? 'saving' : ''}`}><input type="checkbox" disabled={future || saving.has(key)} checked={marked} onChange={(event) => onToggle(date, slot.key, event.target.checked)} aria-label={`Genomfört ${slot.short} ${date}`} aria-busy={saving.has(key)} /><i>{saving.has(key) ? '…' : marked ? '✓' : ''}</i></label></div>
      })}</div>)}
    </div>
  </div>
}
