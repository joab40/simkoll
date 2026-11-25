import React, { useEffect, useState } from 'react'
import { CHECKIN_EDIT_FIELDS, checkinEditValues } from '../shared/checkin-history.js'
import { diaryMonthRange } from '../shared/diary-calendar.js'
import { planningAddDays } from '../shared/weekly-planning.js'
import { stockholmActivityDay } from '../shared/activity-streak.js'
import { DiaryCalendar } from './training-diary.jsx'
import { checkinStatus } from './checkin-status.js'
import './checkin-history.css'

const formatDay = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm' })

function EditAnswers({ entry, request, code, onSave, onCancel }) {
  const [changes, setChanges] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setChanges(current => ({ ...current, [key]: value }))
  const save = async event => {
    event.preventDefault()
    if (busy || !Object.keys(changes).length) return
    setBusy(true)
    setError('')
    try {
      const result = await request('/api/responses', code, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit-checkin-answers', id: entry.id, date: entry.activityDate, changes }),
      })
      onSave(result.response)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  const fields = CHECKIN_EDIT_FIELDS.filter(([key]) => entry[key] != null || entry.type === 'after'
    || key === 'feeling' || key === 'body' || ((entry.type === 'before' || entry.type === 'rest') && key === 'energy')
    || (entry.type === 'before' && key === 'motivation'))
  return <form className="history-checkin-edit" onSubmit={save}>
    <fieldset disabled={busy}>
      <legend>Ändra eller komplettera svar</legend>
      <div className="history-checkin-fields">{fields.map(([key, , label, values]) => <label key={key}>{label}
        <select value={(Object.hasOwn(changes, key) ? changes[key] : entry[key]) ?? ''}
          onChange={event => set(key, event.target.value === '' ? null : Number(event.target.value))}>
          {key !== 'feeling' && <option value="">Ej besvarat</option>}
          {checkinEditValues(values).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>)}</div>
      <label>Kommentar<textarea maxLength={300} rows={3} value={changes.comment ?? entry.comment ?? ''} onChange={event => set('comment', event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="history-checkin-actions">
        <button type="submit" className="primary-button" disabled={!Object.keys(changes).length}>{busy ? 'Sparar…' : 'Spara svar'}</button>
        <button type="button" className="secondary-button" onClick={onCancel}>Avbryt</button>
      </div>
    </fieldset>
  </form>
}

export default function CheckinHistory({ code, request, initialDate, onStart, onBack, onUpdated }) {
  const latest = planningAddDays(stockholmActivityDay(), -1)
  const [date, setDate] = useState(initialDate || null)
  const [month, setMonth] = useState((initialDate || latest).slice(0, 7))
  const range = diaryMonthRange(month, latest)
  const [result, setResult] = useState(null)
  const [attempt, retry] = useState(0)
  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('')
  const view = result?.month === month && result?.attempt === attempt ? result : null
  useEffect(() => {
    const controller = new AbortController()
    const finish = value => { if (!controller.signal.aborted) setResult({ month, attempt, ...value }) }
    request(`/api/responses?checkinHistory=true&start=${range.start}&end=${range.end}`, code, { signal: controller.signal, retry: false })
      .then(data => finish({ entries: data.responses })).catch(() => finish({ error: true }))
    return () => controller.abort()
  }, [code, request, month, attempt, range.start, range.end])
  const changeDay = next => { setDate(next); setEditing(null); setStatus('') }
  const answers = view?.entries?.filter(entry => entry.activityDate === date) ?? []
  const saveEdit = updated => {
    setResult(current => current?.entries ? { ...current, entries: current.entries.map(entry => entry.id === updated.id ? updated : entry) } : current)
    setEditing(null)
    setStatus('Svarens ändringar har sparats.')
    onUpdated(updated)
  }
  return <section className="training-diary-page checkin-history-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <h1>Tidigare incheckningar</h1>
    <p>Välj en dag för att checka in i efterhand eller ändra ett svar.</p>
    <div inert={Boolean(editing)}>
      <DiaryCalendar checkinHistory today={latest} range={range} selectedDay={date}
        entries={(view?.entries ?? []).map(entry => ({ date: entry.activityDate, type: 'checkin' }))}
        onMonthChange={next => { setMonth(next.start.slice(0, 7)); changeDay(null) }} onDay={changeDay} />
    </div>
    {!view && <p role="status">Hämtar incheckningar…</p>}
    {view?.error && <p role="status">Incheckningarna kunde inte hämtas. <button type="button" className="text-button" onClick={() => retry(value => value + 1)}>Försök igen</button></p>}
    {date && view?.entries && <section className="diary-history history-checkin-day" aria-label={formatDay(date)}>
      <div className="diary-section-heading">
        <h2>{formatDay(date)}</h2>
        {!editing && <button type="button" className="primary-button" onClick={() => onStart(date)}>Checka in →</button>}
      </div>
      {status && <p role="status">{status}</p>}
      {answers.length ? answers.map(entry => <article key={entry.id}>
        <div className="diary-section-heading">
          <div><strong>{checkinStatus(entry) || 'Incheckning'}</strong><small>{entry.trainingSlot === 'morning_swim' ? 'Morgon · ' : entry.trainingSlot === 'afternoon_swim' ? 'Eftermiddag / kväll · ' : ''}Känsla {entry.feeling}/5</small></div>
          {!editing && <button type="button" className="secondary-button" onClick={() => { setEditing(entry.id); setStatus('') }}>Ändra svar</button>}
        </div>
        {editing === entry.id && <EditAnswers entry={entry} request={request} code={code} onSave={saveEdit} onCancel={() => setEditing(null)} />}
      </article>) : <p>Inga incheckningar kopplade till din profil den här dagen.</p>}
    </section>}
  </section>
}
