import React, { useId, useState } from 'react'
import { competitionEntryFilterOptions, competitionEntryFilterMatch } from '../shared/competition-entry-filter.js'
import './competition-entry-choices.css'

const genderLabels = { Dam: 'Damer', Herr: 'Herrar', Mix: 'Mix' }

export default function CompetitionEntryChoices({ events, selected, onChange }) {
  const [filter, setFilter] = useState({ enabled: false, gender: '', ageClass: '' })
  const id = useId(), options = competitionEntryFilterOptions(events)
  const hasOptions = options.genders.length > 0 || options.ageClasses.length > 0
  const rows = events.map(event => ({ event, ...competitionEntryFilterMatch(event, filter) }))
  const selectable = rows.filter(row => row.event.selectable !== false)
  const dimmed = selectable.filter(row => row.dimmed).length
  const unknown = selectable.filter(row => row.unknown && !row.dimmed).length
  const outsideSelection = selectable.filter(row => row.dimmed && selected.includes(row.event.id)).length
  const toggle = event => onChange(selected.includes(event.id) ? selected.filter(value => value !== event.id) : [...selected, event.id])
  return <>
    {hasOptions && <div className="competition-entry-filter">
      <label className="competition-entry-filter-toggle"><input type="checkbox" checked={filter.enabled} aria-controls={`${id}-fields`} onChange={event => setFilter(current => ({ ...current, enabled: event.target.checked }))} /><span><strong>Anpassa grenlistan</strong><small>Välj klass och åldersklass från tävlingsprogrammet.</small></span></label>
      {filter.enabled && <div id={`${id}-fields`}>
        <div className="competition-entry-filter-fields">
          {options.genders.length > 0 && <label>Klass / kön<select value={filter.gender} onChange={event => setFilter(current => ({ ...current, gender: event.target.value }))}><option value="">Alla klasser</option>{options.genders.map(value => <option key={value} value={value}>{genderLabels[value]}</option>)}</select></label>}
          {options.ageClasses.length > 0 && <label>Ålder / åldersklass<select value={filter.ageClass} onChange={event => setFilter(current => ({ ...current, ageClass: event.target.value }))}><option value="">Alla åldersklasser</option>{options.ageClasses.map(value => <option key={value}>{value}</option>)}</select></label>}
        </div>
        <p role="status" aria-live="polite">{dimmed} av {selectable.length} grenar är nedtonade.{unknown > 0 && ` ${unknown} ${unknown === 1 ? 'gren saknar' : 'grenar saknar'} filteruppgifter och visas utan nedtoning.`}{outsideSelection > 0 && ` ${outsideSelection} ${outsideSelection === 1 ? 'vald gren ligger' : 'valda grenar ligger'} utanför filtret och är kvar i ditt val.`}</p>
        <small>Filtret är bara ett visningsstöd. Nedtonade grenar går fortfarande att välja. Kontrollera åldersregler och behörighet i PM.</small>
      </div>}
    </div>}
    <div className="competition-entry-list">{rows.map(({ event, dimmed, unknown }) => {
      const checked = event.selectable !== false && selected.includes(event.id)
      return <label key={event.id} className={[event.selectable === false && 'competition-info-row', dimmed && 'competition-entry-dimmed', checked && 'competition-entry-selected'].filter(Boolean).join(' ')}>
        <input type="checkbox" disabled={event.selectable === false} checked={checked} onChange={() => event.selectable !== false && toggle(event)} />
        <span><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender || 'Alla'} · {event.ageClass || 'Klass ej angiven – se PM'}</small>{dimmed && <small className="competition-entry-filter-note">{checked ? 'Vald · utanför filtret' : 'Utanför filtret'}</small>}{unknown && !dimmed && <small className="competition-entry-filter-note">Filteruppgift saknas · se PM</small>}</span>
      </label>
    })}</div>
  </>
}
