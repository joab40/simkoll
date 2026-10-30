import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { strengthPasses, strengthExercises } from '../shared/strength-program.js'
import { SwimmerExerciseImage } from './strength-exercise-images.jsx'
import './dryland-program.css'

const localDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const monday = (day) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10) }

export function DrylandHistory({ logs = [], sessions = [], profileId }) {
  const own = logs.filter((log) => !profileId || log.profileId === profileId).slice().sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || String(b.completedAt).localeCompare(String(a.completedAt)))
  return <details className="dryland-history"><summary>Landträningshistorik ({own.length})</summary>{own.length ? own.slice(0, 30).map((log) => {
    const registered = sessions.some((session) => session.type === 'dryland' && session.date === log.sessionDate && (!log.profileId || session.profileId === log.profileId))
    return <article key={log.id}><h4>{log.programTitle || 'Landträningsprogram'} · {log.passTitle || `Pass ${log.passNumber}`}</h4><small>{log.sessionDate} · {registered ? 'Landträning registrerad' : 'Resultat sparat · dagen är inte markerad som genomförd'}</small>{Object.entries(log.results).map(([key, value]) => <p key={key}><strong>{value.completed ? '✓' : '–'} {key}</strong>{value.result && <span> · {value.result}</span>}</p>)}{log.notes && <p>{log.notes}</p>}<details><summary>Instruktioner vid registreringen</summary><pre>{log.passContent}</pre></details></article>
  }) : <p>Inga landpass med övningsresultat har sparats ännu.</p>}{own.length > 30 && <small>Visar de senaste 30 registreringarna. Äldre registreringar finns i träningsdagboken.</small>}</details>
}

export function DrylandProgramRunner({ assignment, logs = [], sessions = [], code, request = apiRequest, onSaved, onBusyChange, today = localDay() }) {
  const [selected, setSelected] = useState(null), [results, setResults] = useState({}), [notes, setNotes] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('')
  const running = useRef(false), active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const passes = strengthPasses(assignment.program), own = logs.filter((log) => log.assignmentId === assignment.id)
  const registered = (date) => sessions.some((s) => s.type === 'dryland' && s.date === date && (!assignment.profileId || s.profileId === assignment.profileId))
  const completed = (pass) => own.some((log) => log.passNumber === pass.passNumber && log.sessionDate >= monday(today) && log.sessionDate <= today && registered(log.sessionDate))
  const pass = passes.find((p) => p.passNumber === selected)
  const previous = pass && own.filter((log) => log.passNumber === pass.passNumber && log.sessionDate < today).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]
  const open = (p) => { const saved = own.find((log) => log.passNumber === p.passNumber && log.sessionDate === today); setSelected(p.passNumber); setResults(saved?.results || {}); setNotes(saved?.notes || ''); setConfirmed(Boolean(saved && registered(today))); setStatus('') }
  const save = async (event) => {
    event.preventDefault(); if (running.current || !pass || !confirmed) return
    running.current = true; setBusy(true); onBusyChange?.(true); setStatus('Sparar landpasset…')
    try {
      await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log-dryland-pass', assignmentId: assignment.id, passNumber: pass.passNumber, sessionDate: today, completed: confirmed, results, notes }) })
      if (active.current) setStatus('✓ Landpasset och resultaten är sparade. Dagens landträning räknas en gång.')
      try { await onSaved?.() } catch { if (active.current) setStatus('✓ Passet sparades, men vyn kunde inte uppdateras. Öppna programmet igen för aktuellt läge.') }
    } catch (error) { if (active.current) setStatus(error.message) }
    finally { running.current = false; if (active.current) { setBusy(false); onBusyChange?.(false) } }
  }
  return <div className="dryland-runner"><p>Välj ett landpass. Registrera genomförande och valfria resultat – mer eller längre är inte automatiskt bättre.</p>
    {registered(today) && <p className="dryland-note">Landträning är redan registrerad idag. Resultat här ger inte ett extra pass i veckosummeringen.</p>}
    <div className="strength-pass-picker">{passes.map((p) => <button key={p.passNumber} type="button" disabled={busy} aria-pressed={selected === p.passNumber} className={selected === p.passNumber ? 'selected' : completed(p) ? 'completed' : ''} onClick={() => open(p)}>{completed(p) ? '✓ ' : ''}Pass {p.passNumber}<small>{p.title}</small></button>)}</div>
    {pass && <form className="dryland-pass-form" onSubmit={save}><fieldset disabled={busy}><div className="strength-pass-form-heading"><h3>{pass.title}</h3><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Stäng passet</button></div><p>Markera de övningar du gjorde. Resultat kan vara repetitioner, sekunder eller meter. Lämna tomt när du bara vill registrera genomförandet.</p>
      {previous && <small>Senast registrerat för detta pass: {previous.sessionDate}. Jämför bara likvärdiga förutsättningar.</small>}
      <div className="dryland-exercises">{strengthExercises(pass.content).map((exercise, index) => {
        const value = results[exercise.resultKey] || { completed: false, result: '' }, before = previous?.results?.[exercise.resultKey]
        const update = (change) => setResults((current) => ({ ...current, [exercise.resultKey]: { ...value, ...change } }))
        return <article key={exercise.resultKey}><h4>{index + 1}. {exercise.name}</h4><p>{exercise.dosage}</p>{exercise.instructions && <p>{exercise.instructions}</p>}<SwimmerExerciseImage name={exercise.name} image={assignment.program.exerciseImages?.find((image) => image.passNumber === pass.passNumber && image.exerciseIndex === index && image.exerciseName === exercise.name)} />
          <label className="dryland-completed"><input type="checkbox" checked={value.completed} onChange={(e) => update({ completed: e.target.checked })} />Genomfört {exercise.name}</label>
          <label>Resultat för {exercise.name} (valfritt)<input maxLength={100} value={value.result} placeholder="t.ex. 8 reps · 30 sek · 20 m" onChange={(e) => update({ result: e.target.value })} /></label>{before && <small>Senast: {before.completed ? 'genomfört' : 'inte markerat'}{before.result && ` · ${before.result}`}</small>}
        </article>
      })}</div>
      <details className="strength-full-content"><summary>Visa hela passet</summary><pre>{pass.content}</pre></details>
      <label>Kommentar (valfritt)<textarea maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vad fungerade och vad vill du ta med till nästa gång?" /></label>
      <label className="dryland-completed"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required />Jag har genomfört landträning idag, {today}.</label>
      <button type="submit" className="primary-button" disabled={!confirmed}>{busy ? 'Sparar…' : 'Spara landpass och resultat ✓'}</button>
    </fieldset>{status && <p className="dryland-status" role="status">{status}</p>}</form>}
  </div>
}

