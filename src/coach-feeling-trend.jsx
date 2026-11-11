import React from 'react'
import CoachMetricTrend from './coach-metric-trend.jsx'

const mean = value => value == null ? '–' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
export default function CoachFeelingTrend({ comparison }) {
  if (!comparison) return null
  return <div className="coach-feeling-comparison"><CoachMetricTrend comparison={comparison} metric="feeling" unit="känslopoäng" samples={`Känsla 1–5: ${mean(comparison.current.average)} från ${comparison.current.count} svar nu · ${mean(comparison.previous.average)} från ${comparison.previous.count} svar tidigare. Alla giltiga känsloincheckningar räknas, inte unika simmare. Minst tre svar krävs i vardera perioden.`} /></div>
}
