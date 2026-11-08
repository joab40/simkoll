import React, { useEffect, useId, useMemo, useState } from 'react'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './swimmer-periodization.css'

const fmt = value => value == null ? 'Saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const amount = row => row.meters ?? row.knownMeters
const meterText = row => row.meters == null ? `${fmt(row.knownMeters)} m känd del · distans saknas ${row.unknownDays} dag(ar)` : `${row.estimated ? '≈ ' : ''}${fmt(row.meters)} m`
const validRow = row => row && /^\d{4}-\d{2}-\d{2}$/.test(row.start) && /^\d{4}-\d{2}-\d{2}$/.test(row.end) && (row.meters === null || Number.isFinite(row.meters) && row.meters >= 0) && Number.isFinite(row.knownMeters) && row.knownMeters >= 0 && (row.rpe === null || Number.isFinite(row.rpe) && row.rpe >= 1 && row.rpe <= 10)

export function PeriodizationChart({ rows, mode }) {
  const pattern = `period-${useId().replaceAll(':', '')}`, [selected, setSelected] = useState(null)
  useEffect(() => setSelected(null), [mode, rows])
  const width = Math.max(620, rows.length * 34 + 88), height = 270, left = 48, right = width - 40, top = 28, bottom = 214
  const max = Math.max(1000, Math.ceil(Math.max(0, ...rows.map(amount)) / 1000) * 1000)
  const step = (right - left) / rows.length, x = index => left + step * (index + .5), y = value => bottom - value / max * (bottom - top), rpeY = value => bottom - value / 10 * (bottom - top)
  const points = rows.map((row, index) => row.rpe == null ? null : `${x(index)},${rpeY(row.rpe)}`)
  const segments = []; let segment = []
  points.forEach(point => { if (point) segment.push(point); else { if (segment.length) segments.push(segment); segment = [] } }); if (segment.length) segments.push(segment)
  const label = row => mode === 'macro' ? `v${row.week} · ${row.year}` : dateLabel(row.start)
  const detail = row => `${label(row)}: ${meterText(row)}. RPE ${row.rpe == null ? 'saknas' : `${fmt(row.rpe)}/10 · ${row.rpeReports} svar på ${row.rpeDays} dag(ar)`}${row.ongoing ? '. Pågående vecka' : ''}`
  return <>
    <div className="periodization-chart-scroll" tabIndex="0" role="region" aria-label="Periodiseringsgraf, skrolla i sidled"><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${mode === 'macro' ? 'Tolv veckor' : '28 dagar'}: simmeter i staplar, RPE som rosa linje. Värden finns även i tabellen.`}>
      <defs><pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#151b1d" /><line x1="0" x2="0" y1="0" y2="6" stroke="#aebbb8" strokeWidth="2" /></pattern></defs>
      <text x={left} y="14" className="periodization-axis-title">Meter</text><text x={right} y="14" textAnchor="end" className="periodization-axis-title">RPE /10</text>
      {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#dce8e4" /><text x={left - 7} y={y(max * fraction) + 4} textAnchor="end">{fmt(max * fraction / 1000)}k</text><text x={right + 7} y={y(max * fraction) + 4}>{fmt(fraction * 10)}</text></g>)}
      {rows.map((row, index) => <g key={row.start} role="button" tabIndex="0" aria-label={detail(row)} onClick={() => setSelected(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index) } }} className="periodization-bar-target">
        <title>{detail(row)}</title><rect x={x(index) - step * .44} y={top} width={step * .88} height={bottom - top} fill={selected === index ? '#e3f0eb' : 'transparent'} rx="4" />
        <rect x={x(index) - step * .31} y={y(amount(row))} width={step * .62} height={Math.max(amount(row) > 0 ? 2 : 0, bottom - y(amount(row)))} rx="3" fill={row.estimated || row.meters == null ? `url(#${pattern})` : '#151b1d'} />
        {row.meters == null && <text x={x(index)} y={bottom - 4} textAnchor="middle">?</text>}
        <text x={x(index)} y={bottom + 18} textAnchor="middle">{mode === 'macro' ? `v${row.week}${row.ongoing ? '*' : ''}` : Number(row.start.slice(-2))}</text>
        {mode === 'meso' && (index === 0 || row.start.endsWith('-01')) && <text x={x(index)} y={bottom + 34} textAnchor="middle">{dateLabel(row.start).split(' ').slice(1).join(' ')}</text>}
      </g>)}
      <g pointerEvents="none">{segments.filter(points => points.length > 1).map((points, index) => <polyline key={index} points={points.join(' ')} fill="none" stroke="#c44b67" strokeWidth="2.5" />)}{rows.map((row, index) => row.rpe != null && <circle key={row.start} cx={x(index)} cy={rpeY(row.rpe)} r="3.5" fill="#c44b67" stroke="white" strokeWidth="1" />)}</g>
    </svg></div>
    <p className="periodization-selection" role="status">{selected != null && rows[selected] ? detail(rows[selected]) : 'Tryck på en stapel för värden och underlag.'}</p>
    <details className="periodization-table"><summary>Visa alla värden</summary><div><table><thead><tr><th>Period</th><th>Meter</th><th>RPE /10</th><th>RPE-svar</th></tr></thead><tbody>{rows.map(row => <tr key={row.start}><th scope="row">{label(row)}{mode === 'macro' && <small>{dateLabel(row.start)}–{dateLabel(row.end)}{row.ongoing ? ' · pågår' : ''}</small>}</th><td>{meterText(row)}</td><td>{fmt(row.rpe)}</td><td>{row.rpeReports} på {row.rpeDays} dagar</td></tr>)}</tbody></table></div></details>
  </>
}

