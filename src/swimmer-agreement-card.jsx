import React, { useEffect, useState } from 'react'
import { agreementDayLabel, agreementPlainText } from '../shared/swimmer-agreement.js'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './swimmer-agreement-card.css'

export default function SwimmerAgreementCard({ profile, code, request, onOpenTalk }) {
  const [refresh, setRefresh] = useState(0), [result, setResult] = useState(null)
  const key = `${code}:${profile.id}:${refresh}`
  useEffect(() => {
    let active = true
    request(`/api/goals?agreementCard=true&profileId=${encodeURIComponent(profile.id)}`, code).then((data) => {
      if (!data || !Object.hasOwn(data, 'talk') || (data.talk !== null && (!data.talk || typeof data.talk !== 'object' || data.talk.swimmerId !== profile.id || data.talk.status !== 'completed' || typeof data.talk.text !== 'string' || !data.talk.text.trim() || !data.talk.id))) throw new Error('Samtalsunderlaget stämmer inte med simmaren. Försök igen.')
      if (active) setResult({ key, talk: data.talk || null })
    }).catch((error) => { if (active) setResult({ key, error: error.message || 'Överenskommelsen kunde inte hämtas.' }) })
    return () => { active = false }
  }, [code, profile.id, request, key])
  const loading = result?.key !== key, talk = !loading && !result.error ? result.talk : null
  const description = loading ? 'Hämtar…' : result.error ? 'Kunde inte hämtas' : talk ? `Samtal ${agreementDayLabel(talk.meetingDate)}` : 'Ingen överenskommelse sparad'
  return <details key={`${code}:${profile.id}`} className="swimmer-agreement-card swimmer-disclosure">
    <SwimmerCardSummary icon="🤝" eyebrow="Utvecklingssamtal" title="Vår överenskommelse" description={description} />
    <div className="swimmer-agreement-body">
    {loading ? <p role="status">Hämtar överenskommelsen…</p> : result.error ? <p className="form-error" role="alert">{result.error}</p> : !talk ? <p className="swimmer-agreement-empty">Ingen gemensam överenskommelse från ett genomfört samtal finns sparad ännu.</p> : <>
      <div className="swimmer-agreement-dates"><span>Samtal <time dateTime={talk.meetingDate}>{agreementDayLabel(talk.meetingDate)}</time></span><span>Uppföljning {talk.followUpDate ? <time dateTime={talk.followUpDate}>{agreementDayLabel(talk.followUpDate)}</time> : 'inte bestämd'}</span></div>
      <small className="swimmer-agreement-source">Sparad text från senaste genomförda samtalet med en överenskommelse.</small>
      <p className="swimmer-agreement-text">{agreementPlainText(talk.text)}</p>
    </>}
    <div className="swimmer-agreement-actions"><button type="button" className="text-button" disabled={loading} aria-label={`Uppdatera överenskommelsen för ${profile.displayName}`} onClick={() => setRefresh((value) => value + 1)}>Uppdatera</button>{talk && onOpenTalk && <button type="button" className="secondary-button" onClick={() => onOpenTalk(talk.id)}>Öppna utvecklingssamtalet →</button>}</div>
    </div>
  </details>
}
