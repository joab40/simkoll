import React, { useEffect, useMemo, useState } from 'react'
import { buildDayIllnessSummary } from '../shared/mild-illness-summary.js'
import { illnessLabel } from '../shared/illness.js'
import { startVisiblePolling } from './visible-refresh.js'
import { apiRequest } from './api-request.js'
import './coach-mild-illness.css'

const dayLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })

export default function CoachMildIllnessCard({ summary, loading = false, error = '', onRetry, onOpenSwimmer, trend }) {
  const content = <div className="coach-mild-content">
      {loading ? <p role="status">Hämtar sjukdomskoll…</p> : error ? <p className="form-error" role="alert">Underlaget kunde inte hämtas. {error}</p> : <>
        {summary.count ? <ul>{summary.swimmers.map(swimmer => <li key={swimmer.profileId}><div><button type="button" className="text-button" onClick={() => onOpenSwimmer(swimmer.profileId)}>{swimmer.emoji} {swimmer.displayName} <span aria-hidden="true">→</span></button><small>{`${swimmer.days} ${swimmer.days === 1 ? 'dag' : 'dagar'}: ${swimmer.dates.map(dayLabel).join(', ')}`}</small>{swimmer.latestDate > swimmer.lastDate && <small>Senaste dagsvar: {swimmer.latestStatus ? illnessLabel(swimmer.latestStatus) : 'Överhoppat'} · {dayLabel(swimmer.latestDate)}</small>}</div></li>)}</ul> : <p>Inga ”Lite känningar”-svar registrerade under perioden.</p>}
        <p className="coach-mild-note">Självrapporterade känningar, även om simmaren har tränat. Inte samma sak som ”Jag känner mig sjuk”. Saknade eller överhoppade svar betyder inte frisk.</p>
      </>}
      {onRetry && <button type="button" className="text-button" onClick={onRetry} disabled={loading}>{error ? 'Försök igen' : 'Uppdatera'}</button>}
    </div>
  return <article><small>Lite känningar</small><strong>{loading || error ? '–' : summary.count} <em>simmare</em></strong>{trend}<span>{error ? 'Underlaget för känningar kunde inte hämtas.' : `${summary.days} dagar med rapporterade känningar under perioden. Varje simmare räknas en gång per dag.`}</span><details><summary>Visa vilka</summary>{content}</details></article>
}

function DayIllnessCard({ title, icon, tone, profiles, loading, error, onRetry, onOpenSwimmer }) {
  const count = profiles.length
  const partial = Boolean(error && count)
  return <details className={`competition-day-group${count ? ` ${tone}` : ''}`}>
    <summary>
      <span aria-hidden="true">{icon}</span><strong>{title}</strong>
      <b>{loading || (error && !count) ? '–' : partial ? `≥${count}` : count}</b>
      <small>{loading ? 'Hämtar sjukdomskoll…' : partial ? 'Delvis underlag · Visa namn' : error ? 'Underlag saknas' : count ? 'Visa namn' : 'Inga rapporter'}</small>
    </summary>
    <div>
      {profiles.map(profile => <article key={profile.id}>
        <span aria-hidden="true">{profile.emoji || '🏊'}</span>
        <button type="button" className="text-button" onClick={() => onOpenSwimmer(profile.id)}>{profile.displayName || profile.username || 'Simmare'} →</button>
      </article>)}
      {error && <small role="alert">{error}</small>}
      {error && <button type="button" className="text-button" onClick={onRetry}>Försök igen</button>}
    </div>
  </details>
}

export function TodayIllnessCards({ code, profiles, dayResponses, date, asOf, onOpenSwimmer, request = apiRequest }) {
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
  const error = !future && !loading ? loaded.error : ''
  const records = !loading && !future && !error ? loaded.records : []
  const summary = useMemo(() => buildDayIllnessSummary(profiles, dayResponses, records, date), [profiles, dayResponses, records, date])
  const onRetry = () => setRevision(value => value + 1)
  const state = { loading, error, onRetry, onOpenSwimmer }
  return <React.Fragment key={date}>
    <DayIllnessCard title="Rapporterad sjukdom" icon="🤒" tone="reported-sick" profiles={summary.sick} {...state} />
    <DayIllnessCard title="Lite känningar" icon="🤧" tone="reported-mild" profiles={summary.mild} {...state} />
  </React.Fragment>
}
