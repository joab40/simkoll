import React, { useState } from 'react'
import { featureFaqFor, FEATURE_FAQ_SECTIONS } from '../shared/feature-faq.js'
import TrainingHeartExamples from './training-heart-examples.jsx'
import './feature-faq.css'

export default function FeatureFaq({ role = 'swimmer', section }) {
  const entries = featureFaqFor(role, section)
  const [showHeartExamples, setShowHeartExamples] = useState(false)
  return <div className="feature-faq">{FEATURE_FAQ_SECTIONS.filter(([key]) => entries.some(item => item.section === key)).map(([key, label]) => <section className="feature-faq-group" key={key} aria-label={label}>{!section && <h2>{label}</h2>}{entries.filter(item => item.section === key).map(item => <details key={item.id} onToggle={item.id === 'training-heart-examples' ? event => { if (event.target === event.currentTarget) setShowHeartExamples(event.currentTarget.open) } : undefined}><summary>{item.question}<span aria-hidden="true">+</span></summary>{item.id === 'training-heart-examples' ? showHeartExamples && <TrainingHeartExamples /> : item.answer.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details>)}</section>)}</div>
}
