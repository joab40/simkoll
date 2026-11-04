import React, { useEffect, useRef, useState } from 'react'
import { calendarActivityKey } from '../shared/planning-calendar.js'
import './calendar-visibility.css'

const originals = items => items.flatMap(item => item.calendarItems?.length ? originals(item.calendarItems) : [item])
export function CalendarVisibilityButton({ code, activities, restore = false, onSaved }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [impact, setImpact] = useState(null)
  const dialog = useRef(null)
  const items = [...new Map(originals(activities).map(item => [calendarActivityKey(item), item])).values()]
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [open])
  if (!items.length) return null
  const save = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-simkoll-code': code }, body: JSON.stringify({ action: 'set-calendar-visibility', keys: items.map(calendarActivityKey), date: items[0].date, hidden: !restore, confirmLinked: Boolean(impact) }) })
      const result = await response.json()
      if (result.needsConfirmation) { setImpact(result.impact); return }
      if (!response.ok) throw new Error(result.error || 'Ändringen kunde inte sparas.')
      setOpen(false); onSaved?.(); window.dispatchEvent(new CustomEvent('simkoll-calendar-visibility'))
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <><button type="button" className="text-button calendar-visibility-button" onClick={() => { setImpact(null); setError(''); setOpen(true) }}>{restore ? 'Återställ aktivitet' : 'Dölj i Simkoll'}</button>{open && <dialog ref={dialog} className="calendar-visibility-dialog" aria-labelledby={`visibility-title-${restore ? 'restore' : 'hide'}`} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false) }}>
    <h2 id={`visibility-title-${restore ? 'restore' : 'hide'}`}>{restore ? 'Återställ kalenderaktivitet?' : 'Dölj kalenderaktivitet i Simkoll?'}</h2>
    <ul>{items.map(item => <li key={calendarActivityKey(item)}>{item.date} · {item.time} · {item.title}</li>)}</ul>
    <p>{restore ? 'Aktiviteten visas igen om den fortfarande finns i SportAdmin-kalendern.' : 'Döljs i Simkolls kalender och kalenderförslag för alla tränare och simmare, även efter synk. Bara detta tillfälle påverkas, inte andra veckor. Du kan återställa det via Visa dolda aktiviteter.'}</p>
    <p>SportAdmin ändras inte. Planerade eller publicerade pass och simmarnas registreringar raderas inte.</p>
    {impact && <p className="calendar-visibility-warning" role="alert">Det finns {impact.plans} kopplade planeringsrader, varav {impact.published} kopplade till publicerade pass. De ligger kvar och kan fortfarande visas för simmarna. Ändra eller avpublicera passen separat om träningen är inställd. Vill du ändå dölja kalenderaktiviteten?</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="calendar-visibility-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>Avbryt</button><button type="button" className="primary-button" disabled={busy} onClick={save}>{busy ? 'Sparar…' : restore ? 'Återställ' : impact ? 'Dölj bara kalenderaktiviteten' : 'Dölj aktivitet'}</button></div>
  </dialog>}</>
}

export function HiddenCalendarActivities({ code, activities, from, to, groups, groupLabels }) {
  const visible = activities.filter(item => item.date >= from && item.date <= to && (!item.targetGroups?.length || item.targetGroups.some(group => groups.includes(group))))
  return <details className="hidden-calendar-activities"><summary>Visa dolda aktiviteter ({visible.length})</summary><p>Dolda kalendertillfällen i vald vecka och valda grupper. Sparade pass och incheckningar påverkas inte.</p>{visible.length ? visible.map(item => <div key={calendarActivityKey(item)}><span><strong>{item.date} · {item.time} · {item.title}</strong><small>{(item.targetGroups || []).map(group => groupLabels[group] || group).join(' · ')} · {item.location}</small></span><CalendarVisibilityButton code={code} activities={[item]} restore /></div>) : <p>Inga dolda aktiviteter i urvalet.</p>}</details>
}
