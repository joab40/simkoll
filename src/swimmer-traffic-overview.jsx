import React from 'react'
import { trafficCounts } from '../shared/swimmer-traffic.js'
import { FOLLOWUP_RULES } from '../shared/followup-signals.js'
import './swimmer-traffic-overview.css'

const dayLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function SwimmerTrafficOverview({ profiles, report, loading, error, filter, onFilter, onRefresh }) {
  const counts = trafficCounts(profiles, report), ready = !loading && !error && Boolean(report)
  return <section className="swimmer-traffic-overview" aria-label="Trafikljus och förändring">
    <header><div className="swimmer-traffic-heading"><strong>Trafikljus · förändring över tid</strong>{ready && <p className="swimmer-traffic-period">{dayLabel(report.range.start)}–{dayLabel(report.range.end)} jämfört med {dayLabel(report.range.previousStart)}–{dayLabel(report.range.previousEnd)}</p>}</div><button type="button" className="swimmer-traffic-refresh" aria-label="Uppdatera status och fart" title="Uppdatera status och fart" disabled={loading} onClick={onRefresh}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>{loading ? 'Uppdaterar…' : 'Uppdatera'}</button></header>
    {ready && <div className="swimmer-traffic-context"><span>{counts.total} profiler i samma urval</span><small>Träningskänsla 14 dagar · Sjukdom, sömn och RPE 7 dagar</small></div>}
    {ready && report.illnessAvailable === false && <p className="form-error" role="status">Sjukdomskollen saknas – kör SQL 112. Övriga signaler visas, men status och antal kan vara ofullständiga. Saknat svar är inte ett nej.</p>}
    {loading ? <p role="status">Hämtar trafikljus och jämförelse…</p> : error ? <p role="alert" className="form-error">{error} Inga ofullständiga antal eller trender visas. Försök med Uppdatera.</p> : null}
    <div className="swimmer-traffic-trend-grid">{[['red', 'Röda'], ['yellow', 'Gula'], ['green', 'Gröna']].map(([color, label]) => {
      const delta = counts.current[color] - counts.previous[color], comparable = ready && counts.canCompare
      const change = !comparable ? 'Jämförelse saknas' : delta === 0 ? 'Oförändrat antal' : `${Math.abs(delta)} ${delta > 0 ? 'fler' : 'färre'}`
      return <button type="button" key={color} className={`swimmer-traffic-trend ${color}${filter === color ? ' active' : ''}`} aria-pressed={filter === color} disabled={!ready} onClick={() => onFilter(filter === color ? 'all' : color)}><span className="swimmer-traffic-trend-label"><i className="swimmer-traffic-dot" aria-hidden="true" />{label}{filter === color && <span aria-hidden="true">✓</span>}</span><strong>{ready ? counts.current[color] : '–'}</strong><span className="swimmer-traffic-count-arrow" aria-hidden="true">{!comparable ? '—' : delta > 0 ? '↗' : delta < 0 ? '↘' : '→'}</span><small>{change}{comparable ? ` · tidigare ${counts.previous[color]}` : ''}</small></button>
    })}</div>
    <div className="swimmer-traffic-footer"><div className="swimmer-traffic-cohort-actions"><button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>Visa alla</button><button type="button" className={filter === 'unknown' ? 'active' : ''} aria-pressed={filter === 'unknown'} disabled={!ready} onClick={() => onFilter(filter === 'unknown' ? 'all' : 'unknown')}><i className="swimmer-traffic-dot unknown" aria-hidden="true" />Saknar underlag <b>{ready ? counts.current.unknown : '–'}</b>{ready && <small>· tidigare {counts.previous.unknown}</small>}</button></div>
    <details><summary>Så läses förändringen</summary><p>Träningskänsla: 14 dagar · sjukdom/sömn/RPE: 7 dagar. Tvåor ger ingen varning i sig.</p><p>Pilen visar antal: ↗ fler, ↘ färre, → lika många. Uppåt betyder inte automatiskt bättre. Sökning och gruppval styr samma profilurval i båda perioderna; färgvalet filtrerar listan men ändrar inte jämförelsegruppen. Testprofiler och avstängda eller ännu inte godkända profiler räknas inte. Saknade uppgifter och nya profiler utan tidigare historik blir grå, inte gröna. När svarstäckningen ändras kan antalen ändras utan att samma simmare mått bättre eller sämre.</p><p>{FOLLOWUP_RULES}</p><p>Tidigare status räknas om från nu sparad historik, inte från ett arkiv över hur kortet såg ut då. Även den jämförda perioden använder de nya reglerna. Rättelser kan ändra jämförelsen. Välj Uppdatera status och fart för nytt underlag.</p></details>
    </div>
  </section>
}
