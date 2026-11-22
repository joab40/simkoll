import React, { useMemo, useState } from 'react'
import { competitionIncludesSwimmer } from '../shared/competition-participation.js'

export default function CompetitionParticipants({ competition, profiles, groupNames, code, request, onSaved, onBusyChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const swimmers = useMemo(() => profiles.filter(profile => !profile.isTestProfile && profile.active !== false)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv')), [profiles])
  const saved = competition.participantOverrides
  const changes = draft?.changes ?? {}
  const count = swimmers.filter(swimmer => competitionIncludesSwimmer(competition, swimmer)).length

  function setChoice(id, value) {
    setFeedback(null)
    setDraft(current => {
      const next = { ...current?.changes }
      if (value === (saved[id] ?? null)) delete next[id]
      else next[id] = value
      return Object.keys(next).length ? { updatedAt: current?.updatedAt ?? competition.updatedAt, changes: next } : null
    })
  }

  async function save(event) {
    event.preventDefault()
    if (disabled || saving || !draft) return
    onBusyChange(true)
    setSaving(true)
    setFeedback(null)
    try {
      const result = await request('/api/workouts', code, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-competition-participants', competitionId: competition.id, ...draft }),
      })
      onSaved(result.competition)
      setDraft(null)
      setFeedback({ text: 'Deltagarna är sparade.' })
    } catch (error) {
      setFeedback({ text: error.message, error: true })
    } finally {
      setSaving(false)
      onBusyChange(false)
    }
  }

  const groupLabel = swimmer => groupNames[swimmer.trainingGroup] || swimmer.trainingGroup || 'Ingen grupp'
  const term = query.trim().toLocaleLowerCase('sv')
  const visible = open ? swimmers.filter(swimmer => `${swimmer.displayName} ${groupLabel(swimmer)}`.toLocaleLowerCase('sv').includes(term)) : []
  return <details className="competition-participants" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><strong>Deltagare</strong>{saved && <span>{count} valda</span>}</summary>
    {open && (saved ? <form onSubmit={save}>
      <p>Berörda grupper är förvalda. Bocka i eller ur enskilda simmare för den här tävlingen.</p>
      <fieldset disabled={saving || disabled}>
        <label className="settings-field">Sök simmare eller grupp
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="competition-participants-list">
          {visible.map(swimmer => {
            const groupDefault = competitionIncludesSwimmer({ targetGroups: competition.targetGroups }, swimmer)
            const override = Object.hasOwn(changes, swimmer.id) ? changes[swimmer.id] : saved[swimmer.id]
            return <div className="competition-participant" key={swimmer.id}>
              <label><input type="checkbox" checked={override ?? groupDefault}
                onChange={event => setChoice(swimmer.id, event.target.checked === groupDefault ? null : event.target.checked)} />
                <span><strong>{swimmer.displayName}</strong><small>{groupLabel(swimmer)}</small></span>
              </label>
              {typeof override === 'boolean' && <button type="button" className="text-button"
                aria-label={`Följ gruppvalet för ${swimmer.displayName}`} onClick={() => setChoice(swimmer.id, null)}>Följ gruppen</button>}
            </div>
          })}
          {!visible.length && <p>{term ? 'Inga simmare matchar sökningen.' : 'Inga aktiva simmare att välja.'}</p>}
        </div>
        <div className="settings-actions">
          <button type="submit" className="primary-button" disabled={!draft} aria-busy={saving}>{saving ? 'Sparar…' : 'Spara deltagare'}</button>
          {draft && <button type="button" className="secondary-button" onClick={() => { setDraft(null); setFeedback(null) }}>Ångra ändringar</button>}
        </div>
      </fieldset>
      {feedback && <p className={feedback.error ? 'form-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </form> : <p>Deltagarlistan kräver databasuppdatering 144.</p>)}
  </details>
}
