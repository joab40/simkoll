import React from 'react'

const fmt = value => Number(value).toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const label = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const range = (start, end) => start === end ? label(start) : `${label(start)}–${label(end)}`
export default function CoachMetricTrend({ comparison, metric, unit, samples }) {
  const value = comparison.metrics[metric], delta = value.delta
  const direction = delta == null ? '—' : delta > 0 ? '↗' : delta < 0 ? '↘' : '→'
  const amount = delta == null ? value.reason : delta === 0 ? 'Oförändrat' : `${fmt(Math.abs(delta))} ${delta > 0 ? ['pass', 'simmare'].includes(unit) ? 'fler' : 'högre' : ['pass', 'simmare'].includes(unit) ? 'färre' : 'lägre'} ${unit}`
  const text = metric === 'sleep' && delta != null && delta !== 0 ? `${fmt(Math.abs(delta))} minuter ${delta > 0 ? 'längre' : 'kortare'}` : amount
  return <div className="coach-metric-trend-wrap"><details className="coach-metric-trend">
    <summary><span className="coach-metric-trend-arrow" aria-hidden="true">{direction}</span><span>{text}</span><span className="sr-only">. Visa jämförelseunderlag</span></summary>
    <p>{range(comparison.start, comparison.end)} jämfört med {range(comparison.previousStart, comparison.previousEnd)}. Samma veckodagar och samma profilurval.</p>
    <p>{samples}</p>
    {metric === 'load' && <p>För belastningspil krävs minst tre pass med RPE och tid samt minst 80 % täckning i båda perioderna. Täckningen får skilja högst 10 procentenheter.</p>}
    <p>Pilen visar förändring, inte automatiskt bättre eller sämre. Antal svar och vilka som svarat kan påverka jämförelsen.</p>
  </details><small className="coach-metric-comparison-period">Jämfört med {range(comparison.previousStart, comparison.previousEnd)}</small></div>
}
