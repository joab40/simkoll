import React, { useEffect, useId, useState } from 'react'
import { agreementDayLabel, agreementExcerpt, agreementPlainText } from '../shared/swimmer-agreement.js'
import './swimmer-agreement-card.css'

export default function SwimmerAgreementCard({ profile, code, request, onOpenTalk }) {
  const [refresh, setRefresh] = useState(0), [result, setResult] = useState(null), [expanded, setExpanded] = useState(false)
  const titleId = useId(), textId = useId(), key = `${code}:${profile.id}:${refresh}`
  useEffect(() => {
    let active = true
    setExpanded(false)
    request(`/api/goals?agreementCard=true&profileId=${encodeURIComponent(profile.id)}`, code).then((data) => {
      if (!data || !Object.hasOwn(data, 'talk') || (data.talk !== null && (!data.talk || typeof data.talk !== 'object' || data.talk.swimmerId !== profile.id || data.talk.status !== 'completed' || typeof data.talk.text !== 'string' || !data.talk.text.trim() || !data.talk.id))) throw new Error('Samtalsunderlaget stämmer inte med simmaren. Försök igen.')
      if (active) setResult({ key, talk: data.talk || null })
    }).catch((error) => { if (active) setResult({ key, error: error.message || 'Överenskommelsen kunde inte hämtas.' }) })
    return () => { active = false }
  }, [code, profile.id, request, key])
  const loading = result?.key !== key, talk = !loading && !result.error ? result.talk : null
  const excerpt = agreementExcerpt(talk?.text)
  return <section className="swimmer-agreement-card" aria-labelledby={titleId}>
    <header><span className="swimmer-agreement-icon" aria-hidden="true">🤝</span><div><p className="eyebrow">Utvecklingssamtal</p><h3 id={titleId}>Vår överenskommelse</h3></div><button type="button" className="text-button" disabled={loading} aria-label={`Uppdatera överenskommelsen för ${profile.displayName}`} onClick={() => setRefresh((value) => value + 1)}>Uppdatera</button></header>
    {loading ? <p role="status">Hämtar överenskommelsen…</p> : result.error ? <p className="form-error" role="alert">{result.error}</p> : !talk ? <p className="swimmer-agreement-empty">Ingen gemensam överenskommelse från ett genomfört samtal finns sparad ännu.</p> : <>
      <div className="swimmer-agreement-dates"><span>Samtal <time dateTime={talk.meetingDate}>{agreementDayLabel(talk.meetingDate)}</time></span><span>Uppföljning {talk.followUpDate ? <time dateTime={talk.followUpDate}>{agreementDayLabel(talk.followUpDate)}</time> : 'inte bestämd'}</span></div>
      <small className="swimmer-agreement-source">{expanded || !excerpt.truncated ? 'Sparad överenskommelse' : 'Utdrag ur sparad överenskommelse'} · senaste genomförda samtalet med en överenskommelse</small>
      <p id={textId} className={`swimmer-agreement-text${!expanded && excerpt.truncated ? ' is-excerpt' : ''}`}>{expanded ? agreementPlainText(talk.text) : excerpt.text}</p>
      <div className="swimmer-agreement-actions">{excerpt.truncated && <button type="button" className="text-button swimmer-agreement-expand" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Visa mindre' : 'Visa hela'}<span aria-hidden="true" /></button>}{onOpenTalk && <button type="button" className="secondary-button" onClick={() => onOpenTalk(talk.id)}>Öppna utvecklingssamtalet →</button>}</div>
    </>}
  </section>
}
