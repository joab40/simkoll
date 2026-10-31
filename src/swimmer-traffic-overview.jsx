import React from 'react'
import { trafficCounts } from '../shared/swimmer-traffic.js'
import './swimmer-traffic-overview.css'

const dayLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function SwimmerTrafficOverview({ profiles, report, loading, error, filter, onFilter, onRefresh }) {
  const counts = trafficCounts(profiles, report), ready = !loading && !error && Boolean(report)
  return <section className="swimmer-traffic-overview" aria-label="Trafikljus och förändring">
    <header><strong>Trafikljus · förändring över tid</strong><button type="button" className="text-button" disabled={loading} onClick={onRefresh}>Uppdatera trafikljus</button></header>
    {ready && <p className="swimmer-traffic-period">{dayLabel(report.range.start)}–{dayLabel(report.range.end)} jämfört med {dayLabel(report.range.previousStart)}–{dayLabel(report.range.previousEnd)} · samma {counts.total} profiler i urvalet</p>}
    {loading ? <p role="status">Hämtar trafikljus och jämförelse…</p> : error ? <p role="alert" className="form-error">{error} Inga ofullständiga antal eller trender visas. Försök med Uppdatera trafikljus.</p> : null}
    <div className="swimmer-traffic-trend-grid">{[['red', '🔴', 'Röda'], ['yellow', '🟡', 'Gula'], ['green', '🟢', 'Gröna']].map(([color, icon, label]) => {
      const delta = counts.current[color] - counts.previous[color], comparable = ready && counts.canCompare
      const change = !comparable ? 'Jämförelse saknas' : delta === 0 ? 'Oförändrat antal' : `${Math.abs(delta)} ${delta > 0 ? 'fler' : 'färre'}`
      return <button type="button" key={color} className={`swimmer-traffic-trend ${color}${filter === color ? ' active' : ''}`} aria-pressed={filter === color} disabled={!ready} onClick={() => onFilter(filter === color ? 'all' : color)}><span className="swimmer-traffic-trend-label">{icon} {label}</span><strong>{ready ? counts.current[color] : '–'}</strong><span className="swimmer-traffic-count-arrow" aria-hidden="true">{!comparable ? '—' : delta > 0 ? '↗' : delta < 0 ? '↘' : '→'}</span><small>{change}{comparable ? ` · tidigare ${counts.previous[color]}` : ''}</small></button>
    })}</div>
    <div className="swimmer-traffic-cohort-actions"><button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>Visa alla</button><button type="button" className={filter === 'unknown' ? 'active' : ''} aria-pressed={filter === 'unknown'} disabled={!ready} onClick={() => onFilter(filter === 'unknown' ? 'all' : 'unknown')}>⚪ Saknar underlag {ready ? counts.current.unknown : '–'}{ready ? ` · tidigare ${counts.previous.unknown}` : ''}</button></div>
    <details><summary>Så läses förändringen</summary><p>Pilen visar antal: ↗ fler, ↘ färre, → lika många. Uppåt betyder inte automatiskt bättre. Sökning och gruppval styr samma profilurval i båda perioderna; färgvalet filtrerar listan men ändrar inte jämförelsegruppen. Testprofiler och avstängda eller ännu inte godkända profiler räknas inte. Saknade uppgifter och nya profiler utan tidigare historik blir grå, inte gröna. När svarstäckningen ändras kan antalen ändras utan att samma simmare mått bättre eller sämre.</p><p>Färgerna bygger på tillgängliga incheckningar och sömn från sju dagar samt planering/genomförande från respektive kalendervecka till jämförelsedagen. Tidigare status räknas om från nu sparad historik, inte från ett arkiv över hur kortet såg ut då. Rättelser kan ändra jämförelsen. Välj Uppdatera trafikljus för att hämta nya uppgifter. Trafikljus är samtalsstöd, inte en diagnos eller ett automatiskt träningsbeslut.</p></details>
  </section>
}
