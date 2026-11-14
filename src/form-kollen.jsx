import React, { useEffect, useId, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { heartDuration } from '../shared/training-heart-display.js'
import { illnessLabel } from '../shared/illness.js'
import './form-kollen.css'

const n = value => value == null ? 'Saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }) : 'saknas'
const arrows = { up: '↗', down: '↘', steady: '→', mixed: '↕', unknown: '—' }
const directions = { up: 'Stigande rapporterade känslor', down: 'Sjunkande rapporterade känslor', steady: 'Ingen tydlig förändring', mixed: 'Blandad riktning', unknown: 'Riktningsunderlag saknas' }
const metric = item => item?.days ? `${n(item.value)}/5 · ${item.days} svarsdagar` : 'Svar saknas'

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

function ObservationChart({ history, field, label, load = false }) {
  const values = history.filter(row => Number.isFinite(row[field]))
  const max = load ? Math.max(1, ...values.map(row => row[field])) : 5
  const x = index => 18 + index * 264 / Math.max(1, history.length - 1)
  const y = value => 86 - (load ? value / max : (value - 1) / 4) * 68
  return <section className="form-chart"><header><strong>{label}</strong><small>{load ? `0–${n(max)} RPE × min` : '1–5 · 5 är bäst'}</small></header>{values.length < 2 ? <p className="form-chart-empty">Minst två svarsdagar behövs för en utvecklingsgraf.</p> : <svg viewBox="0 0 300 110" role="img" aria-label={`${label}, ${values.length} svarsdagar. Exakta värden finns i tabellen nedan.`}>
    {[18, 52, 86].map(value => <line key={value} x1="18" x2="282" y1={value} y2={value} className="form-chart-grid" />)}
    {history.map((row, i) => Number.isFinite(row[field]) && <g key={row.date}>{i > 0 && Number.isFinite(history[i - 1][field]) && <line x1={x(i - 1)} y1={y(history[i - 1][field])} x2={x(i)} y2={y(row[field])} className="form-chart-line" />}<circle cx={x(i)} cy={y(row[field])} r="3.5" className="form-chart-dot"><title>{date(row.date)}: {n(row[field])}{row.estimated && load ? ' · innehåller planerad tid' : ''}</title></circle></g>)}
    <text x="18" y="105">{date(history[0]?.date)}</text><text x="282" y="105" textAnchor="end">{date(history.at(-1)?.date)}</text>
  </svg>}</section>
}

export function FormKollenView({ data, name, demo = false }) {
  const [open, setOpen] = useState(false), [period, setPeriod] = useState(14), [animate, setAnimate] = useState(!demo)
  const id = useId(), history = data.history.slice(-period), c = data.current, load = data.load
  const loadLabel = load.ratio == null ? 'Jämförelse saknas' : load.ratio < .8 ? 'Lägre än egen baslinje' : load.ratio > 1.2 ? 'Högre än egen baslinje' : 'Nära egen baslinje'
  return <section className={`form-kollen phase-${data.phase}${animate ? ' is-animated' : ''}`} aria-labelledby={`${id}-title`}>
    <header className="form-kollen-header"><div><p className="eyebrow">{demo ? 'Formkollen · endast fiktivt demo' : 'Formkollen'}</p><small>Rapporterade signaler · till och med {date(data.asOf)}</small></div><span className="form-confidence">Underlag: {data.confidence}</span></header>
    <div className="form-kollen-hero"><FormOrb phase={data.phase} animate={animate} /><div><small className="form-kollen-caption">{data.baselineKnown ? 'Aktuell tolkning' : 'Samlar egen historik'}</small><h3 id={`${id}-title`}>{data.label}</h3><p>{data.reasons[0]}</p><span className="form-direction"><b aria-hidden="true">{arrows[data.direction]}</b>{directions[data.direction]}</span></div></div>
    {data.flags.length > 0 && <aside className="form-flags"><strong>Att följa upp</strong><ul>{data.flags.map(flag => <li key={flag}>{flag}</li>)}</ul><small>Signaler för samtal, inte diagnos eller ett automatiskt träningsråd.</small></aside>}
    <div className="form-signals"><div><small>Belastning · 7 dagar</small><strong>{loadLabel}</strong><span>{load.known ? `${load.estimated ? '≈ ' : ''}${n(load.value)} RPE × min` : 'Användbar tid/RPE saknas'}</span><small>{load.known} av {load.total} efterrapporter kompletta</small></div><div><small>Kropp & sömn · 3 dagar</small><strong>{c.body.days ? `${n(c.body.value)}/5 i kroppkänsla` : 'Kroppkänsla saknas'}</strong><span>{data.sleep.nights ? `${heartDuration(data.sleep.minutes)} · ${data.sleep.nights} nätter` : 'Sömnsvar saknas'}</span><small>Inte uppmätt återhämtning</small></div><div><small>Fartkänsla · 3 dagar</small><strong>{c.speed.days ? `${n(c.speed.value)}/5` : 'Fartkänsla saknas'}</strong><span>{c.speed.days} svarsdagar</span><small>Upplevd, inte uppmätt fart</small></div></div>
    <div className="form-kollen-actions"><button type="button" className="text-button" aria-expanded={open} aria-controls={`${id}-detail`} onClick={() => setOpen(value => !value)}>{open ? 'Dölj utveckling ↑' : 'Visa utveckling & underlag →'}</button><button type="button" className="text-button" aria-pressed={animate} onClick={() => setAnimate(value => !value)}>{animate ? 'Pausa rörelse' : 'Visa mjuk rörelse'}</button></div>
    {open && <div id={`${id}-detail`} className="form-kollen-detail"><h4>Utveckling · {name}</h4><p>Faktiska dagsmedel. Luckor är saknade svar, inte noll. Inga principkurvor eller prognoser visas.</p><div className="form-periods" role="group" aria-label="Historikperiod">{[7, 14, 28].map(days => <button type="button" key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days} dagar</button>)}</div>
      <div className="form-charts"><ObservationChart history={history} field="body" label="Kroppkänsla" /><ObservationChart history={history} field="feeling" label="Dagskänsla" /><ObservationChart history={history} field="speed" label="Simfartkänsla" /><ObservationChart history={history} field="load" label="Rapporterad belastning" load /></div>
      <details><summary>Visa exakta dagsvärden</summary><div className="form-table-scroll"><table><caption>{date(history[0]?.date)}–{date(data.asOf)} · ≈ innehåller planerad tid</caption><thead><tr><th>Datum</th><th>Kropp /5</th><th>Känsla /5</th><th>Fart /5</th><th>RPE × min</th></tr></thead><tbody>{history.map(row => <tr key={row.date}><th scope="row">{date(row.date)}</th>{['body', 'feeling', 'speed'].map(key => <td key={key}>{n(row[key])}</td>)}<td>{row.estimated ? '≈ ' : ''}{n(row.load)}</td></tr>)}</tbody></table></div></details>
      <details><summary>Värden, perioder & täckning</summary><dl className="form-values">{[['Kropp', c.body], ['Dagskänsla', c.feeling], ['Simfartkänsla', c.speed]].map(([label, item]) => <div key={label}><dt>{label}</dt><dd>{metric(item)}<small>{date(item.start)}–{date(item.end)} · senaste {date(item.lastDay)}</small></dd></div>)}<div><dt>Sjukdomskoll</dt><dd>{!data.illnessAvailable ? 'Källan kunde inte hämtas' : data.illness ? `${illnessLabel(data.illness.status)} · ${date(data.illness.activity_date)}` : 'Svar saknas – betyder inte frisk'}</dd></div><div><dt>Sömn</dt><dd>{data.sleep.nights ? `${heartDuration(data.sleep.minutes)} · ${data.sleep.nights} nätter · kvalitet ${n(data.sleep.quality)}/5` : 'Saknas'}<small>Senaste tre kalenderdagarna · senaste {date(data.sleep.lastDay)}</small></dd></div><div><dt>Belastning</dt><dd>{n(load.value)} RPE × min · {load.known}/{load.total} kompletta rapporter · {load.days} dagar<small>{date(data.week.body.start)}–{date(data.asOf)} · {load.reported} med egen tid, {load.estimated} med planerad tid</small></dd></div><div><dt>Egen baslinje</dt><dd>{load.baselineWeeks}/5 tidigare veckor jämförbara{load.normalLoad != null ? ` · ${n(load.normalLoad)} RPE × min/vecka i snitt` : ' · minst 4 behövs'}</dd></div></dl><ul>{load.baseline.map(week => <li key={week.end}>{date(week.start)}–{date(week.end)}: {n(week.value)} RPE × min · {week.known}/{week.total} kompletta · {week.reported} egen tid / {week.estimated} planerad tid · {week.comparable ? 'jämförbar' : 'för lite underlag'}</li>)}</ul><p>Planerad tid är en uppskattning, inte bekräftad tränad tid. Ändrad rapportering och ändrad andel uppskattad tid kan påverka jämförelsen.</p>{data.limitations.map(text => <p key={text}>{text}</p>)}</details>
      <details><summary>Hur tolkas Formkollen?</summary><p>Preliminära produktregler, inte ett validerat formindex. Fem tidigare, separata sjudagarsperioder granskas; minst fyra behöver minst tre kompletta rapporter på två dagar och minst 80 % RPE/tid-täckning. Utan baslinje visas observationer men ingen formfas. Hög belastning ensam betyder inte trötthet eller nedträning.</p><p>Aktuellt är de senaste tre kalenderdagarna, minst två svarsdagar vardera för kropp, dagskänsla och simfart. Varje dags medel väger lika. Trenden jämför tre dagar mot de fyra före, minst två dagar per del, samt sju mot föregående sju, minst tre dagar per del. En förändring på 0,5/5 krävs. Stigande signal kräver ökning i båda jämförelserna utan motsatt trend i andra mått.</p><p>Starka positiva signaler: alla tre aktuella känslor minst 4,5/5, aktuellt Nej på sjukdom idag/igår samt minst två sömnsvar under tre dagar med minst åtta timmar vardera, inget Dålig och kvalitet minst 4/5 i snitt. Detta är en försiktig produktregel, inte ett individuellt sömnmål. Det bekräftar inte toppform. Känningar, sömnvarningar, ihållande tung känsla eller minst två mått som sjunker i båda jämförelserna prioriteras som uppföljning.</p><p>Underlag gott: aktuella känslor på minst två dagar vardera, två sömnsvar, ett aktuellt giltigt sjukdomssvar (även känningar eller sjuk) och jämförbar belastning/baslinje. Måttligt: kropp och dagskänsla på två dagar vardera. Annars begränsat. Detta beskriver bara datatäckning, inte sannolikheten för en formtopp. Inga träningsbeslut fattas och ingen AI används.</p></details>
    </div>}
  </section>
}

export default function FormKollenCard({ profile, code, request = apiRequest, asOf, excluded = false }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    if (excluded) return undefined
    request(`/api/training?formKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { retry: false }).then(data => {
      if (data.profileId !== profile.id || data.asOf !== asOf || !Array.isArray(data.history)) throw new Error('Underlaget är ofullständigt eller har ett annat datum. Uppdatera sidan.')
      if (active) setResult(data)
    }).catch(failure => { if (active) setError(failure.message || 'Underlaget kunde inte hämtas.') })
    return () => { active = false }
  }, [profile.id, code, asOf, excluded, refresh, request])
  if (excluded) return <section className="form-kollen"><p className="eyebrow">Formkollen</p><p>Profilen ingår inte i underlaget.</p></section>
  if (!result || error) return <section className="form-kollen"><p className="eyebrow">Formkollen</p><p role="status">{error || 'Hämtar rapporterade signaler och egen historik…'}</p>{error && <button type="button" onClick={() => setRefresh(value => value + 1)}>Försök igen</button>}</section>
  return <FormKollenView data={result} name={profile.displayName} />
}
