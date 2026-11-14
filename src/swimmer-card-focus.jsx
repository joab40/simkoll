import React from 'react'
import { illnessLabel } from '../shared/illness.js'
import './swimmer-card-focus.css'

export default function SwimmerCardFocus({ illness, comment }) {
  const currentIllness = ['mild', 'sick'].includes(illness?.status) ? illness : null
  if (!currentIllness && !comment) return null
  return <span className="swimmer-card-focus">
    {currentIllness && <span className={`swimmer-card-focus-illness ${currentIllness.status}`}>
      <strong>{currentIllness.status === 'sick' ? '🤒' : '🤧'} {illnessLabel(currentIllness.status)}</strong>
      <small>· <time dateTime={currentIllness.activity_date} title={currentIllness.activity_date}>{new Date(`${currentIllness.activity_date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</time></small>
    </span>}
    {comment && <span className="swimmer-card-focus-comment"><small>Dagens kommentar</small><span>“{comment.replace(/\s+/g, ' ')}”</span></span>}
  </span>
}

export function SwimmerTodayComment({ comment }) {
  return comment ? <section className="swimmer-today-comment" aria-label="Dagens kommentar">
    <strong>Dagens kommentar</strong><p>{comment}</p>
  </section> : null
}
