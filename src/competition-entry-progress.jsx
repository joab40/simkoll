import React from 'react'
import { competitionEntryProgress } from '../shared/competition-entry-status.js'
import './competition-entry-progress.css'

export default function CompetitionEntryProgress({ roster, entries, available, entriesOpen }) {
  if (!available || !Array.isArray(roster)) return <p className="competition-progress-unavailable" role="status">Översikten över saknade grenval kunde inte hämtas. Inga simmare markeras som saknade. Försök uppdatera igen.</p>
  const progress = competitionEntryProgress(roster, entries)
  return <section className="competition-progress" aria-label="Status för grenanmälan">
    <div className="competition-progress-heading"><div><p className="eyebrow">Grenanmälan · överblick</p><h2>{progress.total ? `${progress.submitted} av ${progress.total} har skickat in` : 'Inga aktiva simmare i tävlingens grupper'}</h2></div>{progress.total > 0 && <span className={`competition-progress-total${progress.pending.length ? '' : ' complete'}`}>{progress.pending.length ? `${progress.pending.length} kvar` : 'Alla har skickat in'}</span>}</div>
    {progress.total > 0 && <><progress value={progress.submitted} max={progress.total} aria-label={`${progress.submitted} av ${progress.total} simmare har skickat in sina grenar`} /><p className="competition-progress-counts"><span>{progress.drafts} med utkast</span><span>{progress.missing} utan sparade grenval</span></p></>}
    <p className="competition-progress-note">Aktiva simmare i tävlingens grupper, inte bekräftade deltagare. Utkast räknas inte som inskickade. {!entriesOpen && 'Grenanmälan är stängd just nu.'}</p>
    {progress.pending.length > 0 && <details><summary>Visa vilka som inte skickat in <span aria-hidden="true">({progress.pending.length})</span></summary><ul>{progress.pending.map(profile => <li key={profile.id}><span className="competition-progress-name"><span aria-hidden="true">{profile.emoji}</span> {profile.name}</span><span className={`competition-progress-status ${profile.status}`}>{profile.status === 'draft' ? 'Utkast sparat' : 'Inget sparat'}</span></li>)}</ul></details>}
  </section>
}
