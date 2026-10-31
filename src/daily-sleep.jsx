import React, { useEffect, useState } from 'react'
import './daily-sleep.css'
import SwimmerCardSummary, { DirectionExplanation } from './swimmer-card-summary.jsx'
import { directionUnavailable, sleepDirection } from '../shared/swimmer-card-direction.js'

export const sleepDuration = (minutes) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
const qualityLabel = (value) => ({ 1: '😴 Dålig', 3: '😐 Okej', 5: '😀 Bra' })[value] || '–'

export function SleepQuestion({ date, code, request, onContinue, lateEntry }) {
  const [minutes, setMinutes] = useState(420), [quality, setQuality] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const save = async (skipped) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await request('/api/responses', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-sleep', date, minutes, quality, skipped }) })
      onContinue()
    } catch (reason) { setError(reason.message); setBusy(false) }
  }
  return <div className="sleep-check"><p>Frivilligt · sparas i din dagbok och är synligt för tränarna. Frågan visas en gång per dag.</p><h2>Hur länge sov du ungefär?</h2><div className="sleep-duration"><button type="button" aria-label="Minska sovtid med 15 minuter" disabled={busy || minutes === 0} onClick={() => setMinutes((value) => value - 15)}>−</button><output aria-live="polite">{sleepDuration(minutes)}<small>{lateEntry ? 'Natten före gårdagen' : 'Under natten'}</small></output><button type="button" aria-label="Öka sovtid med 15 minuter" disabled={busy || minutes === 840} onClick={() => setMinutes((value) => value + 15)}>+</button></div><input aria-label="Ungefärlig sovtid i minuter" type="range" min="0" max="840" step="15" value={minutes} disabled={busy} onChange={(event) => setMinutes(Number(event.target.value))} aria-valuetext={sleepDuration(minutes)} /><div className="sleep-range-labels"><span>0 timmar</span><span>14 timmar</span></div><h2>Hur upplevde du sömnen?</h2><div className="sleep-quality">{[1,3,5].map((value) => <button type="button" key={value} aria-pressed={quality === value} disabled={busy} onClick={() => setQuality(value)}>{qualityLabel(value)}{quality === value && <b aria-hidden="true"> ✓</b>}</button>)}</div><div className="sleep-actions"><button type="button" className="text-button" disabled={busy} onClick={() => save(true)}>Hoppa över idag</button><button type="button" className="primary-button" disabled={busy || quality == null} onClick={() => save(false)}>{busy ? 'Sparar…' : 'Spara och fortsätt →'}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</div>
}

export default function SleepHistory({ code, request, profileId, start, end, days = [], responses = [] }) {
  const [records, setRecords] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0)
  const [period, setPeriod] = useState(28)
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setRecords([])
    const from = start || new Date(Date.parse(`${today}T12:00:00Z`) - (period - 1) * 86400000).toISOString().slice(0,10)
    const params = new URLSearchParams({ sleep: 'true', ...(profileId ? { profileId } : {}), start: from, end: end || today })
    request(`/api/responses?${params}`, code).then((data) => { if (active) setRecords((data.records || []).filter((row) => !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0)) }).catch((reason) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, profileId, start, end, retry, period, today])
  const average = records.length ? Math.round(records.reduce((sum, row) => sum + row.minutes, 0) / records.length) : null
  const direction = loading ? directionUnavailable('Hämtar riktning…') : error ? directionUnavailable('Riktningen kunde inte hämtas') : sleepDirection(records, end || today)
  return <details className="sleep-history swimmer-disclosure">
    <SwimmerCardSummary icon="🌙" title="Sömn och återhämtning" description={loading ? 'Hämtar…' : error ? 'Underlaget kunde inte hämtas' : average == null ? 'Inga sömnsvar i perioden' : `${sleepDuration(average)} i snitt · ${records.length} ${records.length === 1 ? 'natt' : 'nätter'}`} direction={direction} />
    <div className="sleep-history-content">
      {direction.state === 'insufficient' ? <DirectionExplanation direction={direction} /> : <details className="sleep-trend-method swimmer-disclosure"><summary>Så räknas sömnpilen</summary><DirectionExplanation direction={direction} /></details>}
      {direction.durationDetail && <p className="sleep-duration-trend">{direction.durationDetail}</p>}
      {!start && <label>Visa <select aria-label="Sömnhistorikens period" value={period} onChange={(event) => setPeriod(Number(event.target.value))}>{[28,90,180].map((value) => <option key={value} value={value}>{value} dagar</option>)}</select></label>}
      <p>{start && end ? `${start}–${end}` : `Senaste ${period} dagarna`}. Natten hör till dagen efter. Jämför med känsla och RPE för samma dag; det visar inget säkert orsakssamband.</p>
      {error ? <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Försök igen</button></p> : !loading && records.length ? <>
        <div className="sleep-bars" aria-label="Sovtid per registrerad natt, senaste högst 31 svar">{records.slice(0,31).reverse().map((row) => <div key={row.activity_date} title={`${row.activity_date}: ${sleepDuration(row.minutes)}, ${qualityLabel(row.quality)}`}><i style={{ height: `${Math.max(2, row.minutes / 840 * 90)}px` }} /><small>{row.activity_date.slice(8)}</small></div>)}</div>
        <div className="sleep-table"><table><caption>Sparade sömnsvar och dagens upplevelse</caption><thead><tr><th>Dag</th><th>Sovtid</th><th>Sömn</th><th>Känsla /5</th><th>RPE /10</th></tr></thead><tbody>{records.map((row) => {
    const related = responses.filter((item) => (item.activityDate || item.createdAt?.slice(0,10)) === row.activity_date)
    const mean = (key) => { const values = related.map((item) => item[key]).filter((value) => typeof value === 'number'); return values.length ? Math.round(values.reduce((a,b) => a+b,0) / values.length * 10) / 10 : '–' }
    const day = days.find((item) => item.date === row.activity_date)
    return <tr key={row.activity_date}><th>{row.activity_date}</th><td>{sleepDuration(row.minutes)}</td><td>{qualityLabel(row.quality)}</td><td>{day?.feeling ?? mean('feeling')}</td><td>{day?.rpe ?? mean('rpe')}</td></tr>
  })}</tbody></table></div></> : !loading && <p>Här visas registrerade sömnsvar. Saknade svar räknas inte som noll.</p>}</div></details>
}
