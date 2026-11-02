import React, { useEffect, useRef, useState } from 'react'
import { ILLNESS_CHOICES, illnessLabel } from '../shared/illness.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './daily-illness.css'

export function IllnessQuestion({ date, code, request, onContinue, replace = false, initial = null }) {
  const [status, setStatus] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const saving = useRef(false)
  const save = async skipped => {
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    try {
      await request('/api/responses', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-illness', date, status, skipped, replace }) })
      onContinue()
    } catch (reason) { setError(reason.message); saving.current = false; setBusy(false) }
  }
  return <div className="illness-question">
    <p>Frivilligt · {date} · synligt för tränarna. Sparas direkt i din dagbok, separat från träningen.</p>
    <div className="illness-choices" role="group" aria-label="Sjukdomskänsla">{ILLNESS_CHOICES.map(choice => <button type="button" key={choice.value} aria-pressed={status === choice.value} disabled={busy} onClick={() => setStatus(choice.value)}><span aria-hidden="true">{choice.icon}</span><strong>{choice.label}</strong>{status === choice.value && <b aria-hidden="true">✓</b>}</button>)}</div>
    <p className="illness-note">Inte en diagnos. Prata med tränaren vid sjukdomskänningar.</p>
    <div className="illness-actions"><button type="button" className="text-button" disabled={busy} onClick={() => save(true)}>{replace ? 'Ta bort mitt svar' : 'Hoppa över idag'}</button><button type="button" className="primary-button" disabled={busy || !status} onClick={() => save(false)}>{busy ? 'Sparar…' : replace ? 'Spara ändring' : 'Spara och fortsätt →'}</button></div>
    {error && <div role="alert"><p className="form-error">{error}</p>{!replace && <button type="button" className="text-button" disabled={busy} onClick={onContinue}>Fortsätt utan sjukdomskoll</button>}</div>}
  </div>
}

export default function IllnessHistory({ code, request, profileId, start, end }) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
  const from = start || coachWeekAddDays(today, -27), until = end || today
  const [loaded, setLoaded] = useState(null), [retry, setRetry] = useState(0), [editing, setEditing] = useState(null)
  const key = `${code}:${profileId || 'self'}:${from}:${until}:${retry}`
  useEffect(() => { setEditing(null) }, [code, profileId, from, until])
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ illness: 'true', start: from, end: until, ...(profileId ? { profileId } : {}) })
    request(`/api/responses?${params}`, code).then(data => { if (active) setLoaded({ key, records: data.records || [], error: data.available === false ? data.warning : '' }) }).catch(reason => { if (active) setLoaded({ key, records: [], error: reason.message }) })
    return () => { active = false }
  }, [key, code, profileId, from, until, request])
  const loading = loaded?.key !== key, error = !loading && loaded.error, records = loading ? [] : loaded.records
  const latest = records.filter(row => !row.skipped).sort((a, b) => b.activity_date.localeCompare(a.activity_date))[0]
  return <details className="illness-history swimmer-disclosure">
    <SwimmerCardSummary icon="🤧" title="Sjukdomskänningar" description={loading ? 'Hämtar…' : error ? 'Underlag saknas' : latest ? `${illnessLabel(latest.status)} · ${latest.activity_date}` : 'Inga svar i perioden'} />
    <div className="illness-history-content">
      <p>Frivilliga dagsvar, inte diagnoser eller en prognos. Saknade/överhoppade svar betyder inte att simmaren är frisk. Ingen automatisk ändring av träningen görs.</p>
      {error ? <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Försök igen</button></p> : !loading && <>
        <ul>{records.map(row => <li key={row.activity_date}><time>{row.activity_date}</time><span>{row.skipped ? 'Överhoppat' : illnessLabel(row.status)}</span>{!profileId && [today, coachWeekAddDays(today, -1)].includes(row.activity_date) && <button type="button" className="text-button" onClick={() => setEditing(row.activity_date)}>Ändra svar</button>}</li>)}</ul>
        {!profileId && today >= from && today <= until && !records.some(row => row.activity_date === today) && <button type="button" className="secondary-button" onClick={() => setEditing(today)}>Svara för idag</button>}
      </>}
      {!profileId && editing && <section className="illness-edit"><h3>Känner du dig sjuk eller på väg att bli sjuk?</h3><IllnessQuestion key={editing} date={editing} code={code} request={request} replace initial={records.find(row => row.activity_date === editing)?.status || null} onContinue={() => { setEditing(null); setRetry(value => value + 1) }} /><button type="button" className="text-button" onClick={() => setEditing(null)}>Avbryt ändring</button></section>}
      <small>{from}–{until}. Svaret kan ändras för idag och igår i din egen dagbok, även om du redan har checkat in.</small>
    </div>
  </details>
}
