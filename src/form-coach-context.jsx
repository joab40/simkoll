import React, { useEffect, useState } from 'react'
const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }) : 'saknas'
const empty = asOf => ({ observedOn: asOf, trainingPbDate: '', competitionPbDate: '', taperStart: '', competitionDate: '', note: '' })

export default function FormCoachContext({ records, active, asOf, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...empty(asOf), ...records?.current })), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { setDraft({ ...empty(asOf), ...records?.current }) }, [records, asOf])
  const save = async event => {
    event.preventDefault()
    if (busy || !onSave) return
    setBusy(true); setMessage('')
    try { await onSave(draft); setMessage('Ny version sparad. Tidigare observationer finns kvar i historiken.') } catch (error) { setMessage(error.message || 'Kunde inte spara. Försök igen.') }
    finally { setBusy(false) }
  }
  return <aside className="form-coach-context"><strong>Tränaruppgifter · inte verifierade resultat</strong>
    {records?.available === false ? <p role="status">Tränaruppgifterna kunde inte hämtas och används inte i tolkningen. Kontrollera att SQL 120 är körd. Övriga värden och grafer fungerar ändå.</p> : <>
      {active ? <div className="form-coach-facts"><small>Observation {date(active.observedOn)} · bara för behöriga tränare</small>
        {active.trainingPbDate && <p>Tränings-PB enligt tränaren: {date(active.trainingPbDate)}{!active.trainingPbRecent ? ' · äldre uppgift' : ''}</p>}
        {active.competitionPbDate && <p>Tävlings-PB enligt tränaren: {date(active.competitionPbDate)}{!active.competitionPbRecent ? ' · äldre uppgift' : ''}</p>}
        {active.taperStart && <p>Tränaren anger påbörjad toppning: {date(active.taperStart)}{active.taperActive ? ' · inför kommande måltävling' : ' · ingen aktuell toppningsperiod antas utan kommande måltävling'}</p>}
        {active.competitionDate && <p>Måltävling enligt tränaren: {date(active.competitionDate)}{active.upcomingCompetition ? '' : ' · passerad'}</p>}
        {active.note && <p>{active.note}</p>}
      </div> : <p>Ingen aktuell tränarobservation är angiven. Personbästan eller toppning antas inte från graferna.</p>}
      {onSave && <details><summary>Lägg till eller rätta tränaruppgift</summary><p>Varje sparande skapar en ny version för den här simmaren. Ange faktiska datum. Uppgifterna verifierar inte toppform och ändrar inte några pass, resultat eller poäng.</p><form onSubmit={save} className="form-context-editor">
        {[['observedOn', 'Observationsdatum'], ['trainingPbDate', 'Senaste tränings-PB (valfritt)'], ['competitionPbDate', 'Senaste tävlings-PB (valfritt)'], ['taperStart', 'Toppning påbörjad (valfritt)'], ['competitionDate', 'Måltävling (valfritt)']].map(([key, label]) => <label key={key}>{label}<input type="date" value={draft[key] || ''} required={key === 'observedOn'} max={key === 'competitionDate' ? undefined : asOf} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label className="form-context-note">Tränarens notering (valfritt)<textarea value={draft.note || ''} maxLength={600} rows={3} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} /><small>Högst 600 tecken. Fritexten visas som notering och tolkas inte av AI eller analysregler.</small></label>
        <div><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Sparar…' : 'Spara ny version'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setDraft(empty(asOf))}>Töm formuläret</button></div><small>För att ta bort tidigare uppgifter från aktuell tolkning: töm formuläret och spara en ny tom version med dagens datum. Historiken behålls.</small>
      </form></details>}
      {records?.revisions?.length > 0 && <details><summary>Tidigare versioner · senaste fem</summary><ul>{records.revisions.map(row => <li key={row.id}><strong>{date(row.observedOn)}</strong><small> · sparad {row.createdAt ? new Date(row.createdAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }) : 'tid saknas'}</small>{row.trainingPbDate && <p>Tränings-PB: {date(row.trainingPbDate)}</p>}{row.competitionPbDate && <p>Tävlings-PB: {date(row.competitionPbDate)}</p>}{row.taperStart && <p>Toppning från: {date(row.taperStart)}</p>}{row.competitionDate && <p>Måltävling: {date(row.competitionDate)}</p>}{row.note && <p>{row.note}</p>}</li>)}</ul></details>}
    </>}{message && <p role="status">{message}</p>}
  </aside>
}
