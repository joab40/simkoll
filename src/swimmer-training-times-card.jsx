import React, { useCallback, useEffect, useState } from 'react'
import './swimmer-training-times-card.css'
import SwimmerCardSummary, { DirectionExplanation } from './swimmer-card-summary.jsx'
import { directionDay, directionUnavailable, swimTimesDirection } from '../shared/swimmer-card-direction.js'

const SwimTimes = React.lazy(() => import('./swim-times.jsx'))

export default function SwimmerTrainingTimesCard({ profile, code, request }) {
  const [visited, setVisited] = useState(false), [dirty, setDirty] = useState(false)
  const [initialRange] = useState(() => { const end = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()); return { start: directionDay(end, -89), end } })
  const [timeData, setTimeData] = useState(null)
  const [prefetchReady, setPrefetchReady] = useState(false)
  useEffect(() => {
    let active = true
    setTimeData(null); setPrefetchReady(false)
    request(`/api/training?swimTimes=true&start=${initialRange.start}&end=${initialRange.end}&profileId=${encodeURIComponent(profile.id)}`, code).then((data) => { if (active) setTimeData({ rows: data.times || [], limited: data.limited === true, loading: false, error: '', profileId: profile.id, periodKey: `${initialRange.start}:${initialRange.end}` }) }).catch(() => { if (active) setTimeData({ error: 'Tiderna kunde inte hämtas', profileId: profile.id }) }).finally(() => { if (active) setPrefetchReady(true) })
    return () => { active = false }
  }, [profile.id, code, initialRange.start, initialRange.end, request])
  const onData = useCallback((data) => setTimeData({ ...data, profileId: profile.id }), [profile.id])
  const currentData = timeData?.profileId === profile.id ? timeData : null
  const direction = !currentData || currentData.loading ? directionUnavailable('Hämtar riktning…') : currentData.error ? directionUnavailable('Riktningen kunde inte hämtas') : swimTimesDirection(currentData.rows, currentData.limited)
  return <details className="swimmer-training-times-card swimmer-disclosure" onToggle={(event) => {
    if (!event.currentTarget.open && dirty && !window.confirm('Du har en osparad träningstid. Stäng utan att spara?')) {
      event.currentTarget.open = true
      return
    }
    setVisited(event.currentTarget.open)
  }}>
    <SwimmerCardSummary icon="⏱️" title="Träningstider och testlopp" description={`Visa historik, jämför och rätta tider för ${profile.displayName}`} direction={direction} />
    {visited && (prefetchReady ? <><div className="swimmer-times-direction-note"><DirectionExplanation direction={direction} /></div><React.Suspense fallback={<p className="swimmer-times-loading" role="status">Hämtar träningstider…</p>}><SwimTimes key={profile.id} code={code} request={request} profileId={profile.id} coachView initialRange={initialRange} initialData={currentData} onData={onData} onDirty={(_key, value) => setDirty(value)} /></React.Suspense></> : <p className="swimmer-times-loading" role="status">Hämtar träningstider…</p>)}
  </details>
}
