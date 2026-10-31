import React from 'react'
import { featureFaqFor, FEATURE_FAQ_SECTIONS } from '../shared/feature-faq.js'
import './feature-faq.css'

export default function FeatureFaq({ role = 'swimmer', section }) {
  const entries = featureFaqFor(role, section)
  return <div className="feature-faq">{FEATURE_FAQ_SECTIONS.filter(([key]) => entries.some(item => item.section === key)).map(([key, label]) => <section className="feature-faq-group" key={key} aria-label={label}>{!section && <h2>{label}</h2>}{entries.filter(item => item.section === key).map(item => <details key={item.id}><summary>{item.question}<span aria-hidden="true">+</span></summary>{item.answer.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details>)}</section>)}</div>
}
