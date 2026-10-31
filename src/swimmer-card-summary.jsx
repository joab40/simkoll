import React from 'react'
import './swimmer-card-summary.css'

const arrows = { up: '↗', down: '↘', steady: '→', mixed: '↕', insufficient: '—' }

export default function SwimmerCardSummary({ icon, eyebrow, title, description, direction, status }) {
  return <summary className="swimmer-card-summary">
    <span className="swimmer-card-summary-icon" aria-hidden="true">{icon}</span>
    <span className="swimmer-card-summary-copy">{eyebrow && <small className="swimmer-card-summary-eyebrow">{eyebrow}</small>}<strong>{title}</strong>{description && <small>{description}</small>}{direction && <small className="swimmer-card-direction-label">{direction.label}</small>}</span>
    <span className="swimmer-card-summary-actions">{direction && <span className={`swimmer-card-direction ${direction.state}`} aria-hidden="true" title={direction.detail}>{arrows[direction.state] || '—'}</span>}{status && <b>{status}</b>}</span>
  </summary>
}

export function DirectionExplanation({ direction }) {
  return <p className="swimmer-card-direction-explanation">{direction.detail}</p>
}
