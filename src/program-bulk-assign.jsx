import React, { useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { programKind } from '../shared/program-kind.js'

export default function ProgramBulkAssign({ programs, profiles, programType, code, onChanged, request = apiRequest }) {
  const [programId, setProgramId] = useState(''), [selected, setSelected] = useState([]), [busy, setBusy] = useState(false), [status, setStatus] = useState('')
  const running = useRef(false), kind = programKind(programType)
  const save = async (event) => {
    event.preventDefault(); if (running.current || !programId || !selected.length) return
    const targets = selected.filter((id) => profiles.some((p) => p.id === id))
    if (!targets.length || !window.confirm(`Tilldela ${kind.name} till ${targets.length} simmare? Deras tidigare program av samma typ ersätts; historiken behålls.`)) return
    running.current = true; setBusy(true); setStatus('Tilldelar program…')
    const failed = [], done = []
    try {
      for (const id of targets) {
        try { await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign', type: programType, programId, profileId: id }) }); done.push(id) } catch { failed.push(id) }
      }
      setSelected(failed); setStatus(`${done.length} tilldelningar sparade.${failed.length ? ` ${failed.length} misslyckades och är fortsatt markerade för nytt försök.` : ' ✓'}`)
      try { await onChanged?.() } catch { setStatus((s) => `${s} Listan kunde inte uppdateras; öppna sidan igen för aktuellt läge.`) }
    } finally { running.current = false; setBusy(false) }
  }
  return <details className="coach-card program-bulk-assign"><summary>Tilldela samma {kind.name} till flera simmare</summary><form onSubmit={save}><fieldset disabled={busy}><label>Program<select required value={programId} onChange={(e) => setProgramId(e.target.value)}><option value="">Välj program…</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}</select></label><button type="button" className="secondary-button" onClick={() => setSelected(profiles.map((p) => p.id))}>Markera alla i valda grupper</button><div className="profile-checks">{profiles.map((p) => <label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected((current) => current.includes(p.id) ? current.filter((id) => id !== p.id) : [...current, p.id])} />{p.emoji} {p.displayName}</label>)}</div><button type="submit" className="primary-button" disabled={!programId || !selected.length}>{busy ? 'Tilldelar…' : `Tilldela ${selected.length} simmare`}</button></fieldset></form>{status && <p role="status">{status}</p>}</details>
}
