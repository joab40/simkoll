import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from './api-request.js'
import { activityStreak, shiftActivityDay, validActivityDay } from '../shared/activity-streak.js'
import './activity-correction.css'

const dateLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
function CorrectionDialog({ profile, code, request, onClose }) {
  const [data, setData] = useState(null), [month, setMonth] = useState(''), [day, setDay] = useState('')
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [needsReload, setNeedsReload] = useState(false)
  const dialog = useRef(null), abort = useRef(null), alive = useRef(true), pending = useRef(false)
  const load = async () => {
    setBusy('loading'); setError('')
    abort.current = new AbortController()
    try {
      const next = await request(`/api/profiles?activityAdmin=true&profileId=${encodeURIComponent(profile.id)}`, code, { signal: abort.current.signal })
      if (!alive.current) return
      setData(next); setNeedsReload(false)
      setMonth(current => current || next.today.slice(0, 7))
      setDay(current => current || (shiftActivityDay(next.today, -1) < next.createdDay ? next.createdDay : shiftActivityDay(next.today, -1)))
    } catch (failure) { if (alive.current) { setError(failure.message); setNeedsReload(true) } }
    finally { if (alive.current) setBusy('') }
  }
  useEffect(() => {
    alive.current = true
    const focused = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.showModal(); void load()
    return () => { alive.current = false; abort.current?.abort(); document.body.style.overflow = overflow; if (focused?.isConnected) focused.focus() }
  }, [])
  const choose = next => { setDay(next); setConfirmed(false); setMessage(''); if (validActivityDay(next)) setMonth(next.slice(0, 7)) }
  const registered = Boolean(data?.activityDates.includes(day)), correction = data?.corrections.find(row => row.activity_date === day)
  const valid = data && validActivityDay(day) && day >= data.createdDay && day <= data.today
  const save = async event => {
    event.preventDefault()
    if (pending.current || busy || !valid || registered || !confirmed || reason.trim().length < 5 || needsReload) return
    pending.current = true; setBusy('saving'); setError(''); setMessage('')
    abort.current = new AbortController()
    try {
      const result = await request('/api/profiles', code, { method: 'POST', signal: abort.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'correct-activity-day', profileId: profile.id, activityDate: day, reason: reason.trim(), confirmed: true }) })
      if (!alive.current) return
      setMessage(result.message); setConfirmed(false); setReason('')
      await load()
    } catch (failure) { if (alive.current) { setError(failure.message); setNeedsReload(true); setConfirmed(false) } }
    finally { pending.current = false; if (alive.current) setBusy('') }
  }
  let calendarDays = [], offset = 0
  if (validActivityDay(`${month}-01`)) {
    const start = `${month}-01`, [year, number] = month.split('-').map(Number), count = new Date(Date.UTC(year, number, 0)).getUTCDate()
    offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7
    calendarDays = Array.from({ length: count }, (_, index) => shiftActivityDay(start, index))
  }
  return createPortal(<dialog ref={dialog} className="activity-correction-dialog" aria-labelledby="activity-correction-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div><p>Superadmin · spårbar rättelse</p><h2 id="activity-correction-title">Aktivitetsdagar · {profile.displayName}</h2></div><button type="button" onClick={onClose} aria-label="Stäng aktivitetsrättelsen">×</button></header>
    <div className="activity-correction-body"><p>Lägg till en missad aktivitetsdag för simmaren, även din egen kopplade simmarprofil. Det är en administrativ rättelse – inte ett bevis på inloggning eller träning. Inga träningspass, känslovärden eller incheckningssvar skapas.</p>
      <div className="activity-correction-toolbar"><strong>{data ? `${data.streak} dagar i rad till och med ${dateLabel(data.today)}` : 'Hämtar aktivitetshistoriken…'}</strong><button type="button" disabled={!!busy} onClick={() => { setConfirmed(false); void load() }}>Hämta historiken igen</button></div>
      {message && <p className="activity-correction-success" role="status">{message}</p>}{error && <p className="activity-correction-error" role="alert">{error}</p>}
      {data && <><section aria-label="Aktivitetskalender"><label className="activity-correction-month">Visa månad<input type="month" value={month} min={data.createdDay.slice(0, 7)} max={data.today.slice(0, 7)} disabled={!!busy} onChange={event => setMonth(event.target.value)} /></label><div className="activity-correction-calendar"><div className="activity-correction-weekdays" aria-hidden="true">{['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((label, index) => <span key={index}>{label}</span>)}</div><div className="activity-correction-days">{calendarDays.map((date, index) => {
        const hasDay = data.activityDates.includes(date), repaired = data.corrections.some(row => row.activity_date === date), unavailable = date < data.createdDay || date > data.today
        return <button key={date} type="button" disabled={!!busy || unavailable} aria-pressed={day === date} aria-label={`${dateLabel(date)} · ${hasDay ? repaired ? 'Rättad aktivitetsdag' : 'Registrerad aktivitet' : 'Ingen registrerad aktivitet'}`} className={`${hasDay ? repaired ? 'repaired' : 'recorded' : 'missing'} ${day === date ? 'selected' : ''}`} style={index === 0 ? { gridColumnStart: offset + 1 } : undefined} onClick={() => choose(date)}><span>{Number(date.slice(-2))}</span><small>{hasDay ? repaired ? 'Rättad' : 'Aktivitet' : '–'}</small></button>
      })}</div></div><p className="activity-correction-legend">Grönt = registrerad aktivitet · Blått = administrativt rättad dag · Streck = ingen registrering, inte bevis på frånvaro.</p></section>
      <form onSubmit={save}><label>Datum att rätta<input type="date" required min={data.createdDay} max={data.today} value={day} disabled={!!busy} onChange={event => choose(event.target.value)} /></label>
        {registered ? <p className="activity-correction-existing">Dagen är redan registrerad och ändras inte.{correction && <> Rättad {new Date(correction.created_at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}: {correction.reason}</>}</p> : <><p>{valid ? `Registrerad svit till idag efter rättelsen: ${activityStreak([...data.activityDates, day], data.today)} dagar (nu ${data.streak}).` : 'Välj ett giltigt datum från profilens skapandedag till och med idag.'}</p><label>Anledning<textarea required minLength={5} maxLength={500} rows={3} value={reason} disabled={!!busy} placeholder="Exempel: Saknad aktivitetsregistrering upptäckt vid testning." onChange={event => { setReason(event.target.value); setConfirmed(false) }} /></label><label className="activity-correction-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy || !valid || needsReload} onChange={event => setConfirmed(event.target.checked)} /><span>Jag vill lägga till {valid ? dateLabel(day) : 'valt datum'} för <strong>{profile.displayName}</strong>. Datum, anledning och mitt administratörskonto loggas.</span></label><button type="submit" className="primary-button" disabled={!!busy || !valid || reason.trim().length < 5 || !confirmed || needsReload}>{busy === 'saving' ? 'Sparar rättelsen…' : 'Lägg till aktivitetsdagen'}</button></>}
        <small>Rättelsen delar inte ut poäng. Ordinarie svitmilstolpar kan räknas om när simmaren öppnar appen; redan utdelade milstolpar ska inte delas ut igen. Befintliga aktivitetsdagar kan inte tas bort här.</small>
      </form></>}
    </div>
  </dialog>, document.body)
}
export default function ActivityCorrection({ profile, code, request = apiRequest }) {
  const [open, setOpen] = useState(false)
  return <div className="activity-correction-entry"><button type="button" onClick={() => setOpen(true)}>Rätta aktivitetsdag</button><small>Superadmin · gäller även din egen simmarprofil</small>{open && <CorrectionDialog key={`${code}:${profile.id}`} profile={profile} code={code} request={request} onClose={() => setOpen(false)} />}</div>
}
