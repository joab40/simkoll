import React, { useRef, useState } from 'react'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { flightGroupId } from '../shared/flight-defaults.js'
import { PLANNING_WEEK_TYPES, suggestPlanningWeekType } from '../shared/planning-week-types.js'
import { usePlanningWeekTypes } from './use-planning-week-types.js'
import './planning-week-types.css'

const shortDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function WeekTypeRow({ name, groupId, weekStart, saved, suggestion, request, code, onSaved }) {
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const selected = draft ?? saved
  const change = type => { setDraft(type); setStatus(null) }
  const save = async event => {
    event.preventDefault()
    if (savingRef.current || selected === saved) return
    savingRef.current = true
    setSaving(true)
    setStatus(null)
    try {
      const result = await request('/api/workouts', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-planning-week-type', weekStart, groupId, type: selected || null }),
      })
      onSaved(result.type || '')
      setDraft(null)
      setStatus({ text: selected ? 'Veckotypen är sparad.' : 'Veckotypen är borttagen.' })
    } catch (error) { setStatus({ text: error.message, error: true }) }
    finally { savingRef.current = false; setSaving(false) }
  }

  return <form className="planning-week-type-row" onSubmit={save}>
    <label>
      <strong>{name}</strong>
      <select aria-label={`Veckotyp för ${name}`} value={selected} disabled={saving} onChange={event => change(event.target.value)}>
        <option value="">Ej vald</option>
        {Object.entries(PLANNING_WEEK_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <button type="submit" className="secondary-button" disabled={saving || selected === saved}>{saving ? 'Sparar…' : 'Spara'}</button>
    {suggestion && !selected && <p className="planning-week-type-hint">Förslag från {suggestion.name} · <button type="button" className="text-button" disabled={saving}
      onClick={() => change(suggestion.type)}>{PLANNING_WEEK_TYPES[suggestion.type]}</button></p>}
    {status && <p className={status.error ? 'form-error' : 'planning-week-type-hint'} role={status.error ? 'alert' : 'status'}>{status.text}</p>}
  </form>
}

export default function PlanningWeekTypes({ weekStart, groups, cycles, request, code }) {
  const { data, error, retry } = usePlanningWeekTypes({ code, request, from: groups.length ? weekStart : null,
    to: coachWeekAddDays(weekStart, 6), includeCompetitions: true })
  const [savedTypes, setSavedTypes] = useState({})
  const groupNames = new Map(groups)
  const competitions = (data?.competitions ?? []).filter(item => !item.targetGroups?.length
    || item.targetGroups.some(group => groupNames.has(flightGroupId(group))))

  return <section className="planning-week-types" aria-label="Veckotyp">
    <h2>Veckotyp</h2>
    {!groups.length ? <p>Välj en träningsgrupp för att sätta veckotyp.</p> : error ? <p role="alert" className="form-error">{error} <button type="button" className="text-button" onClick={retry}>Försök igen</button></p>
      : !data ? <p role="status">Hämtar veckotyper…</p> : <>
        {groups.map(([id, name]) => <WeekTypeRow key={id} name={name} groupId={id} weekStart={weekStart} request={request} code={code}
          saved={savedTypes[id] ?? data.weekTypes?.find(row => row.groupId === id)?.type ?? ''}
          suggestion={suggestPlanningWeekType(cycles, weekStart, id)} onSaved={type => setSavedTypes(current => ({ ...current, [id]: type }))} />)}
        {data.competitions === null && <p role="status">Tävlingskalendern kunde inte hämtas just nu.</p>}
        {competitions.length > 0 && <div className="planning-week-competitions"><h3>Tävlingar i veckan</h3><ul>
          {competitions.map(item => {
            const targetNames = (item.targetGroups ?? []).map(id => groupNames.get(flightGroupId(id))).filter(Boolean)
            return <li key={item.id}><span aria-hidden="true">🏁</span> <strong>{item.title}</strong> <small>
              {shortDate(item.startDate)}{item.endDate !== item.startDate && `–${shortDate(item.endDate)}`}{targetNames.length ? ` · ${targetNames.join(', ')}` : ''}
            </small></li>
          })}
        </ul></div>}
      </>}
  </section>
}
