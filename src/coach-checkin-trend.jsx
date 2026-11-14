import React from 'react'
import CoachMetricTrend from './coach-metric-trend.jsx'
import './coach-checkin-trend.css'

const mean = value => value == null ? '–' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
export default function CoachCheckinTrend({ comparison, metric }) {
  if (!comparison) return null
  const current = comparison.current[metric], previous = comparison.previous[metric]
  const unit = metric === 'rpe' ? 'RPE-poäng' : metric === 'feeling' ? 'känslopoäng' : 'betygspoäng'
  const samples = `${mean(current.average)} från ${current.count} svar nu · ${mean(previous.average)} från ${previous.count} svar tidigare. Samma svar som ingår i kortets snitt räknas, även flera svar från samma simmare. Minst tre giltiga svar krävs i vardera perioden.${metric === 'rpe' ? ' Högre RPE betyder högre rapporterad ansträngning, inte automatiskt bättre eller sämre form.' : ''}`
  return <div className="coach-checkin-trend"><CoachMetricTrend comparison={comparison} metric={metric} unit={unit} samples={samples} /></div>
}
