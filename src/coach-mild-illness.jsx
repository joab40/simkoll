import React, { useEffect, useMemo, useState } from 'react'
import { buildMildIllnessSummary } from '../shared/mild-illness-summary.js'
import { illnessLabel } from '../shared/illness.js'
import { startVisiblePolling } from './visible-refresh.js'
import { apiRequest } from './api-request.js'
import './coach-mild-illness.css'

const dayLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function CoachMildIllnessCard({ summary, period = 'day', loading = false, error = '', onRetry, onOpenSwimmer }) {
  const week = period === 'week'
  return <details className={`coach-mild-illness${summary.count && !loading && !error ? ' has-reports' : ''}`}>
    <summary><span className="coach-mild-icon" aria-hidden="true">🤧</span><span className="coach-mild-heading"><strong>Lite känningar</strong><small>{loading ? 'Hämtar sjukdomskoll…' : error ? 'Underlag saknas' : week ? `Rapporterat ${dayLabel(summary.start)}–${dayLabel(summary.end)}` : `Rapporterat ${dayLabel(summary.end)}`}</small></span><span className="coach-mild-count"><strong>{loading || error ? '–' : summary.count}</strong><small>simmare</small></span><span className="coach-mild-chevron" aria-hidden="true">⌄</span></summary>
    <div className="coach-mild-content">
      {loading ? <p role="status">Hämtar sjukdomskoll…</p> : error ? <p className="form-error" role="alert">Underlaget kunde inte hämtas. {error}</p> : <>
        {summary.count ? <ul>{summary.swimmers.map(swimmer => <li key={swimmer.profileId}><div><button type="button" className="text-button" onClick={() => onOpenSwimmer(swimmer.profileId)}>{swimmer.emoji} {swimmer.displayName} <span aria-hidden="true">→</span></button><small>{week ? `${swimmer.days} ${swimmer.days === 1 ? 'dag' : 'dagar'}: ${swimmer.dates.map(dayLabel).join(', ')}` : `Lite känningar · ${dayLabel(swimmer.lastDate)}`}</small>{week && swimmer.latestDate > swimmer.lastDate && <small>Senaste dagsvar: {swimmer.latestStatus ? illnessLabel(swimmer.latestStatus) : 'Överhoppat'} · {dayLabel(swimmer.latestDate)}</small>}</div></li>)}</ul> : <p>Inga ”Lite känningar”-svar registrerade {week ? 'under perioden' : 'för valt datum'}.</p>}
        <p className="coach-mild-note">Självrapporterade känningar, även om simmaren har tränat. Inte samma sak som ”Jag känner mig sjuk”. Saknade eller överhoppade svar betyder inte frisk.</p>
      </>}
      {onRetry && <button type="button" className="text-button" onClick={onRetry} disabled={loading}>{error ? 'Försök igen' : 'Uppdatera'}</button>}
    </div>
  </details>
}

export function TodayMildIllness({ code, profiles, date, asOf, onOpenSwimmer, request = apiRequest }) {
  const [loaded, setLoaded] = useState(null), [revision, setRevision] = useState(0)
  const key = `${code}|${date}|${revision}`
  const future = date > asOf
  useEffect(() => {
    let active = true
    if (future) return () => { active = false }
    const stop = startVisiblePolling(async () => {
      try {
        const result = await request(`/api/responses?illness=true&start=${date}&end=${date}`, code)
        if (active) setLoaded({ key, records: result.records || [], error: result.available === false ? result.warning || 'Sjukdomskollen är inte tillgänglig.' : '' })
      } catch (error) { if (active) setLoaded({ key, records: [], error: error.message || 'Försök igen.' }) }
    }, 30000)
    return () => { active = false; stop() }
  }, [code, date, key, future, request])
  const loading = !future && loaded?.key !== key
  const records = !loading && !future ? loaded.records : []
  const summary = useMemo(() => buildMildIllnessSummary(profiles, records, date, date), [profiles, records, date])
  return <CoachMildIllnessCard key={date} summary={summary} loading={loading} error={!future && !loading ? loaded.error : ''} onRetry={() => setRevision(value => value + 1)} onOpenSwimmer={onOpenSwimmer} />
}
