import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { coachMetricDetails } from './coach-metric-details.js'
import { checkinStatus } from './checkin-status.js'

const dayLabel = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })
const submittedLabel = (item) => new Date(item.submittedAt || item.createdAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function CoachMetricDetails({ metricKey, responses, profiles, periodLabel, onClose }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const titleId = useId()
  const [sort, setSort] = useState('newest')
  const [search, setSearch] = useState('')
  const detail = useMemo(() => coachMetricDetails(metricKey, responses, profiles), [metricKey, responses, profiles])
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    closeButton.current?.focus()
    return () => { element.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [])
  const entries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('sv-SE')
    const result = detail.entries.filter((item) => !query || [item.profile?.displayName || (item.anonymous ? 'Anonymt svar' : 'Profil saknas'), item.label, String(item.value), item.response.comment || ''].join(' ').toLocaleLowerCase('sv-SE').includes(query))
    if (sort !== 'newest') result.sort((a, b) => sort === 'low' ? a.value - b.value : b.value - a.value)
    return result
  }, [detail, sort, search])
  return <dialog className="coach-metric-dialog" ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="coach-metric-dialog-content">
      <header className="coach-metric-dialog-heading"><div><p className="eyebrow">{periodLabel}</p><h2 id={titleId}>{detail.metric.title}</h2><p>{detail.metric.activityType ? 'Incheckningar i vald kategori' : detail.metric.afterOnly ? 'Svar efter träning eller tävling' : 'Alla incheckningar med angiven känsla'}</p></div><button type="button" ref={closeButton} className="secondary-button" onClick={onClose} aria-label="Stäng svarsvyn">Stäng ×</button></header>
      <div className="coach-metric-summary">{!detail.metric.activityType && <strong>{detail.average} <small>/ {detail.metric.max}</small></strong>}<span>{detail.entries.length} svar · {detail.profileCount} simmare{detail.anonymousCount > 0 ? ` · ${detail.anonymousCount} ${detail.anonymousCount === 1 ? 'anonymt svar' : 'anonyma svar'}` : ''}</span></div>
      <p className="coach-metric-explanation">{detail.metric.activityType ? 'Alla svar i den valda kategorin visas.' : 'Varje svar nedan ingår i medelvärdet.'} Om en simmare svarat flera gånger visas varje svar separat. Anonyma svar kopplas inte till en profil.</p>
      {detail.entries.length > 0 && <div className="coach-metric-filters"><label>Sök svar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Namn eller kommentar…" /></label>{!detail.metric.activityType && <label>Sortera<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Senaste först</option><option value="low">Lägsta värde först</option><option value="high">Högsta värde först</option></select></label>}</div>}
      <div className="coach-metric-response-list">
        {entries.map((item) => <article className="coach-metric-response" key={item.response.id}>
          <div className="coach-metric-response-heading"><span className="coach-metric-avatar" aria-hidden="true">{item.anonymous ? '🥷' : item.profile?.emoji || '🏊'}</span><div><strong>{item.anonymous ? 'Anonymt svar' : item.profile?.displayName || 'Profil saknas'}</strong><small>{dayLabel(item.day)} · {checkinStatus(item.response) || 'Incheckning'}{item.response.trainingSlot ? ` · ${item.response.trainingSlot === 'morning_swim' ? 'Morgon' : 'Eftermiddag / kväll'}` : ''}{item.response.lateEntry ? ' · efterregistrerat' : ''}</small></div>{!detail.metric.activityType && <span className="coach-metric-value"><strong>{item.value}<small>/{detail.metric.max}</small></strong>{item.label && <small>{item.label}</small>}</span>}</div>
          {item.response.comment?.trim() && <blockquote>{item.response.comment.trim()}</blockquote>}
          <small className="coach-metric-submitted">Skickat {submittedLabel(item.response)}</small>
        </article>)}
        {!entries.length && <p className="empty">{detail.entries.length ? 'Inga svar matchar sökningen.' : 'Inga svar för det här kortet under den valda perioden.'}</p>}
      </div>
    </div>
  </dialog>
}