export default function SwimmerPeriodization({ profile, code, request }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState('macro'), [result, setResult] = useState(null), [refresh, setRefresh] = useState(0)
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()), key = `${code}:${profile.id}:${today}:${refresh}`
  useEffect(() => {
    if (!open) return
    let active = true
    request(`/api/training?periodization=true&profileId=${encodeURIComponent(profile.id)}`, code).then(data => {
      if (data?.profileId !== profile.id || data.asOf !== today || !Array.isArray(data.macro) || !Array.isArray(data.meso) || data.macro.length !== 12 || data.meso.length !== 28 || ![...data.macro, ...data.meso].every(validRow)) throw new Error('Periodiseringsunderlaget är ofullständigt. Försök igen.')
      if (active) setResult({ key, data })
    }).catch(error => { if (active) setResult({ key, error: error.message || 'Periodiseringen kunde inte hämtas.' }) })
    return () => { active = false }
  }, [open, key, code, profile.id, request, today])
  const loading = result?.key !== key, data = !loading && !result.error ? result.data : null
  const rows = useMemo(() => data?.[mode] || [], [data, mode])
  return <details className="swimmer-periodization swimmer-disclosure" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <SwimmerCardSummary icon="📊" title="Periodisering" description="Simmeter och upplevd ansträngning" />
    {open && <div className="periodization-body">
      <div className="periodization-toolbar"><div role="group" aria-label="Välj periodisering">{[['macro', 'Makro · 12 veckor'], ['meso', 'Meso · 28 dagar']].map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div><button type="button" className="text-button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Uppdatera</button></div>
      {loading ? <p role="status">Hämtar periodisering…</p> : result.error ? <div role="alert"><p>{result.error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Försök igen</button></div> : <>
        <p className="periodization-range">{dateLabel(rows[0].start)}{rows[0].start.slice(0, 4) !== data.asOf.slice(0, 4) ? ` ${rows[0].start.slice(0, 4)}` : ''}–{dateLabel(rows.at(-1).end)} {data.asOf.slice(0, 4)}{mode === 'macro' && rows.at(-1).ongoing ? ' · * Pågående vecka hittills' : ''}</p>
        <div className="periodization-legend"><span>▰ Simmeter</span><span><i /> RPE /10</span><span>▨ Planerad mängd / känd del</span></div>
        {!rows.some(row => row.swims || row.rpe != null || row.unknownDays) && <p>Inga registrerade simpass under perioden.</p>}
        <PeriodizationChart key={mode} rows={rows} mode={mode} />
        <details className="periodization-method"><summary>Så räknas periodiseringen</summary><p>Staplarna summerar meter från genomförd, registrerad simning. Egen rapporterad distans används först, annars planerade meter från entydigt kopplat pass (≈ och randig stapel). Passalternativ räknas inte ihop. Ingen registrerad simning visas som 0 m; det är inte bevis på vila. Saknad distans i ett genomfört pass är okänd: stapeln visar då bara känd del och märks med ?.</p><p>RPE gäller simpass, inte styrka, landträning eller tävling. Dagsvärdet är medel av simpassens senaste sparade RPE-svar. Veckovärdet är medel av dagarna med svar, så varje sådan dag väger lika. Saknad RPE är en lucka, aldrig noll. RPE är upplevd ansträngning 1–10, inte total träningsbelastning eller ett bevis på form. Innevarande vecka är inte jämförbar med en hel vecka.</p></details>
      </>}
    </div>}
  </details>
}