export default function DrylandProgramPage({ code, onTrainingChange, onBack, request = apiRequest }) {
  const [training, setTraining] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const active = useRef(true)
  const load = async () => { const data = await request('/api/training', code); if (active.current) { setTraining(data); setError(''); onTrainingChange?.(data) } }
  useEffect(() => { active.current = true; load().catch((e) => { if (active.current) setError(e.message) }); return () => { active.current = false } }, [code])
  const assignments = training?.assignments?.filter((a) => a.program.type === 'dryland') || []
  return <div className="goals-page strength-program-page dryland-program-page"><button type="button" className="back-button" disabled={busy} onClick={onBack}>← Tillbaka</button><div className="goals-content"><p className="eyebrow">Från tränarna</p><h1>Mina landträningsprogram 🤸</h1>
    {error && <p role="alert">{error} <button type="button" className="secondary-button" onClick={() => load().catch((e) => setError(e.message))}>Försök igen</button></p>}
    {!training && !error && <p role="status">Hämtar landträningsprogram…</p>}
    {training && <>{training.drylandLogsAvailable === false && <p role="alert">Resultatloggen kunde inte hämtas. Kontrollera SQL 111_dryland_program_logs eller försök igen. Du kan läsa programmen; tidigare resultat visas inte just nu.</p>}
      <section className="assigned-programs">{assignments.map((assignment) => <article key={assignment.id}><header><span>🤸</span><div><strong>{assignment.program.title}</strong><small>Landträning</small></div></header><p>{assignment.program.description}</p><DrylandProgramRunner assignment={assignment} logs={training.drylandLogs || []} sessions={training.sessions || []} code={code} request={request} onSaved={load} onBusyChange={setBusy} /></article>)}</section>
      {!assignments.length && <p className="empty">Du har inget landträningsprogram tilldelat just nu. Fråga din tränare.</p>}
      <DrylandHistory logs={training.drylandLogs || []} sessions={training.sessions || []} />
    </>}
  </div></div>
}
