import React, { useState } from 'react'
import './swimmer-training-times-card.css'

const SwimTimes = React.lazy(() => import('./swim-times.jsx'))

export default function SwimmerTrainingTimesCard({ profile, code, request }) {
  const [visited, setVisited] = useState(false), [dirty, setDirty] = useState(false)
  return <details className="swimmer-training-times-card" onToggle={(event) => {
    if (!event.currentTarget.open && dirty && !window.confirm('Du har en osparad träningstid. Stäng utan att spara?')) {
      event.currentTarget.open = true
      return
    }
    setVisited(event.currentTarget.open)
  }}>
    <summary><span className="swimmer-time-icon" aria-hidden="true">⏱️</span><span><strong>Träningstider och testlopp</strong><small>Visa historik, jämför och rätta tider för {profile.displayName}</small></span><span className="swimmer-time-expand" aria-hidden="true" /></summary>
    {visited && <React.Suspense fallback={<p className="swimmer-times-loading" role="status">Hämtar träningstider…</p>}><SwimTimes code={code} request={request} profileId={profile.id} coachView onDirty={(_key, value) => setDirty(value)} /></React.Suspense>}
  </details>
}
