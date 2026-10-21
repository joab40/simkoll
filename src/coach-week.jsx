import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildCoachWeek, coachWeekAddDays, coachWeekMonday } from '../shared/coach-week.js'
import './coach-week.css'

const dateLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })
const weekday = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'short' }).replace('.', '')
const FILTERS = [{ key: 'all', label: 'Alla' }, { key: 'planned', label: 'Planerat' }, { key: 'unplanned', label: 'Ej planerat' }, { key: 'completed', label: 'Genomfört' }]

export default function CoachWeek({ profiles, asOf, code, request, onOpenSwimmer }) {
  const [start, setStart] = useState(() => coachWeekMonday(asOf)), [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  const [selectedKey, setSelectedKey] = useState(null), [filter, setFilter] = useState('all'), [search, setSearch] = useState('')
  const detailHeading = useRef(null)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    request(`/api/training?coachWeek=${start}`, code).then((result) => { if (active) setData(result) }).catch((failure) => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, start, refresh, request])
  const week = useMemo(() => buildCoachWeek(profiles, data || {}, start), [profiles, data, start])
  const selected = week.cells.find((cell) => cell.key === selectedKey)
  const selectedSlot = week.slots.find((slot) => slot.key === selected?.slot)
  const entries = (selected?.entries || []).filter((entry) => (filter === 'all' || (filter === 'unplanned' ? !entry.planned : entry[filter])) && entry.displayName.toLocaleLowerCase('sv-SE').includes(search.trim().toLocaleLowerCase('sv-SE')))
  const choose = (cell) => { setSelectedKey(cell.key); setFilter('all'); setSearch('') }
  useEffect(() => { if (selectedKey && !loading && !error) detailHeading.current?.focus({ preventScroll: false }) }, [selectedKey, loading, error])
  const changeWeek = (next) => { setStart(next); setSelectedKey(null); setSearch(''); setFilter('all') }

  return <section className="coach-week" aria-labelledby="coach-week-heading">
    <header className="coach-week-header"><div><p className="eyebrow">Gruppens veckoplanering</p><h2 id="coach-week-heading">Planerat och genomfört</h2><p>{dateLabel(start)}–{dateLabel(coachWeekAddDays(start, 6))} · {week.profileCount} simmare i valda grupper</p></div>
      <div className="coach-week-navigation"><button type="button" className="secondary-button" aria-label="Föregående vecka" onClick={() => changeWeek(coachWeekAddDays(start, -7))}>←</button><button type="button" className="secondary-button" onClick={() => changeWeek(coachWeekMonday(asOf))}>Denna vecka</button><button type="button" className="secondary-button" aria-label="Nästa vecka" onClick={() => changeWeek(coachWeekAddDays(start, 7))}>→</button><button type="button" className="text-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Uppdatera</button></div>
    </header>
    <p className="coach-week-help">◆ Planerat i veckoplanen · ✓ Genomfört eller närvaromarkerat. Tryck på en ruta för namn och incheckningar.</p>
    {loading ? <p role="status">Hämtar veckans planering och närvaro…</p> : error ? <p className="form-error" role="alert">{error}</p> : !week.profileCount ? <p className="empty">Inga simmare i valda grupper.</p> : <>
      <p className="coach-week-mobile-hint">Svep i sidled för att se hela veckan →</p>
      <div className="coach-week-scroll" tabIndex={0} role="region" aria-label="Veckomatris. Rulla i sidled för alla dagar.">
        <table className="coach-week-grid"><thead><tr><th scope="col">Pass</th>{week.days.map((date) => <th scope="col" key={date} className={date === asOf ? 'is-today' : ''}><span>{weekday(date)}</span><small>{Number(date.slice(-2))}{date === asOf ? ' · idag' : ''}</small></th>)}</tr></thead>
          <tbody>{week.slots.map((slot) => <tr key={slot.key}><th scope="row"><span aria-hidden="true">{slot.icon}</span>{slot.label}</th>{week.cells.filter((cell) => cell.slot === slot.key).map((cell) => <td key={cell.key}><button type="button" className={`coach-week-cell${cell.planned ? ' has-plans' : ''}${cell.completed ? ' has-completed' : ''}`} aria-pressed={selectedKey === cell.key} aria-label={`${weekday(cell.date)} ${dateLabel(cell.date)}, ${slot.label}: ${cell.planned} planerat, ${cell.completed} genomfört, ${cell.unplanned} ej planerat. Visa namn.`} onClick={() => choose(cell)}><span className="coach-week-cell-counts"><span title="Planerat i veckoplanen">◆ <b>{cell.planned}</b></span><span title="Genomfört eller närvaromarkerat">✓ <b>{cell.completed}</b></span></span><small>{cell.unplanned} ej plan.</small></button></td>)}</tr>)}</tbody>
        </table>
      </div>
      <small className="coach-week-help">Planerat och genomfört räknas var för sig. Samma simmare kan ingå i båda talen. ”Ej planerat” betyder att passet saknar markering i simmarens veckoplan.</small>
      {selected && <section className="coach-week-detail" aria-labelledby="coach-week-detail-heading"><header><div><p className="eyebrow">{weekday(selected.date)} {dateLabel(selected.date)}</p><h3 id="coach-week-detail-heading" ref={detailHeading} tabIndex={-1}>{selectedSlot.icon} {selectedSlot.label}{selectedSlot.type === 'swim' ? ' · simning' : ''}</h3></div><button type="button" className="text-button" onClick={() => { setSelectedKey(null); document.querySelector('.coach-week-cell[aria-pressed="true"]')?.focus() }}>Stäng ×</button></header>
        <div className="coach-week-filters" aria-label="Filtrera simmare">{FILTERS.map(({ key, label }) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <b>{key === 'all' ? selected.entries.length : selected[key]}</b></button>)}<label>Sök simmare<input type="search" value={search} placeholder="Namn…" onChange={(event) => setSearch(event.target.value)} /></label></div>
        <div className="coach-week-people"><div className="coach-week-list-heading" aria-hidden="true"><span>Simmare</span><span>Veckoplan</span><span>Status för passet</span></div>{entries.map((entry) => <article key={entry.profileId}><button type="button" className="coach-week-person" onClick={() => onOpenSwimmer(entry.profileId)}><span aria-hidden="true">{entry.emoji}</span><strong>{entry.displayName}</strong><span aria-hidden="true">→</span></button><span className={`coach-week-plan-label${entry.planned ? ' planned' : ''}`}>{entry.planned ? '◆ Planerat' : 'Ej planerat'}</span><div className="coach-week-person-status"><strong className={entry.completed ? 'is-completed' : ''}>{entry.completed ? '✓ ' : ''}{entry.status}</strong>{entry.source && <small>{entry.source}</small>}</div></article>)}{!entries.length && <p className="empty">Inga simmare matchar filtret.</p>}</div>
      </section>}
    </>}
  </section>
}
