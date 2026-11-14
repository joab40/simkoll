import React, { useEffect, useId, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { heartDuration } from '../shared/training-heart-display.js'
import { illnessLabel } from '../shared/illness.js'
import { formChartSegments } from '../shared/form-chart.js'
import { FORM_PERIODS, summarizeFormPeriod } from '../shared/form-period.js'
import FormCoachContext from './form-coach-context.jsx'
import FormLiveView from './form-live-view.jsx'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './form-kollen.css'

const n = value => value == null ? 'Saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }) : 'saknas'
const arrows = { up: '↗', down: '↘', steady: '→', mixed: '↕', unknown: '—' }
const metric = item => item?.days ? `${n(item.value)}/5 · ${item.days} svarsdagar` : 'Svar saknas'
const validPayload = (data, profileId, asOf) => data.profileId === profileId && data.asOf === asOf && Array.isArray(data.history) && FORM_PERIODS.every(days => data.periods?.[days]?.days === days) && data.periods[2].mode === 'latest-answers'

export function FormOrb({ phase = 'unknown', animate = false }) {
  const ref = useRef(null), [visible, setVisible] = useState(false)
  useEffect(() => {
    let inView = false
    const update = () => setVisible(inView && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update() })
    observer.observe(ref.current); document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  return <div ref={ref} className={`form-orb phase-${phase}${animate && visible ? ' orb-moving' : ''}`} aria-hidden="true"><span className="form-orb-halo" /><span className="form-orb-orbit" /><span className="form-orb-core"><svg viewBox="0 0 48 36" fill="none"><path d="M5 10c7-10 14 10 23 0s13-2 15-3M5 19c7-10 14 10 23 0s13-2 15-3M5 28c7-10 14 10 23 0s13-2 15-3" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg><small>FORM</small></span><span className="form-orb-spark">✦</span></div>
}

export function ObservationChart({ history, field, label, load = false }) {
  const { points, segments } = formChartSegments(history, field)
  const values = history.filter(row => Number.isFinite(row[field]))
  const max = load ? Math.max(1, ...values.map(row => row[field])) : 5
  const x = index => 18 + index * 264 / Math.max(1, history.length - 1)
  const y = value => 86 - (load ? value / max : (value - 1) / 4) * 68
  return <section className="form-chart"><header><strong>{label}</strong><small>{load ? `0–${n(max)} RPE × min` : '1–5 · 5 är bäst'}</small></header>{values.length < 2 ? <p className="form-chart-empty">Minst två svarsdagar behövs för en utvecklingsgraf.</p> : <svg viewBox="0 0 300 110" role="img" aria-label={`${label}, ${values.length} svarsdagar. Exakta värden finns i tabellen nedan.`}>
    {[18, 52, 86].map(value => <line key={value} x1="18" x2="282" y1={value} y2={value} className="form-chart-grid" />)}
    {segments.map(segment => <g key={`${segment.from.date}-${segment.to.date}`}>
      <title>{segment.gap ? `${segment.missingDays} dag(ar) utan svar mellan observationerna. Linjen förbinder bara rapporterade punkter; inga mellanvärden finns.` : 'Sammanhängande svarsdagar'}</title>
      {segment.gap && <line x1={x(segment.from.index)} y1={y(segment.from.value)} x2={x(segment.to.index)} y2={y(segment.to.value)} className="form-chart-gap-guide" aria-hidden="true" />}
      <line x1={x(segment.from.index)} y1={y(segment.from.value)} x2={x(segment.to.index)} y2={y(segment.to.value)} className={`form-chart-line${segment.gap ? ' form-chart-gap' : ''}`} />
    </g>)}
    {points.map(point => <circle key={`${point.date}-${point.index}`} cx={x(point.index)} cy={y(point.value)} r={history.length > 28 ? 2.2 : 3.5} className="form-chart-dot"><title>{date(point.date)}{history[point.index].submittedAt ? ` · ${history[point.index].submittedAt}` : ''}: {n(point.value)}{history[point.index].estimated && load ? ' · innehåller planerad tid' : ''}</title></circle>)}
    <text x="18" y="105">{date(history[0]?.date)}</text><text x="282" y="105" textAnchor="end">{date(history.at(-1)?.date)}</text>
  </svg>}</section>
}

export function FormKollenView({ data, name, demo = false, onSaveContext, onRefresh }) {
  const [open, setOpen] = useState(false), [period, setPeriod] = useState(2), [animate, setAnimate] = useState(!demo)
  const id = useId(), history = data.history.slice(-period), selected = data.periods[period]
  const c = selected.metrics, load = selected.load, sleep = selected.sleep, summary = summarizeFormPeriod(selected, data)
  const loadDelta = load.ratio == null ? null : Math.round((load.ratio - 1) * 1000) / 10
  const loadLabel = loadDelta == null ? 'Jämförelse saknas' : loadDelta === 0 ? '→ Oförändrad' : `${loadDelta > 0 ? '↑' : '↓'} ${n(Math.abs(loadDelta))} % ${loadDelta > 0 ? 'högre' : 'lägre'}`
  if (period === 2) return <FormLiveView data={data} name={name} demo={demo} onPeriodChange={setPeriod} onSaveContext={onSaveContext} onRefresh={onRefresh} animate={animate} onAnimate={() => setAnimate(value => !value)} />
  return <section className={`form-kollen phase-${summary.phase}${animate ? ' is-animated' : ''}`} aria-labelledby={`${id}-title`}>
    <header className="form-kollen-header"><div><p className="eyebrow">{demo ? 'Formkollen · endast fiktivt demo' : 'Formkollen'}</p><small>Rapporterade signaler · till och med {date(data.asOf)}</small></div><span className="form-confidence" title="Datatäckning för vald analysperiod">Underlag: {summary.confidence}</span></header>
    <div className="form-periods" role="group" aria-label="Analysperiod">{FORM_PERIODS.map(days => <button type="button" key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days === 2 ? 'Just nu' : `${days} dagar`}</button>)}</div>
    <div className="form-period-summary" aria-live="polite" aria-atomic="true">
    <div className="form-kollen-hero"><FormOrb phase={summary.phase} animate={animate} /><div><small className="form-kollen-caption">{summary.caption}{summary.provisional ? ' · preliminärt underlag' : ''}</small><h3 id={`${id}-title`}>{summary.label}</h3><p>{summary.reason}</p><small className="form-comparison-dates">{date(selected.start)}–{date(selected.end)} jämfört med {date(selected.previousStart)}–{date(selected.previousEnd)}</small><div className="form-metric-directions">{[['body', 'Kropp'], ['feeling', 'Dagskänsla'], ['speed', 'Fartkänsla']].map(([key, label]) => {
      const trend = selected.directions[key]
      return <span key={key} className={`form-direction metric-${trend.state}`} title={trend.detail}><strong>{label} {c[key].days ? `${n(c[key].value)}/5` : 'saknas'}</strong><b aria-hidden="true">{arrows[trend.state]}</b><span>{trend.label}</span></span>
    })}</div><small className="form-direction-explainer">Varje pil gäller ett eget mått – inte samlad simprestation.</small></div></div>
    <p className="form-provisional-note">Varje svarsdag väger lika. Periodens snitt beskriver den valda perioden, inte formen idag. Sömn är ett vanligt nattsnitt och belastning summeras utan viktning. Saknade värden fylls inte i.</p>
    <div className="form-signals"><div><small>Belastning · {period} dagar</small><strong>{loadLabel}</strong><span>{load.known ? `${load.estimated ? '≈ ' : ''}${n(load.value)} RPE × min` : 'Användbar tid/RPE saknas'}</span><small>{load.known} av {load.total} efterrapporter kompletta · {load.days} dagar</small><small>Föregående: {n(load.previous.value)} · {load.previous.known}/{load.previous.total} kompletta · {load.previous.days} dagar</small></div><div><small>Kropp & sömn · {period} dagar</small><strong>{c.body.days ? `${n(c.body.value)}/5 i kroppkänsla` : 'Kroppkänsla saknas'}</strong><span>{sleep.nights ? `${heartDuration(sleep.minutes)} · ${sleep.nights} nätter` : 'Sömnsvar saknas'}</span><small>{c.body.days} av {period} kroppssvarsdagar · inte uppmätt återhämtning</small></div><div><small>Fartkänsla · {period} dagar</small><strong>{c.speed.days ? `${n(c.speed.value)}/5` : 'Fartkänsla saknas'}</strong><span>{c.speed.days} av {period} svarsdagar</span><small>Upplevd, inte uppmätt fart</small></div></div>
    </div>
    <aside className={`form-latest phase-${data.phase}`}><strong>Senaste rapporterade läge · separat från periodanalysen</strong><p>{data.label}</p><small>{data.reasons[0]}</small><dl><div><dt>Kropp · 3 dagar</dt><dd>{metric(data.current.body)} · senaste {date(data.current.body.lastDay)}</dd></div><div><dt>Dagskänsla · 3 dagar</dt><dd>{metric(data.current.feeling)} · senaste {date(data.current.feeling.lastDay)}</dd></div><div><dt>Fartkänsla · 3 dagar</dt><dd>{metric(data.current.speed)} · senaste {date(data.current.speed.lastDay)}</dd></div><div><dt>Sjukdomskoll</dt><dd>{!data.illnessAvailable ? 'Källan kunde inte hämtas' : data.illness ? `${illnessLabel(data.illness.status)} · ${date(data.illness.activity_date)}` : 'Svar saknas – betyder inte frisk'}</dd></div></dl><small>Aktuellt underlag {date(data.current.body.start)}–{date(data.asOf)}. Äldre svar flyttas inte fram till idag. Belastningens aktuella baslinje och tränaruppgifter är oberoende av periodvalet.</small></aside>
    {data.flags.length > 0 && <aside className="form-flags"><strong>Att följa upp</strong><ul>{data.flags.map(flag => <li key={flag}>{flag}</li>)}</ul><small>Signaler för samtal, inte diagnos eller ett automatiskt träningsråd.</small></aside>}
    {(data.coachContext || demo && data.context) && <FormCoachContext records={data.coachContext || { available: true, current: data.context, revisions: [] }} active={data.context} asOf={data.asOf} onSave={onSaveContext} />}
    <div className="form-kollen-actions"><button type="button" className="text-button" aria-expanded={open} aria-controls={`${id}-detail`} onClick={() => setOpen(value => !value)}>{open ? 'Dölj utveckling ↑' : 'Visa utveckling & underlag →'}</button><button type="button" className="text-button" aria-pressed={animate} onClick={() => setAnimate(value => !value)}>{animate ? 'Pausa rörelse' : 'Visa mjuk rörelse'}</button></div>
    {open && <div id={`${id}-detail`} className="form-kollen-detail"><h4>Utveckling · {name} · {period} dagar</h4><p>Faktiska dagsmedel, utan 60/40-viktning i själva grafen. Heldraget = sammanhängande svarsdagar. Streckat = koppling mellan verkliga observationer över dagar utan svar; inga mellanvärden räknas fram. Saknad belastning betyder inte vila eller noll.</p>
      <div className="form-charts"><ObservationChart history={history} field="body" label="Kroppkänsla" /><ObservationChart history={history} field="feeling" label="Dagskänsla" /><ObservationChart history={history} field="speed" label="Simfartkänsla" /><ObservationChart history={history} field="load" label="Rapporterad belastning" load /></div>
      <details><summary>Visa exakta dagsvärden</summary><div className="form-table-scroll"><table><caption>{date(history[0]?.date)}–{date(data.asOf)} · ≈ innehåller planerad tid</caption><thead><tr><th>Datum</th><th>Kropp /5</th><th>Känsla /5</th><th>Fart /5</th><th>RPE × min</th></tr></thead><tbody>{history.map(row => <tr key={row.date}><th scope="row">{date(row.date)}</th>{['body', 'feeling', 'speed'].map(key => <td key={key}>{n(row[key])}</td>)}<td>{row.estimated ? '≈ ' : ''}{n(row.load)}</td></tr>)}</tbody></table></div></details>
      <details><summary>Värden, perioder & täckning</summary><p>Nu: {date(selected.start)}–{date(selected.end)}. Föregående: {date(selected.previousStart)}–{date(selected.previousEnd)}. Trend kräver minst {selected.minimumDays} svarsdagar för respektive mått i båda perioderna.</p><dl className="form-values">{[['Kropp', 'body'], ['Dagskänsla', 'feeling'], ['Simfartkänsla', 'speed']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{metric(c[key])}<small>Senaste {date(c[key].lastDay)} · föregående: {metric(selected.previous.metrics[key])}</small></dd></div>)}<div><dt>Sömn</dt><dd>{sleep.nights ? `${heartDuration(sleep.minutes)} · ${sleep.nights} nätter · kvalitet ${n(sleep.quality)}/5` : 'Saknas'}<small>{sleep.poorNights} Dålig-svar · senaste {date(sleep.lastDay)}. Föregående: {selected.previous.sleep.nights ? heartDuration(selected.previous.sleep.minutes) : 'saknas'} · {selected.previous.sleep.nights} nätter.</small></dd></div><div><dt>Sjukdomskoll</dt><dd>{data.illnessAvailable ? `${selected.illness.mildDays} dagar med känningar · ${selected.illness.sickDays} dagar med Jag känner mig sjuk · ${selected.illness.answeredDays} svarsdagar` : 'Källan kunde inte hämtas'}<small>{selected.illness.sickReportDays} dagar med sjukfrånvarorapport. Måtten kan överlappa och läggs inte ihop. Saknat svar betyder inte frisk.</small></dd></div><div><dt>Belastning</dt><dd>{n(load.value)} RPE × min · {load.known}/{load.total} kompletta rapporter · {load.days} dagar<small>{load.reported} med egen tid, {load.estimated} med planerad tid. Föregående: {n(load.previous.value)} · {load.previous.known}/{load.previous.total} kompletta · {load.previous.days} dagar.</small></dd></div></dl><p>Belastningsjämförelse kräver minst {period === 2 ? 2 : 3} kompletta rapporter på minst {selected.minimumDays} dagar och RPE/tid i minst 80 % av registrerade rapporter i båda perioderna. Olika antal rapporterade dagar kan påverka jämförelsen; lägre registrerad belastning bevisar inte mindre träning. Planerad tid är en uppskattning, inte bekräftad tränad tid.</p><details><summary>Senaste lägets sjudagarsbaslinje – separat från vald period</summary><ul>{data.load.baseline.map(week => <li key={week.end}>{date(week.start)}–{date(week.end)}: {n(week.value)} RPE × min · {week.known}/{week.total} kompletta · {week.reported} egen tid / {week.estimated} planerad tid · {week.comparable ? 'jämförbar' : 'för lite underlag'}</li>)}</ul></details>{data.limitations.map(text => <p key={text}>{text}</p>)}</details>
      <details><summary>Hur tolkas Formkollen?</summary><p>7/14/28/90 dagar styr sammanfattning, snitt, belastning, sömn, trendpilar och grafer. Jämförelsen gäller föregående lika långa kalenderperiod. Varje svarsdag har samma vikt. Sömn viktas inte och belastning summeras. Grafer och tabell visar faktiska dagsmedel. Just nu är en separat vy för två senaste svar per mått, viktade 60/40 mot de två före – inte två kalenderdagar.</p><p>Periodtrend kräver minst tre svarsdagar och minst 30 % av kalenderdagarna i båda perioderna, avrundat uppåt. Gränsen är 0,5/5. Saknade dagar fylls inte i och räknas aldrig som noll eller frisk. Dessa är justerbara produktregler, inte vetenskapligt validerade gränser. Ett 90-dagarssnitt beskriver inte formen idag.</p><p>Senaste rapporterade läge använder fortsatt tre kalenderdagars känslor och sömn samt aktuell sjukdomskoll, oberoende av periodval. Belastningen där använder en egen sjudagarsbaslinje med tidigare jämförbara veckor. Tränarens PB-uppgifter är daterad kontext, inte verifierade resultat. Aktuella sömn-/sjukdomsvarningar finns kvar i alla perioder. Inga träningsbeslut fattas och ingen AI används.</p></details>
    </div>}
  </section>
}

function FormKollenContent({ profile, code, request = apiRequest, asOf, excluded = false }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    if (excluded) return undefined
    request(`/api/training?formKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { retry: false }).then(data => {
      if (!validPayload(data, profile.id, asOf)) throw new Error('Underlaget är ofullständigt eller har ett annat datum. Uppdatera sidan.')
      if (active) setResult(data)
    }).catch(failure => { if (active) setError(failure.message || 'Underlaget kunde inte hämtas.') })
    return () => { active = false }
  }, [profile.id, code, asOf, excluded, refresh, request])
  if (excluded) return <section className="form-kollen"><p className="eyebrow">Formkollen</p><p>Profilen ingår inte i underlaget.</p></section>
  if (!result || error) return <section className="form-kollen"><p className="eyebrow">Formkollen</p><p role="status">{error || 'Hämtar rapporterade signaler och egen historik…'}</p>{error && <button type="button" onClick={() => setRefresh(value => value + 1)}>Försök igen</button>}</section>
  const saveContext = async context => {
    await request(`/api/training?formKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { method: 'POST', retry: false, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-form-context', context }) })
    try {
      const next = await request(`/api/training?formKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { retry: false })
      if (!validPayload(next, profile.id, asOf)) throw new Error('Ofullständigt underlag')
      setResult(next)
    } catch { throw new Error('Uppgiften sparades, men tolkningen kunde inte uppdateras. Öppna kortet igen innan du sparar något mer.') }
  }
  return <FormKollenView data={result} name={profile.displayName} onRefresh={() => setRefresh(value => value + 1)} onSaveContext={result.coachContext?.available ? saveContext : undefined} />
}

export default function FormKollenCard(props) {
  const [expanded, setExpanded] = useState(false)
  return <details className="form-kollen-shell swimmer-disclosure" onToggle={event => setExpanded(event.currentTarget.open)}>
    <SwimmerCardSummary icon="≋" eyebrow="Rapporterade signaler" title="Formkollen" description="Just nu, historik och underlag" status={expanded ? 'Dölj' : 'Visa'} />
    {expanded && <FormKollenContent {...props} />}
  </details>
}
