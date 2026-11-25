import React, { useRef, useState } from 'react'
import { competitionEntryProgress } from '../shared/competition-entry-status.js'
import './competition-entry-progress.css'

export default function CompetitionEntryProgress({ roster, entries, available, entriesOpen, onRemind }) {
  if (!available || !Array.isArray(roster)) return <p className="competition-progress-unavailable" role="status">Översikten över saknade grenval kunde inte hämtas. Inga simmare markeras som saknade. Försök uppdatera igen.</p>
  const progress = competitionEntryProgress(roster, entries)
  return <section className="competition-progress" aria-label="Status för grenanmälan">
    <div className="competition-progress-heading"><div><p className="eyebrow">Grenanmälan · överblick</p><h2>{progress.total ? `${progress.submitted} av ${progress.total} har skickat in` : 'Inga aktiva simmare i tävlingens grupper'}</h2></div>{progress.total > 0 && <span className={`competition-progress-total${progress.pending.length ? '' : ' complete'}`}>{progress.pending.length ? `${progress.pending.length} kvar` : 'Alla har skickat in'}</span>}</div>
    {progress.total > 0 && <><progress value={progress.submitted} max={progress.total} aria-label={`${progress.submitted} av ${progress.total} simmare har skickat in sina grenar`} /><p className="competition-progress-counts"><span>{progress.drafts} med utkast</span><span>{progress.missing} utan sparade grenval</span></p></>}
    <p className="competition-progress-note">Aktiva simmare i tävlingens grupper, inte bekräftade deltagare. Utkast räknas inte som inskickade. {!entriesOpen && 'Grenanmälan är stängd just nu.'}</p>
    {progress.pending.length > 0 && <details><summary>Visa vilka som inte skickat in <span aria-hidden="true">({progress.pending.length})</span></summary><ul>{progress.pending.map(profile => <PendingSwimmer key={profile.id} profile={profile} onRemind={onRemind} />)}</ul></details>}
  </section>
}

function PendingSwimmer({ profile, onRemind }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const sending = useRef(false)
  const requestId = useRef(null)
  const send = async () => {
    if (sending.current || state === 'sent') return
    sending.current = true
    setState('sending')
    setError('')
    try {
      requestId.current ??= crypto.randomUUID()
      await onRemind(profile.id, requestId.current)
      setState('sent')
    } catch (failure) {
      setError(failure.message || 'Påminnelsen kunde inte skickas. Försök igen.')
      setState('idle')
    } finally {
      sending.current = false
    }
  }
  return <li>
    <div className="competition-progress-swimmer">
      <span className="competition-progress-name"><span aria-hidden="true">{profile.emoji}</span> {profile.name}</span>
      <span className={`competition-progress-status ${profile.status}`}>{profile.status === 'draft' ? 'Utkast sparat' : 'Inget sparat'}</span>
    </div>
    {onRemind && (state === 'sent'
      ? <span className="competition-progress-reminded" role="status">✓ Påminnelse skickad</span>
      : <button type="button" className="secondary-button competition-progress-remind" aria-label={`Skicka påminnelse till ${profile.name}`}
          onClick={send} disabled={state === 'sending'}>{state === 'sending' ? 'Skickar…' : 'Påminn'}</button>)}
    {error && <small className="competition-progress-error" role="alert">{error}</small>}
  </li>
}
