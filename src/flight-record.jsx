import React, { useEffect, useRef, useState } from 'react'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { FLIGHT_PERIODS, flightTimeComparison } from '../shared/flight-record.js'
import { formatTrainingTime, isTimeDate } from '../shared/swim-times.js'
import './flight-record.css'

const sections = [
  ['feel', 'Känsla'], ['times', 'Simmade tider'], ['training', 'Träning'], ['sleep', 'Sömn'],
]
const metrics = {
  feel: [
    { key: 'speedFeeling', label: 'Fartkänsla', unit: '/ 5', scale: [1, 5], note: 'Din skattning efter simpass.' },
    { key: 'body', label: 'Kroppskänsla', unit: '/ 5', scale: [1, 5], note: 'Din skattning i incheckningarna.' },
    { key: 'feeling', label: 'Dagskänsla', unit: '/ 5', scale: [1, 5], note: 'Din skattning i incheckningarna.' },
  ],
  training: [
    { key: 'load', label: 'Belastning', unit: 'RPE × min', bars: true },
    { key: 'reportedMeters', label: 'Rapporterade simmeter', unit: 'm', bars: true },
    { key: 'reportedMinutes', label: 'Rapporterad träningstid', unit: 'min', bars: true },
    { key: 'rpe', label: 'Upplevd ansträngning', unit: '/ 10', scale: [1, 10], note: 'Genomsnittlig RPE för genomförda pass.' },
  ],
  sleep: [
    { key: 'sleepMinutes', label: 'Sovtid', unit: 'tim', bars: true },
    { key: 'sleepQuality', label: 'Sömnkvalitet', unit: '/ 5', scale: [1, 5], note: 'Din skattning från sömnkollen.' },
  ],
}
const seriesKinds = [['test', 'Testlopp'], ['training', 'Träningstider'], ['race', 'Tävlingsresultat']]
const number = (value, digits = 1) => value.toLocaleString('sv-SE', { maximumFractionDigits: digits })
const shortDate = (date) => new Date(date + 'T12:00:00Z').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const daysBetween = (a, b) => (Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000
const duration = (minutes) => `${Math.floor(minutes / 60)} tim ${minutes % 60} min`

function chartScale(values, metric, timed) {
  if (timed) {
    if (!values.length) return [0, 100]
    return [Math.max(0, Math.floor((Math.min(...values) - 25) / 50) * 50), Math.ceil((Math.max(...values) + 25) / 50) * 50]
  }
  if (metric.scale) return metric.scale
  const max = Math.max(1, ...values)
  const rounding = Math.pow(10, Math.max(0, Math.floor(Math.log10(max)) - 1))
  return [0, Math.ceil(max / rounding) * rounding]
}

function FlightPlot({ days, metric, timed, points, selected, onSelect, asOf, target, period }) {
  const frame = useRef(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const measure = () => setWidth(Math.max(240, Math.round(frame.current?.clientWidth || 640)))
    measure()
    if (!globalThis.ResizeObserver) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])

  const height = 220
  const start = days[0].date
  const goalOffset = target ? daysBetween(asOf, target.date) : 0
  // Distant calendar events stay in the destination header, so the history has room.
  const future = goalOffset > 0 && goalOffset <= Math.min(14, Math.floor(period / 2)) ? goalOffset : 0
  const domain = Math.max(1, days.length - 1 + future)
  const left = timed ? 62 : 50
  const right = width - 18
  const top = 22
  const base = height - 30
  const values = points.map(point => point.value).filter(Number.isFinite)
  const [min, max] = chartScale(values, metric, timed)
  const x = (date) => left + daysBetween(start, date) / domain * (right - left)
  const y = (value) => top + (timed ? (value - min) : (max - value)) / (max - min) * (base - top)
  const today = x(asOf)
  const ticks = timed ? [min, Math.round((min + max) / 2), max] : metric.scale?.[1] === 5 ? [1, 2, 3, 4, 5] : [min, (min + max) / 2, max]
  const midpoint = days[Math.floor((days.length - 1) / 2)]?.date
  const axis = [...new Set([start, ...(width > 430 && midpoint ? [midpoint] : []), asOf])]
  let path = ''
  let previous = null
  if (!timed && !metric.bars) for (const point of points) {
    if (!Number.isFinite(point.value)) { previous = null; continue }
    path += `${previous ? 'L' : 'M'} ${x(point.date)} ${y(point.value)} `
    previous = point
  }
  const todayPoint = points.find(point => point.date === asOf && Number.isFinite(point.value))
  const plotLabel = timed ? 'Lopptid · snabbare högre upp' : `${metric.label} · ${metric.unit}`
  const barWidth = Math.min(20, Math.max(2, (right - left) / (domain + 2) * .64))
  const tickValue = (value) => formatTrainingTime(value)
  const pointValue = (value) => timed ? formatTrainingTime(value) : `${number(value)} ${metric.unit}`
  return <figure className="flight-plot" ref={frame} aria-label={plotLabel}>
    <figcaption>{plotLabel}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${plotLabel} från ${shortDate(start)} till idag. Exakta värden finns under diagrammet.`}>
      {future > 0 && <rect className="flight-future" x={today} y={top} width={right - today} height={base - top} />}
      {ticks.map(tick => <g key={tick}>
        <line className="flight-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text x={left - 7} y={y(tick) + 4} textAnchor="end">{timed ? tickValue(tick) : number(tick)}</text>
      </g>)}
      <line className="flight-today" x1={today} x2={today} y1={top - 6} y2={base} />
      {future > 0 && <line className="flight-goal" x1={right} x2={right} y1={top - 6} y2={base} />}
      {selected !== asOf && <line className="flight-selected" x1={x(selected)} x2={x(selected)} y1={top} y2={base} />}
      {path && <path className="flight-observed-line" d={path} fill="none" />}
      {points.filter(point => Number.isFinite(point.value)).map(point => {
        const label = `${shortDate(point.date)} · ${pointValue(point.value)}`
        const marked = point.date === selected ? ' selected' : ''
        return metric.bars && !timed
          ? <rect key={point.date} className={'flight-mark' + marked} x={x(point.date) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(2, base - y(point.value))} rx="1.5" onClick={() => onSelect(point.date)}><title>{label}</title></rect>
          : <circle key={point.date} className={'flight-mark' + marked} cx={x(point.date)} cy={y(point.value)} r={marked ? 6 : timed ? 4.5 : period === 90 ? 2 : 3} onClick={() => onSelect(point.date)}><title>{label}</title></circle>
      })}
      <text className="flight-plane" x={today - 7} y={todayPoint && !timed && !metric.bars ? Math.max(19, y(todayPoint.value) - 9) : 19} textAnchor="end" aria-hidden="true">✈︎</text>
      {axis.map(date => <text key={date} x={date === asOf ? today - 3 : x(date)} y={height - 9} textAnchor={date === asOf ? 'end' : date === start ? 'start' : 'middle'}>{date === asOf ? 'Idag' : shortDate(date)}</text>)}
      {future > 0 && right - today >= 34 && <text x={right} y={height - 9} textAnchor="end">Mål</text>}
    </svg>
    <div className="flight-legend"><span><i/> Registrerade uppgifter</span>{future > 0 && <span><i className="flight-legend-future"/> Planerad tävlingsdag</span>}</div>
  </figure>
}

function timeDelta(value) {
  if (value === 0) return 'Samma tid som senast'
  return `${(Math.abs(value) / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s ${value > 0 ? 'snabbare' : 'långsammare'} än senast`
}

function DayDetail({ day, metric, timed, series, timedPoints }) {
  const result = timed ? timedPoints.find(point => point.date === day.date) : null
  let value = 'Uppgift saknas', context = '', caption = ''
  if (timed) {
    if (result) {
      value = formatTrainingTime(result.centis)
      const delta = flightTimeComparison(timedPoints, result.date)
      caption = delta == null ? `Första jämförbara dagen i perioden` : timeDelta(delta)
      context = [result.source, result.competition, result.count > 1 && `Snabbast av ${result.count} tider denna dag`].filter(Boolean).join(' · ')
    } else context = series ? 'Ingen tid i den här serien den dagen.' : 'Välj en serie när du har en registrerad tid i perioden.'
  } else {
    const observed = day[metric.key]
    if (observed != null) value = metric.key === 'sleepMinutes' ? duration(observed) : `${number(observed)} ${metric.unit}`
    context = metric.note ?? ''
    if (metric.key === 'load' && day.loadCount) {
      context = `Underlag från ${day.loadCount} av ${day.sessions} registrerade pass.`
      if (day.loadEstimatedCount) caption = `${day.loadEstimatedCount} pass har uppskattad tid`
    }
    if (metric.key === 'reportedMeters' && day.estimatedMeters != null) caption = `≈ ${number(day.estimatedMeters)} m från kopplade pass`
    if (metric.key === 'reportedMinutes' && day.estimatedMinutes != null) caption = `≈ ${number(day.estimatedMinutes)} min från kopplade pass`
  }
  return <div className="flight-day-detail" aria-live="polite">
    <small>{shortDate(day.date)}</small>
    <div><strong>{value}</strong>{caption && <span>{caption}</span>}</div>
    {context && <p>{context}</p>}
    {timed && series && <p>{series.label}</p>}
  </div>
}

function isVisibleCompetition(item, asOf) {
  return item?.id && isTimeDate(item.startDate) && (item.endDate || item.startDate) >= asOf
}

export function FlightRecordView({ data, competitions = [] }) {
  const [period, setPeriod] = useState(28)
  const [section, setSection] = useState('feel')
  const [metricChoice, setMetricChoice] = useState({})
  const [seriesKey, setSeriesKey] = useState('')
  const [selectedDate, setSelectedDate] = useState(null)
  const [targetId, setTargetId] = useState('')
  const start = coachWeekAddDays(data.asOf, 1 - period)
  const days = data.days.filter(day => day.date >= start && day.date <= data.asOf)
  const available = data.series.filter(group => group.points.some(point => point.date >= start))
  const timed = section === 'times'
  const series = available.find(group => group.key === seriesKey) ?? available[0]
  const timedPoints = series?.points.filter(point => point.date >= start) ?? []
  const options = metrics[section] ?? []
  const metric = options.find(option => option.key === metricChoice[section]) ?? options[0] ?? {}
  const points = timed
    ? timedPoints.map(point => ({ date: point.date, value: point.centis }))
    : days.map(day => ({ date: day.date, value: metric.key === 'sleepMinutes' && day.sleepMinutes != null ? day.sleepMinutes / 60 : day[metric.key] }))
  const latest = points.filter(point => Number.isFinite(point.value)).at(-1)?.date ?? data.asOf
  const day = days.find(item => item.date === (selectedDate ?? latest)) ?? days.at(-1)
  const targets = competitions.filter(item => isVisibleCompetition(item, data.asOf))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const competition = targets.find(item => item.id === targetId) ?? targets[0]
  const target = competition ? { title: competition.title, date: competition.startDate < data.asOf ? data.asOf : competition.startDate } : null
  const remaining = target ? daysBetween(data.asOf, target.date) : null
  const coverage = points.filter(point => Number.isFinite(point.value)).length

  return <>
    <section className="flight-destination">
      <div><p className="eyebrow">🏁 Tävlingsmål</p><h2>{target?.title ?? 'Inget kommande tävlingsmål'}</h2>
        {target && <p>{remaining === 0 ? 'Idag' : `Om ${remaining} ${remaining === 1 ? 'dag' : 'dagar'}`} · {shortDate(target.date)}</p>}
      </div>
      {targets.length > 1 && <label className="flight-field">Tävling
        <select value={competition.id} onChange={event => setTargetId(event.target.value)}>
          {targets.map(item => <option value={item.id} key={item.id}>{item.title} · {shortDate(item.startDate)}</option>)}
        </select>
      </label>}
    </section>
    <div className="flight-filters">
      <div className="flight-segments" role="group" aria-label="Period">
        {FLIGHT_PERIODS.map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setSelectedDate(null) }}>{value} dagar</button>)}
      </div>
      <div className="flight-segments" role="group" aria-label="Visa i diagrammet">
        {sections.map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => { setSection(key); setSelectedDate(null) }}>{label}</button>)}
      </div>
    </div>
    {timed && available.length > 0 && <label className="flight-field">Jämförbara tider
      <select value={series.key} onChange={event => { setSeriesKey(event.target.value); setSelectedDate(null) }}>
        {seriesKinds.map(([kind, label]) => available.some(group => group.kind === kind) && <optgroup key={kind} label={label}>
          {available.filter(group => group.kind === kind).map(group => <option key={group.key} value={group.key}>{group.label}</option>)}
        </optgroup>)}
      </select>
    </label>}
    {!timed && <label className="flight-field">Mått
      <select value={metric.key} onChange={event => { setMetricChoice(current => ({ ...current, [section]: event.target.value })); setSelectedDate(null) }}>
        {options.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}
      </select>
    </label>}
    {coverage > 0 && <FlightPlot days={days} metric={metric} timed={timed} points={points} selected={day.date} onSelect={setSelectedDate} asOf={data.asOf} target={target} period={period} />}
    <div className="flight-detail-row">
      <p>{coverage ? `${coverage} ${timed ? 'jämförbara' : 'rapporterade'} ${coverage === 1 ? 'dag' : 'dagar'} i perioden` : 'Inga registrerade värden för det här måttet i perioden.'}</p>
      <label className="flight-field">Visa dag
        <select value={day.date} onChange={event => setSelectedDate(event.target.value)}>
          {[...days].reverse().map(item => <option value={item.date} key={item.date}>{item.date === data.asOf ? 'Idag · ' : ''}{shortDate(item.date)}</option>)}
        </select>
      </label>
    </div>
    <DayDetail day={day} metric={metric} timed={timed} series={series} timedPoints={timedPoints} />
    {data.warnings.length > 0 && <details className="flight-method"><summary>Underlag som saknas</summary><ul>{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <details className="flight-method">
      <summary>Så läser du formresan</summary>
      <p>Testlopp och träningstider jämförs med samma distans, simsätt, bassäng, start, hjälpmedel, tidtagning och övriga förutsättningar. Varje punkt visar dagens snabbaste tid i serien. Tävlingsresultat ligger för sig.</p>
      <p>Luckor är dagar utan ett värde i underlaget. Vid ett valt tävlingsmål visar högerkanten datumet när det ligger nära nog. Kurvan visar dina tidigare skattningar och rapporterade resultat.</p>
    </details>
  </>
}

export default function FlightRecord({ code, request, competitions, onBack, onRefreshAccess }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    request('/api/training?flightRecord=data', code, { signal: controller.signal, retry: false }).then(data => {
      if (!controller.signal.aborted) setResult(data)
    }).catch(failure => {
      if (controller.signal.aborted) return
      setError(failure.message)
      void onRefreshAccess()
    })
    return () => controller.abort()
  }, [code, request, attempt, onRefreshAccess])

  return <div className="flight-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="flight-heading">
      <p className="eyebrow">Din formresa</p>
      <h1>Flight Record <span aria-hidden="true">✈︎</span></h1>
    </header>
    {error ? <div className="flight-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(current => current + 1)}>Försök igen</button></div>
      : result ? <FlightRecordView data={result} competitions={competitions} />
        : <p className="empty" role="status">Hämtar din formresa…</p>}
  </div>
}
