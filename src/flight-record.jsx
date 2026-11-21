import React, { useEffect, useMemo, useRef, useState } from 'react'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { FLIGHT_PERIODS, flightTimeComparison } from '../shared/flight-record.js'
import { formatTrainingTime, isTimeDate } from '../shared/swim-times.js'
import { changeFlightWeight, defaultFlightWeights, flightLine, flightSignalGroups, readFlightWeights } from '../shared/flight-line.js'
import FlightMeasureSettings from './flight-measure-settings.jsx'
import './flight-record.css'

const sections = [
  ['line', 'Flight-linje'], ['feel', 'Känsla'], ['times', 'Simmade tider'], ['training', 'Träning'], ['sleep', 'Återhämtning'],
]
const lineMetric = { label: 'Flight-linje', unit: '', scale: [0, 100], subtitle: '50 = vanlig nivå' }
const timeMetric = { key: 'time' }
const metrics = {
  feel: [
    { key: 'speedFeeling', label: 'Fartkänsla', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning efter simpass.' },
    { key: 'body', label: 'Kroppskänsla', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning i incheckningarna.' },
    { key: 'feeling', label: 'Dagskänsla', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning i incheckningarna.' },
    { key: 'energy', label: 'Energi', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning i incheckningarna.' },
    { key: 'motivation', label: 'Motivation', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning inför träningen.' },
    { key: 'passRating', label: 'Passbetyg', unit: '/ 5', scale: [1, 5], note: 'Simmarens omdöme om passet.' },
    { key: 'setupRating', label: 'Uppläggsbetyg', unit: '/ 5', scale: [1, 5], note: 'Simmarens omdöme om upplägget.' },
    { key: 'temperature', label: 'Upplevd temperatur', unit: '/ 5', scale: [1, 5], note: 'Hur träningsmiljön kändes. 1 = väldigt kallt, 5 = för varmt.' },
  ],
  training: [
    { key: 'load', label: 'Belastning', unit: 'RPE × min', bars: true },
    { key: 'reportedMeters', label: 'Rapporterade simmeter', unit: 'm', bars: true },
    { key: 'reportedMinutes', label: 'Rapporterad träningstid', unit: 'min', bars: true },
    { key: 'sessions', label: 'Genomförda pass', unit: 'pass', bars: true },
    { key: 'estimatedMeters', label: 'Uppskattade simmeter', unit: 'm', bars: true, note: 'Planerad mängd från genomförda och kopplade pass.' },
    { key: 'estimatedMinutes', label: 'Uppskattad träningstid', unit: 'min', bars: true, note: 'Planerad tid från genomförda och kopplade pass.' },
    { key: 'rpe', label: 'Upplevd ansträngning', unit: '/ 10', scale: [1, 10], note: 'Genomsnittlig RPE för genomförda pass.' },
  ],
  sleep: [
    { key: 'sleepMinutes', label: 'Sovtid', unit: 'tim', bars: true },
    { key: 'sleepQuality', label: 'Sömnkvalitet', unit: '/ 5', scale: [1, 5], note: 'Simmarens skattning från sömnkollen.' },
    { key: 'sleepGoal', label: 'Sovtid mot sömnmål', unit: '/ 5', scale: [1, 5], note: 'Uppnått personligt sömnmål ger 5 av 5.' },
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

function FlightPlot({ days, metric, timed, points, selected, onSelect, asOf, target, period, status }) {
  const graph = useRef(null)
  const [{ width, height }, setSize] = useState({ width: 640, height: 220 })
  useEffect(() => {
    const element = graph.current
    const measure = () => {
      const { clientWidth, clientHeight } = element
      if (!clientWidth || !clientHeight) return
      const width = Math.max(240, clientWidth)
      setSize(current => current.width === width && current.height === clientHeight ? current : { width, height: clientHeight })
    }
    measure()
    if (!globalThis.ResizeObserver) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

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
  const plotLabel = timed ? 'Lopptid · snabbare högre upp' : `${metric.label} · ${metric.subtitle ?? metric.unit}`
  const latestPoint = points.findLast(point => Number.isFinite(point.value))
  const barWidth = Math.min(20, Math.max(2, (right - left) / (domain + 2) * .64))
  const tickValue = (value) => formatTrainingTime(value)
  const pointValue = (value) => timed ? formatTrainingTime(value) : [number(value), metric.unit].filter(Boolean).join(' ')
  return <figure className={onSelect ? 'flight-plot' : 'flight-plot flight-plot-static'} aria-label={plotLabel}>
    <figcaption>{plotLabel}</figcaption>
    <svg ref={graph} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${plotLabel} från ${shortDate(start)} till idag.${latestPoint ? ` Senaste värde ${pointValue(latestPoint.value)} (${shortDate(latestPoint.date)}).` : ''}`}>
      {future > 0 && <rect className="flight-future" x={today} y={top} width={right - today} height={base - top} />}
      {ticks.map(tick => <g key={tick}>
        <line className="flight-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text x={left - 7} y={y(tick) + 4} textAnchor="end">{timed ? tickValue(tick) : number(tick)}</text>
      </g>)}
      <line className="flight-today" x1={today} x2={today} y1={top - 6} y2={base} />
      {future > 0 && <line className="flight-goal" x1={right} x2={right} y1={top - 6} y2={base} />}
      {selected && selected !== asOf && <line className="flight-selected" x1={x(selected)} x2={x(selected)} y1={top} y2={base} />}
      {path && <path className="flight-observed-line" d={path} fill="none" />}
      {points.filter(point => Number.isFinite(point.value)).map(point => {
        const label = `${shortDate(point.date)} · ${pointValue(point.value)}`
        const marked = point.date === selected ? ' selected' : ''
        const onClick = onSelect ? () => onSelect(point.date) : undefined
        if (point.newTimeLift || (point.timeLift > 0 && point.events.some(event => event.date === point.date))) {
          const cx = x(point.date), cy = y(point.value), size = marked ? 7 : 5.5
          return <path key={point.date} className="flight-lift-mark" d={`M ${cx} ${cy - size} l ${size} ${size} l ${-size} ${size} l ${-size} ${-size} Z`} onClick={onClick}><title>{label} · tidslyft</title></path>
        }
        return metric.bars && !timed
          ? <rect key={point.date} className={'flight-mark' + marked} x={x(point.date) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(2, base - y(point.value))} rx="1.5" onClick={onClick}><title>{label}</title></rect>
          : <circle key={point.date} className={'flight-mark' + marked} cx={x(point.date)} cy={y(point.value)} r={marked ? 6 : timed ? 4.5 : period === 90 ? 2 : 3} onClick={onClick}><title>{label}</title></circle>
      })}
      {!values.length && <text className="flight-empty-label" x={(left + right) / 2} y={(top + base) / 2} textAnchor="middle">För lite underlag ännu</text>}
      <text className="flight-plane" x={today - 7} y={todayPoint && !timed && !metric.bars ? Math.max(19, y(todayPoint.value) - 9) : 19} textAnchor="end" aria-hidden="true">✈︎</text>
      {axis.map(date => <text key={date} x={date === asOf ? today - 3 : x(date)} y={height - 9} textAnchor={date === asOf ? 'end' : date === start ? 'start' : 'middle'}>{date === asOf ? 'Idag' : shortDate(date)}</text>)}
      {future > 0 && right - today >= 34 && <text x={right} y={height - 9} textAnchor="end">Mål</text>}
    </svg>
    <div className="flight-legend">
      <span><i/> {metric === lineMetric ? 'Sammanvägda signaler' : 'Registrerade uppgifter'}</span>
      {metric === lineMetric && <span><i className="flight-legend-lift"/> Nytt tidslyft</span>}
      {future > 0 && <span><i className="flight-legend-future"/> {onSelect ? 'Planerad tävlingsdag' : target.title}</span>}
      {status && <span role="status">{status}</span>}
    </div>
  </figure>
}

function timeDelta(value) {
  if (value === 0) return 'Samma tid som senast'
  return `${(Math.abs(value) / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s ${value > 0 ? 'snabbare' : 'långsammare'} än senast`
}

function DayDetail({ day, metric, timed, series, timedPoints, showMetric }) {
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
    <small>{showMetric ? `${metric.label} · ` : ''}{shortDate(day.date)}</small>
    <div><strong>{value}</strong>{caption && <span>{caption}</span>}</div>
    {context && <p>{context}</p>}
    {timed && series && <p>{series.label}</p>}
  </div>
}

function isVisibleCompetition(item, asOf) {
  return item?.id && isTimeDate(item.startDate) && (item.endDate || item.startDate) >= asOf
}

function FlightWeightRow({ signal, label, weights, selectedCount, onChange, saving, canSelect }) {
  const [draft, setDraft] = useState(null)
  const startWeights = useRef(null)
  const isTime = signal === 'times'
  const selected = weights[signal] > 0
  const max = isTime ? 100 : 100 - Math.max(0, selectedCount - 1)
  const initialShare = isTime ? defaultFlightWeights.times : Math.round(100 / (selectedCount + 1))
  return <div className="flight-weight-row">
    <label><input type="checkbox" checked={selected} disabled={saving || (!canSelect && !selected)}
      onChange={event => onChange(signal, event.target.checked ? initialShare : 0)} /> {label}</label>
    <div className="flight-weight-percent">
      <input type="number" inputMode="numeric" min={1} max={max} step={1} value={draft ?? weights[signal] ?? 0}
        aria-label={`Procentvikt för ${label}`} disabled={!selected || saving} readOnly={!isTime && selectedCount === 1}
        onFocus={() => { startWeights.current = weights }}
        onChange={event => {
          const { value, valueAsNumber } = event.target
          setDraft(value)
          if (Number.isInteger(valueAsNumber) && valueAsNumber > 0) onChange(signal, valueAsNumber, startWeights.current)
        }}
        onBlur={() => { setDraft(null); startWeights.current = null }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <span aria-hidden="true">%</span>
    </div>
  </div>
}

function FlightWeightControls({ weights, onChange, onSave, onReset, dirty, saving, available, message, customMeasures, sleepGoalMinutes, measuresAvailable }) {
  const groups = flightSignalGroups(customMeasures)
  const selectedCount = Object.entries(weights).filter(([key, value]) => key !== 'times' && value > 0).length
  const row = ({ key, label }) => <FlightWeightRow key={key} signal={key} label={label}
    weights={weights} selectedCount={selectedCount} onChange={onChange} saving={saving}
    canSelect={key === 'times' || (selectedCount < 100 && (key !== 'sleepGoal' || sleepGoalMinutes != null))} />
  return <details className="flight-weights">
    <summary>Vikta signaler{dirty ? ' · osparade ändringar' : ''}</summary>
    <p>Kryssa i måtten som ska ingå och ange en procentvikt. Övriga valda mått räknas om så att summan blir 100 %.</p>
    {groups.map(group => <fieldset className="flight-weight-group" key={group.label}>
      <legend>{group.label}</legend>
      <div className="flight-weight-list">{group.signals.filter(signal => signal.key !== 'sleepGoal' || measuresAvailable || weights.sleepGoal > 0).map(row)}</div>
      {group.label === 'Återhämtning' && measuresAvailable && sleepGoalMinutes == null && <p>Ställ in simmarens sömnmål för att vikta sovtid.</p>}
    </fieldset>)}
    {selectedCount > 0 && <p className="flight-weight-total">{selectedCount} valda mått · 100 % totalt</p>}
    <fieldset className="flight-weight-group flight-weight-lift">
      <legend>Tidslyft</legend>
      {row({ key: 'times', label: 'Simmade tider' })}
      <p>Separat från grundvikterna. En snabbare jämförbar simtid kan ge upp till 5 steg vid 100 %.</p>
    </fieldset>
    <div className="flight-actions">
      <button className="primary-button" type="button" disabled={!available || !dirty || saving} onClick={onSave}>{saving ? 'Sparar…' : 'Spara vikter'}</button>
      <button className="secondary-button" type="button" disabled={saving} onClick={onReset}>Återställ förval</button>
    </div>
    {!available && <p className="flight-muted">Du kan prova vikterna här. Sparandet är inte tillgängligt ännu.</p>}
    {message.text && <p className={message.error ? 'flight-error' : ''} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </details>
}

function FlightLineDetail({ point }) {
  const { components, value, base, timeLift, events, usedWeight, totalWeight } = point
  const usable = components.filter(component => component.score != null)
  return <div className="flight-day-detail" aria-live="polite">
    <small>{shortDate(point.date)}</small>
    <div><strong>{value == null ? 'För lite underlag' : number(value)}</strong>{timeLift > 0 && <span>⚡ +{number(timeLift)} från simtider</span>}</div>
    {value != null && <p>Grundvärde {number(base)} · {usable.length} av {components.length} valda signaler med underlag</p>}
    {!components.length && <p>Välj minst ett mått under Vikta signaler.</p>}
    {components.length > 0 && value == null && <p>{usable.length} av {components.length} valda signaler har underlag. Minst två behövs när flera är valda, med minst halva den valda vikten.</p>}
    {components.length > 0 && <details className="flight-method">
      <summary>Vad påverkade linjen?</summary>
      <ul className="flight-contributions">
        {components.map(item => <li key={item.key}>
          <strong>{item.label}</strong>
          <span>{item.score == null ? `Underlag saknas · ${item.currentDays} svarsdagar senaste veckan, ${item.referenceDays} i jämförelsen`
            : `${number(item.current)}/5 nu mot median ${number(item.reference)}/5 · ${number(item.weight * 100 / usedWeight, 0)} % av tillgänglig vikt`}</span>
        </li>)}
      </ul>
      {usedWeight < totalWeight && <p>Övriga valda signaler saknar tillräckligt underlag för dagen.</p>}
    </details>}
    {events.length > 0 && <ul className="flight-time-evidence">
      {events.map(event => <li key={event.date}>
        <strong>{shortDate(event.date)} · {formatTrainingTime(event.centis)}</strong>
        <span>{event.label} · {number((event.reference - event.centis) / 100, 2)} s snabbare än medianen från {event.priorDays} tidigare jämförbara dagar.</span>
      </li>)}
    </ul>}
  </div>
}

export function FlightRecordView({ data, competitions = [], saveWeights, saveMeasure }) {
  const [period, setPeriod] = useState(28)
  const [section, setSection] = useState('line')
  const [metricChoice, setMetricChoice] = useState({})
  const [seriesKey, setSeriesKey] = useState('')
  const [selectedDate, setSelectedDate] = useState(null)
  const [targetId, setTargetId] = useState('')
  const [savedWeights, setSavedWeights] = useState(() => readFlightWeights(data.weights))
  const [weights, setWeights] = useState(() => readFlightWeights(data.weights))
  const [saving, setSaving] = useState(false)
  const [weightMessage, setWeightMessage] = useState({ text: '' })
  const saveLock = useRef(false)
  const dirty = [...new Set([...Object.keys(weights), ...Object.keys(savedWeights)])]
    .some(key => (weights[key] ?? 0) !== (savedWeights[key] ?? 0))
  const weighted = section === 'line'
  const customMeasures = data.customMeasures ?? []
  const line = useMemo(() => flightLine(data.days, data.contextDays ?? [], data.timeLifts ?? [], weights, data.customMeasures), [data, weights])
  const save = async () => {
    if (!dirty || saveLock.current || !data.weightsAvailable || !saveWeights) return
    saveLock.current = true
    setSaving(true)
    setWeightMessage({ text: '' })
    try {
      const result = await saveWeights(weights)
      setWeights(result.weights)
      setSavedWeights(result.weights)
      setWeightMessage({ text: 'Vikterna är sparade.' })
    } catch (error) {
      setWeightMessage({ text: error.message, error: true })
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }
  const start = coachWeekAddDays(data.asOf, 1 - period)
  const days = data.days.filter(day => day.date >= start && day.date <= data.asOf)
  const available = data.series.filter(group => group.points.some(point => point.date >= start))
  const timed = section === 'times'
  const series = available.find(group => group.key === seriesKey) ?? available[0]
  const timedPoints = series?.points.filter(point => point.date >= start) ?? []
  const options = section === 'custom' ? customMeasures.map(measure => ({ ...measure, unit: '/ 5', scale: [1, 5], note: measure.category }))
    : (metrics[section] ?? []).filter(metric => metric.key !== 'sleepGoal' || data.sleepGoalMinutes != null)
  const checkedMetrics = metricChoice[section] ?? options.slice(0, 1).map(option => option.key)
  const shownMetrics = weighted ? [lineMetric] : timed ? [timeMetric] : options.filter(option => checkedMetrics.includes(option.key))
  const plots = shownMetrics.map(metric => ({
    metric,
    points: weighted ? line.filter(day => day.date >= start) : timed
      ? timedPoints.map(point => ({ date: point.date, value: point.centis }))
      : days.map(day => ({ date: day.date, value: metric.key === 'sleepMinutes' && day.sleepMinutes != null ? day.sleepMinutes / 60 : day[metric.key] })),
  }))
  const observedDates = new Set(plots.flatMap(({ points }) => points.filter(point => Number.isFinite(point.value)).map(point => point.date)))
  const latest = days.findLast(item => observedDates.has(item.date))?.date ?? data.asOf
  const day = days.find(item => item.date === (selectedDate ?? latest)) ?? days.at(-1)
  const targets = competitions.filter(item => isVisibleCompetition(item, data.asOf))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const competition = targets.find(item => item.id === targetId) ?? targets[0]
  const target = competition ? { title: competition.title, date: competition.startDate < data.asOf ? data.asOf : competition.startDate } : null
  const remaining = target ? daysBetween(data.asOf, target.date) : null
  const coverage = observedDates.size
  const linePoint = weighted ? line.find(point => point.date === day.date) : null

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
        {[...sections, ...(customMeasures.length ? [['custom', 'Egna mått']] : [])].map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => { setSection(key); setSelectedDate(null) }}>{label}</button>)}
      </div>
    </div>
    {weighted && data.measuresAvailable && saveMeasure && <FlightMeasureSettings data={data} onSave={saveMeasure} />}
    {weighted && <FlightWeightControls weights={weights} customMeasures={customMeasures} sleepGoalMinutes={data.sleepGoalMinutes} measuresAvailable={data.measuresAvailable}
      onChange={(key, value, initial) => { setWeights(current => changeFlightWeight(initial ?? current, key, value)); setWeightMessage({ text: '' }) }}
      onSave={save} onReset={() => { setWeights({ ...defaultFlightWeights }); setWeightMessage({ text: '' }) }} dirty={dirty} saving={saving} available={data.weightsAvailable} message={weightMessage} />}
    {timed && available.length > 0 && <label className="flight-field">Jämförbara tider
      <select value={series.key} onChange={event => { setSeriesKey(event.target.value); setSelectedDate(null) }}>
        {seriesKinds.map(([kind, label]) => available.some(group => group.kind === kind) && <optgroup key={kind} label={label}>
          {available.filter(group => group.kind === kind).map(group => <option key={group.key} value={group.key}>{group.label}</option>)}
        </optgroup>)}
      </select>
    </label>}
    {!weighted && !timed && <fieldset className="flight-metric-picker">
      <legend>Mått att visa</legend>
      {options.map(option => <label key={option.key}><input type="checkbox" checked={checkedMetrics.includes(option.key)}
        onChange={event => {
          const keys = event.target.checked ? [...checkedMetrics, option.key] : checkedMetrics.filter(key => key !== option.key)
          setMetricChoice(current => ({ ...current, [section]: keys }))
        }} />{option.label}</label>)}
    </fieldset>}
    {coverage > 0 && <div className="flight-chart-list">
      {plots.map(({ metric, points }) => <FlightPlot key={metric.key ?? 'line'} days={days} metric={metric} timed={timed}
        points={points} selected={day.date} onSelect={setSelectedDate} asOf={data.asOf} target={target} period={period} />)}
    </div>}
    {plots.length > 0 ? <div className="flight-detail-row">
      <p>{coverage ? `${coverage} ${weighted ? 'dagar med tillräckligt underlag' : timed ? 'jämförbara dagar' : 'dagar med rapporterade mått'} i perioden` : 'För lite underlag för att visa en graf i perioden.'}</p>
      <label className="flight-field">Visa dag
        <select value={day.date} onChange={event => setSelectedDate(event.target.value)}>
          {[...days].reverse().map(item => <option value={item.date} key={item.date}>{item.date === data.asOf ? 'Idag · ' : ''}{shortDate(item.date)}</option>)}
        </select>
      </label>
    </div> : <p>Välj ett eller flera mått att visa.</p>}
    {linePoint ? <FlightLineDetail point={linePoint} /> : plots.length > 0 && <div className="flight-day-list">
      {plots.map(({ metric }) => <DayDetail key={metric.key} day={day} metric={metric} timed={timed} series={series} timedPoints={timedPoints} showMetric={plots.length > 1} />)}
    </div>}
    {data.warnings.length > 0 && <details className="flight-method"><summary>Underlag som saknas</summary><ul>{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <details className="flight-method">
      <summary>Så läser du formresan</summary>
      <p>Flight-linjen jämför simmarens snitt från sju dagar med medianen från de 28 föregående dagarna. Ett mått behöver två aktuella svarsdagar och tre tidigare. Vikterna styr hur mycket varje mått påverkar linjen.</p>
      <p>Ett tidslyft kräver minst tre tidigare jämförbara simdagar under 56 dagar. Varje dags bästa förbättring kan lyfta linjen. Lyftet avtar under veckan och är högst 5 steg totalt.</p>
      <p>Testlopp och träningstider jämförs med samma distans, simsätt, bassäng, start, hjälpmedel, tidtagning och övriga förutsättningar. Varje punkt visar dagens snabbaste tid i serien. Tävlingsresultat ligger för sig.</p>
      <p>Luckor är dagar utan ett värde i underlaget. När tävlingsmålet ligger nära visas tävlingsdagen till höger i grafen.</p>
    </details>
  </>
}

function SwimmerFlightChart({ data, competitions }) {
  const competition = competitions?.filter(item => isVisibleCompetition(item, data.asOf))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const target = competition ? { title: competition.title, date: competition.startDate } : null
  return <FlightPlot days={data.points} points={data.points} metric={lineMetric} asOf={data.asOf} target={target} period={data.points.length}
    status={data.partial ? 'Delar av underlaget saknas' : undefined} />
}

export default function FlightRecordChart({ code, request, competitions, onRefreshAccess }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    request('/api/training?flightRecord=chart', code, { signal: controller.signal, retry: false }).then(data => {
      if (!controller.signal.aborted) setResult(data)
    }).catch(failure => {
      if (controller.signal.aborted) return
      setError(failure.message)
      void onRefreshAccess()
    })
    return () => controller.abort()
  }, [code, request, attempt, onRefreshAccess])
  if (error) return <div className="flight-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(current => current + 1)}>Försök igen</button></div>
  if (result) return <SwimmerFlightChart data={result} competitions={competitions} />
  return <p className="empty" role="status">Hämtar formgrafen…</p>
}
