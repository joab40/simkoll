import React, { useEffect, useMemo, useRef, useState } from 'react'
import { coachWeekAddDays, coachWeekMonday } from '../shared/coach-week.js'
import { flightWeekAnnotations } from '../shared/planning-week-types.js'
import { FLIGHT_PERIODS, flightCompetitionJourney, flightTimeComparison } from '../shared/flight-record.js'
import { formatTrainingTime, isTimeDate } from '../shared/swim-times.js'
import { changeFlightWeight, defaultFlightWeights, flightLine, flightSignalGroups, readFlightWeights } from '../shared/flight-line.js'
import { FLIGHT_BOOST_MAX_DAYS, defaultFlightBoostSettings, readFlightBoostSettings, validateFlightBoostSettings } from '../shared/flight-boosts.js'
import { FLIGHT_PB_DISTANCES, FLIGHT_PRACTICE_BOOST_DAYS, changePracticeBoost, defaultFlightPbSettings, pbBoostFraction, readFlightPbSettings, validateFlightPbSettings } from '../shared/flight-pb.js'
import { FLIGHT_TAPER_METRICS } from '../shared/flight-taper.js'
import { defaultFlightPresentation, flightDirection, FLIGHT_FORWARD_LIMIT, FLIGHT_PITCH_LIMIT, readFlightPresentation } from '../shared/flight-presentation.js'
import FlightMeasureSettings from './flight-measure-settings.jsx'
import './flight-record.css'

const sections = [
  ['line', 'Flight-linje'], ['feel', 'Känsla'], ['times', 'Simmade tider'], ['training', 'Träning'], ['sleep', 'Återhämtning'],
]
const lineMetric = { label: 'Flight-linje', unit: '', scale: [0, 100], subtitle: '50 = vanlig nivå' }
const timeMetric = { key: 'time' }
const palaceArt = '/assets/flight-record-palace.png'
const planeArt = '/assets/flight-record-plane.png'
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

export function FlightPlot({ days, metric, timed, points, selected, onSelect, asOf, target, period, status, presentation, endLabel = 'Idag', weekTypes = [] }) {
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
  const sky = presentation?.sky === true
  const skyGoal = sky && target
  const direction = sky ? flightDirection(points, asOf, presentation) : null
  const goalOffset = target ? daysBetween(asOf, target.date) : 0
  // Distant calendar events stay in the destination header, so the history has room.
  const future = !skyGoal && goalOffset > 0 && goalOffset <= Math.min(14, Math.floor(period / 2)) ? goalOffset : 0
  const domain = Math.max(1, days.length - 1 + future)
  const left = timed ? 62 : 50
  const right = width - 18
  const top = 22
  const base = height - 30
  const values = points.map(point => point.value).filter(Number.isFinite)
  const [min, max] = chartScale(values, metric, timed)
  const historyRight = sky ? left + (right - left) * (skyGoal ? .60 : .74) : right
  const x = (date) => left + daysBetween(start, date) / domain * (historyRight - left)
  const y = (value) => top + (timed ? (value - min) : (max - value)) / (max - min) * (base - top)
  const today = x(asOf)
  const plannedWeeks = flightWeekAnnotations(weekTypes, start, asOf)
  const selectedWeek = plannedWeeks.find(week => week.weekStart === coachWeekMonday(selected ?? asOf))
  const ticks = timed ? [min, Math.round((min + max) / 2), max] : metric.scale?.[1] === 5 ? [1, 2, 3, 4, 5] : [min, (min + max) / 2, max]
  const midpoint = days[Math.floor((days.length - 1) / 2)]?.date
  const showMidpoint = skyGoal ? historyRight - left > 380 : width > 430
  const axis = [...new Set([start, ...(showMidpoint && midpoint ? [midpoint] : []), asOf])]
  let path = ''
  let limitedPath = ''
  let previous = null
  if (!timed && !metric.bars) for (const point of points) {
    if (!Number.isFinite(point.value)) { previous = null; continue }
    const coordinates = `${x(point.date)} ${y(point.value)}`
    if (previous && (point.limited || previous.limited)) {
      limitedPath += `M ${x(previous.date)} ${y(previous.value)} L ${coordinates} `
      path += `M ${coordinates} `
    } else path += `${previous ? 'L' : 'M'} ${coordinates} `
    previous = point
  }
  const todayPoint = points.find(point => point.date === asOf && Number.isFinite(point.value))
  const plotLabel = timed ? 'Lopptid · snabbare högre upp' : `${metric.label} · ${metric.subtitle ?? metric.unit}`
  const endDescription = endLabel.toLocaleLowerCase('sv-SE').replace(/\.$/, '')
  const latestPoint = points.findLast(point => Number.isFinite(point.value))
  const hasLimited = points.some(point => point.limited)
  const pilotPoint = todayPoint ?? latestPoint
  const goalWidth = right - today
  const planeWidth = Math.min(76, goalWidth * (skyGoal ? .34 : .62), Math.max(34, width * .078)) * (pilotPoint?.heavy ? 1.3 : 1)
  const pilotX = pilotPoint ? x(pilotPoint.date) : null
  const pilotY = pilotPoint ? y(pilotPoint.value) : null
  let course = null
  if (direction?.days > 0) {
    const nose = planeWidth * .82
    const span = nose + Math.min(39, goalWidth * (skyGoal ? .56 : .97) - nose) * direction.days / FLIGHT_FORWARD_LIMIT
    const slope = Math.tan(direction.angle * Math.PI / 180)
    course = {
      x: pilotX + span,
      y: Math.max(top, Math.min(base, pilotY - span * slope)),
      label: `Illustrerad riktning · ${direction.days} ${direction.days === 1 ? 'dag' : 'dagar'}`,
    }
  }
  const palaceSize = skyGoal
    ? Math.min(goalWidth * (target.championship ? .69 : .50), height * (target.championship ? .65 : .47), 212) : 0
  const palaceY = top + (base - top) * (target?.championship ? .06 : .29)
  const palaceCenter = today + (goalWidth - palaceSize) * .87 + palaceSize / 2
  const palaceLabelWidth = Math.min(goalWidth - 10, (right - palaceCenter) * 2)
  const barWidth = Math.min(20, Math.max(2, (right - left) / (domain + 2) * .64))
  const tickValue = (value) => formatTrainingTime(value)
  const pointValue = (value) => timed ? formatTrainingTime(value) : [number(value), metric.unit].filter(Boolean).join(' ')
  return <figure className={`flight-plot${onSelect ? '' : ' flight-plot-static'}${sky ? ' flight-plot-sky' : ''}`} aria-label={plotLabel}>
    <figcaption>{plotLabel}</figcaption>
    <svg ref={graph} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${plotLabel} från ${shortDate(start)} till ${endDescription}.${latestPoint ? ` Senaste värde ${pointValue(latestPoint.value)} (${shortDate(latestPoint.date)}).` : ''}${latestPoint?.limited ? ' Det senaste värdet har begränsat underlag.' : ''}${skyGoal ? ` Tävlingsmål ${target.title}.` : ''}${course ? ` ${course.label}.` : ''}`}>
      {future > 0 && <rect className="flight-future" x={today} y={top} width={goalWidth} height={base - top} />}
      {skyGoal && <g aria-hidden="true">
        <rect className="flight-palace-sky" x={today + 4} y={top} width={goalWidth - 4} height={base - top} rx="12" />
        <image className={`flight-goal-palace${target.championship ? ' championship' : ''}`} href={palaceArt}
          x={palaceCenter - palaceSize / 2} y={palaceY} width={palaceSize} height={palaceSize} />
        <foreignObject x={palaceCenter - palaceLabelWidth / 2} y={Math.min(base - 26, palaceY + palaceSize + 4)} width={palaceLabelWidth} height="30">
          <div className={`flight-palace-name${target.championship ? ' championship' : ''}`} title={target.title}>{target.title}</div>
        </foreignObject>
      </g>}
      {ticks.map(tick => <g key={tick}>
        <line className="flight-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text x={left - 7} y={y(tick) + 4} textAnchor="end">{timed ? tickValue(tick) : number(tick)}</text>
      </g>)}
      <line className="flight-today" x1={today} x2={today} y1={top - 6} y2={base} />
      {future > 0 && <line className="flight-goal" x1={right} x2={right} y1={top - 6} y2={base} />}
      {selected && selected !== asOf && <line className="flight-selected" x1={x(selected)} x2={x(selected)} y1={top} y2={base} />}
      {sky && path && <path className="flight-contrail-haze" d={path} fill="none" />}
      {path && <path className="flight-observed-line" d={path} fill="none" />}
      {limitedPath && <path className="flight-limited-line" d={limitedPath} fill="none" />}
      {points.filter(point => Number.isFinite(point.value)).map(point => {
        const label = `${shortDate(point.date)} · ${pointValue(point.value)}${point.limited ? ' · Begränsat underlag' : ''}`
        const liftLabel = point.timeLift > 0 ? `${label} · Tidsboost +${number(point.timeLift)} steg` : label
        const marked = point.date === selected ? ' selected' : ''
        const onClick = onSelect ? () => onSelect(point.date) : undefined
        if (point.newTimeLift || (point.timeLift > 0 && point.events.some(event => event.date === point.date))) {
          const cx = x(point.date), cy = y(point.value), size = marked ? 7 : 5.5
          return <path key={point.date} className="flight-lift-mark" d={`M ${cx} ${cy - size} l ${size} ${size} l ${-size} ${size} l ${-size} ${-size} Z`} onClick={onClick}><title>{point.newTimeLift ? `${label} · Nytt tidslyft` : liftLabel}</title></path>
        }
        return metric.bars && !timed
          ? <rect key={point.date} className={'flight-mark' + marked} x={x(point.date) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(2, base - y(point.value))} rx="1.5" onClick={onClick}><title>{label}</title></rect>
          : <circle key={point.date} className={`flight-mark${marked}${point.limited ? ' limited' : ''}`} cx={x(point.date)} cy={y(point.value)} r={marked ? 6 : timed ? 4.5 : sky || period === 90 ? 2 : 3} onClick={onClick}><title>{liftLabel}</title></circle>
      })}
      {!values.length && <text className="flight-empty-label" x={(left + historyRight) / 2} y={(top + base) / 2} textAnchor="middle">För lite underlag ännu</text>}
      {course && <path className="flight-course" aria-hidden="true" d={`M ${pilotX} ${pilotY} L ${course.x} ${course.y}`} />}
      {/* The sprite's nose sits nine degrees above its exhaust. */}
      {sky ? pilotPoint && <g transform={`translate(${pilotX} ${pilotY}) rotate(${9 - direction.angle})`} aria-hidden="true">
        <image className="flight-plane flight-plane-art" href={planeArt} x={-planeWidth * .14} y={-planeWidth * .3}
          width={planeWidth} height={planeWidth * .5} />
      </g>
        : <text className="flight-plane" x={today - 7} y={todayPoint && !timed && !metric.bars ? Math.max(19, y(todayPoint.value) - 9) : 19} textAnchor="end" aria-hidden="true">✈︎</text>}
      {plannedWeeks.map(week => {
        const nextWeek = coachWeekAddDays(week.weekStart, 7)
        const from = x(week.weekStart < start ? start : week.weekStart)
        const to = nextWeek <= asOf ? x(nextWeek) : today
        return <rect key={week.weekStart} className={`flight-week-mark week-type-${week.type}`}
          x={Math.min(from, today - 3)} width={Math.max(3, to - from - 1)} y={base + 4} height="4" rx="2">
          <title>{shortDate(week.weekStart)} · {week.text}</title>
        </rect>
      })}
      {axis.map(date => <text key={date} x={date === asOf ? today - 3 : x(date)} y={height - 9} textAnchor={date === asOf ? 'end' : date === start ? 'start' : 'middle'}>{date === asOf ? endLabel : shortDate(date)}</text>)}
      {future > 0 && right - today >= 34 && <text x={right} y={height - 9} textAnchor="end">Mål</text>}
      {skyGoal && <text x={palaceCenter} y={height - 9} textAnchor="middle">Tävlingsmål</text>}
    </svg>
    <div className="flight-legend">
      <span><i/> {metric.legend ?? (metric === lineMetric ? 'Sammanvägda signaler' : 'Registrerade uppgifter')}</span>
      {hasLimited && <span><i className="flight-legend-limited"/> Begränsat underlag</span>}
      {metric === lineMetric && <span><i className="flight-legend-lift"/> Nytt tidslyft</span>}
      {course && <span><i className="flight-legend-course"/> {course.label}</span>}
      {future > 0 && <span><i className="flight-legend-future"/> {onSelect ? 'Planerad tävlingsdag' : target.title}</span>}
      {status && <span role="status">{status}</span>}
    </div>
    {plannedWeeks.length > 0 && <details className="flight-plot-weeks">
      <summary>Planerade veckotyper{selectedWeek && ` · ${selectedWeek.text}`}</summary>
      <ul>{plannedWeeks.map(week => <li key={week.weekStart}><span className={`flight-week-mark week-type-${week.type}`} aria-hidden="true"/>
        <strong>{shortDate(week.weekStart)}–{shortDate(coachWeekAddDays(week.weekStart, 6))}</strong> {week.text}
      </li>)}</ul>
    </details>}
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

const isBoost = key => key === 'times' || key === 'taper'
const boostWeights = weights => ({ times: weights.times, taper: weights.taper ?? 0 })

function FlightWeightRow({ signal, label, weights, selectedCount = 0, onChange, saving, canSelect }) {
  const [draft, setDraft] = useState(null)
  const startWeights = useRef(null)
  const boost = isBoost(signal)
  const selected = weights[signal] > 0
  const max = boost ? 100 : 100 - Math.max(0, selectedCount - 1)
  const initialShare = boost ? defaultFlightWeights[signal] ?? 60 : Math.round(100 / (selectedCount + 1))
  return <div className="flight-weight-row">
    <label><input type="checkbox" checked={selected} disabled={saving || (!canSelect && !selected)}
      onChange={event => onChange(signal, event.target.checked ? initialShare : 0)} /> {label}</label>
    <div className="flight-weight-percent">
      <input type="number" inputMode="numeric" min={1} max={max} step={1} value={draft ?? weights[signal] ?? 0}
        aria-label={`Procentvikt för ${label}`} disabled={!selected || saving} readOnly={!boost && selectedCount === 1}
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

function FlightSettingActions({ onSave, onReset, dirty, saving, available, blocked, message, label }) {
  return <>
    <div className="flight-actions">
      <button className="primary-button" type="button" disabled={!available || !dirty || saving || blocked} onClick={onSave}>{saving ? 'Sparar…' : label}</button>
      <button className="secondary-button" type="button" disabled={saving} onClick={onReset}>Återställ förval</button>
    </div>
    {!available && <p className="flight-muted">Du kan prova inställningarna här. Sparandet är inte tillgängligt ännu.</p>}
    {message?.text && <p className={message.error ? 'flight-error' : ''} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </>
}

export function FlightWeightControls({ weights, onChange, customMeasures, sleepGoalMinutes, measuresAvailable, shared = false, ...actions }) {
  const groups = flightSignalGroups(customMeasures)
  const selectedCount = Object.entries(weights).filter(([key, value]) => !isBoost(key) && value > 0).length
  const row = ({ key, label }) => <FlightWeightRow key={key} signal={key} label={label}
    weights={weights} selectedCount={selectedCount} onChange={onChange} saving={actions.saving}
    canSelect={selectedCount < 100 && (key !== 'sleepGoal' || sleepGoalMinutes != null)} />
  return <details className="flight-weights">
    <summary>Vikta signaler{actions.dirty ? ' · osparade ändringar' : ''}</summary>
    <p>Kryssa i måtten som ska ingå och ange en procentvikt. Övriga valda mått räknas om så att summan blir 100 %.</p>
    {groups.map(group => <fieldset className="flight-weight-group" key={group.label}>
      <legend>{group.label}</legend>
      <div className="flight-weight-list">{group.signals.filter(signal => signal.key !== 'sleepGoal' || measuresAvailable || weights.sleepGoal > 0).map(row)}</div>
      {group.label === 'Återhämtning' && measuresAvailable && sleepGoalMinutes == null && <p>Ställ in simmarens sömnmål för att vikta sovtid.</p>}
    </fieldset>)}
    {selectedCount > 0 && <p className="flight-weight-total">{selectedCount} valda mått · 100 % totalt</p>}
    {!shared && <FlightSettingActions {...actions} label="Spara vikter" />}
  </details>
}

const boostFields = [
  ['maxSteps', 'Max lyft (steg)', 0, 100],
  ['minusSteps', 'Max minus (steg)', 0, 100],
  ['fullDays', 'Full effekt (dagar)', 1, FLIGHT_BOOST_MAX_DAYS],
  ['fadeDays', 'Avtoning (dagar)', 0, FLIGHT_BOOST_MAX_DAYS],
]

function FlightBoostFields({ settings, kind, onChange, saving, maxDays = FLIGHT_BOOST_MAX_DAYS }) {
  const dayLimits = { fullDays: maxDays, fadeDays: maxDays - 1 }
  return <div className="flight-measure-fields">
    {boostFields.filter(([key]) => Object.hasOwn(settings[kind], key)).map(([key, label, min, max]) => <label key={key}>
      {label}
      <input type="number" inputMode="numeric" min={min} max={dayLimits[key] ?? max} step={1} disabled={saving} value={settings[kind][key]}
        onChange={event => onChange(kind, key, event.target.value === '' ? '' : event.target.valueAsNumber)} />
    </label>)}
  </div>
}

const practiceBoostLabels = [
  ['near', 'Nära Tempus-PB'],
  ['faster', 'Snabbare än Tempus-PB'],
  ['progress', 'Egen utveckling'],
]

function FlightPracticeBoostFields({ config, onChange, saving, weight }) {
  return <>
    <p>Full effekt och avtoning får tillsammans vara högst sju dagar. Ändrar du ett av fälten kortas det andra vid behov. Maxlyft på 0 stänger av en boost.</p>
    {practiceBoostLabels.map(([kind, label]) => <fieldset className="flight-weight-group" key={kind}>
      <legend>{label}</legend>
      <FlightBoostFields settings={config} kind={kind} onChange={onChange} saving={saving} maxDays={FLIGHT_PRACTICE_BOOST_DAYS} />
      {Object.values(config[kind]).every(Number.isInteger) && <p>
        Upp till {number(config[kind].maxSteps * weight / 100)} steg med {weight} % vikt · {config[kind].fullDays + config[kind].fadeDays} dagar totalt
      </p>}
      {kind === 'near' && <div className="flight-measure-fields flight-pb-margins">
        {FLIGHT_PB_DISTANCES.map(distance => <label key={distance}>Gräns för {distance} m (sekunder)
          <input type="number" inputMode="decimal" min={0} step={.01} disabled={saving}
            value={config.margins[distance] === '' ? '' : config.margins[distance] / 100}
            onChange={event => onChange('margins', distance, event.target.value === '' ? '' : Math.round(event.target.valueAsNumber * 100))} />
        </label>)}
      </div>}
      {kind === 'progress' && <p>Jämför med tidigare pass under samma förutsättningar när ett jämförbart Tempus-PB saknas.</p>}
    </fieldset>)}
  </>
}

export function FlightBoostControls({ weights, onChange, taperAvailable, configAvailable, config, onConfigChange,
  pbAvailable, pbConfig, onPbChange, configError, shared = false, ...actions }) {
  return <details className="flight-weights">
    <summary>Boostar{actions.dirty ? ' · osparade ändringar' : ''}</summary>
    <p>Ställ in varje justering för sig.{!shared && ' Flight-linjen uppdateras direkt när du provar en procentsats.'}</p>
    <fieldset className="flight-weight-group flight-weight-lift">
      <legend>Simmade tider</legend>
      <FlightWeightRow signal="times" label="Lyft från simtider" weights={weights} onChange={onChange} saving={actions.saving} canSelect />
      <p>Procenten styr hur stor del av maxlyftet en tid kan ge.</p>
      {pbAvailable && <FlightPracticeBoostFields config={pbConfig} onChange={onPbChange} saving={actions.saving} weight={weights.times} />}
      {configAvailable && <fieldset className="flight-weight-group">
        <legend>Tävlingsresultat</legend>
        <FlightBoostFields settings={config} kind="times" onChange={onConfigChange} saving={actions.saving} />
      </fieldset>}
    </fieldset>
    <fieldset className="flight-weight-group flight-weight-lift">
      <legend>Träning</legend>
      <FlightWeightRow signal="taper" label="Toppning och vila" weights={weights} onChange={onChange} saving={actions.saving} canSelect={taperAvailable} />
      {configAvailable && taperAvailable && <FlightBoostFields settings={config} kind="taper" onChange={onConfigChange} saving={actions.saving} />}
      {taperAvailable
        ? <p>Registrerad vila kan ge ett mindre lyft. Vid fortsatt lägre träning börjar minuseffekten efter dagarna med full effekt och avtoning{!configError ? `, från dag ${config.taper.fullDays + config.taper.fadeDays + 1}` : ''}.</p>
        : <p>Toppningsjustering kräver SQL 138.</p>}
    </fieldset>
    {configError && <p className="flight-error" role="alert">{configError}</p>}
    {!shared && <FlightSettingActions {...actions} blocked={Boolean(configError)} label="Spara boostar" />}
  </details>
}

function PracticeTimeBoost({ point, checks, available, tempusAvailable, weight, settings }) {
  const { value, timeLift, events } = point
  const applied = timeLift > 0 ? events : []
  const other = checks.filter(time => !applied.some(event => event.date === time.date && event.seriesKey === time.seriesKey))
  const status = value == null ? 'Grundvärde saknas' : timeLift > 0 ? `+${number(timeLift)} steg` : '0 steg'
  const reason = time => {
    if (!tempusAvailable) return 'Tempus-historiken kunde inte hämtas.'
    if (!weight) return 'Lyft från simtider är avstängt under Boostar.'
    if (!settings[time.pbKind ?? 'progress'].maxSteps) return 'Maxlyftet för den här jämförelsen är 0 steg.'
    if (time.pbKind && !pbBoostFraction(time, settings)) {
      const margin = settings.margins[time.distance]
      return margin ? `Tiden ligger utanför gränsen på ${number(margin / 100, 2)} s.` : 'Ingen marginal är inställd för distansen.'
    }
    if (time.reference == null) return `Jämförbart Tempus-PB saknas. Egen utveckling kräver 3 tidigare jämförbara dagar inom 56 dagar (${time.priorDays} hittades).`
    if (!time.pbKind && time.strength === 0) return 'Egen utveckling ger ett lyft när tiden är snabbare än medianen.'
    if (value == null) return 'Tidsboosten behöver ett grundvärde för dagen.'
    if (point.base === 100) return 'Grundvärdet är redan 100.'
    if (timeLift > 0) return 'Ett annat tidslyft räknas den här dagen.'
    return 'Effekten på grafen avrundas till 0 steg.'
  }
  return <section className={timeLift > 0 ? 'flight-time-boost active' : 'flight-time-boost'} aria-label="Tidsboost">
    <header><b>Tidsboost</b><span>{status}</span></header>
    {available === false && <p>Tränings- och testtider kunde inte hämtas.</p>}
    {available === true && !checks.length && !applied.length && <p>Dagen saknar registrerade tränings- och testtider.</p>}
    {(applied.length > 0 || other.length > 0) && <ul className="flight-time-evidence">
      {applied.map(event => {
        const horizon = event.kind === 'race' ? null : settings[event.pbKind ?? 'progress']
        const day = daysBetween(event.date, point.date) + 1
        return <li key={event.date}>
          <strong>{shortDate(event.date)} · {formatTrainingTime(event.centis)}</strong>
          <span>{event.label} · {timeEvidence(event)}</span>
          {horizon && <span>Dag {day} av {horizon.fullDays + horizon.fadeDays} · {day <= horizon.fullDays ? 'full effekt' : 'avtoning'}</span>}
        </li>
      })}
      {other.map(time => <li key={time.seriesKey}>
        <strong>{formatTrainingTime(time.centis)} · {time.label}</strong>
        {time.reference != null && tempusAvailable && <span>{timeEvidence(time)}</span>}
        <span>{reason(time)}</span>
      </li>)}
    </ul>}
  </section>
}

function FlightLineDetail({ point, practiceChecks, practiceAvailable, tempusAvailable, timeWeight, pbSettings }) {
  const { components, value, base, limited, taper, taperEffect, usedWeight, totalWeight } = point
  const usable = components.filter(component => component.score != null)
  return <div className="flight-day-detail" aria-live="polite">
    <small>{shortDate(point.date)}</small>
    <div><strong>{value == null ? 'För lite underlag' : number(value)}</strong>
      {Boolean(taperEffect) && <span className={taperEffect < 0 ? 'flight-negative-adjustment' : ''}>{taperEffect > 0 ? '+' : ''}{number(taperEffect)} från träning</span>}
    </div>
    {value != null && <p>Grundvärde {number(base)} · {usable.length} av {components.length} valda signaler med underlag</p>}
    {limited && <p className="flight-limited-note"><strong>Begränsat underlag</strong> · {number(usedWeight * 100 / totalWeight, 0)} % av vald vikt har underlag.</p>}
    {taper?.kind === 'rest' && <p>Registrerad vilodag.</p>}
    {taper?.kind === 'reduced' && <p>Dag {taper.duration} med lättare träning. {taper.lower.map(item => `${FLIGHT_TAPER_METRICS[item.key]} ${number((1 - item.ratio) * 100, 0)} % lägre`).join(' · ')} jämfört med perioden före sänkningen.</p>}
    {!components.length && <p>Välj minst ett mått under Vikta signaler.</p>}
    {components.length > 0 && value == null && <p>Inget av de valda måtten har tillräckligt med svar för ett värde den här dagen.</p>}
    <PracticeTimeBoost point={point} checks={practiceChecks} available={practiceAvailable} tempusAvailable={tempusAvailable} weight={timeWeight} settings={pbSettings} />
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
  </div>
}

function timeEvidence(event) {
  if (!event.pbKind) {
    const delta = event.reference - event.centis
    const comparison = delta === 0 ? 'Samma tid som' : `${number(Math.abs(delta) / 100, 2)} s ${delta > 0 ? 'snabbare' : 'långsammare'} än`
    return `${comparison} medianen ${formatTrainingTime(event.reference)} från ${event.priorDays} tidigare jämförbara dagar.`
  }
  const delta = event.centis - event.reference
  const difference = delta === 0 ? 'I nivå med' : `${number(Math.abs(delta) / 100, 2)} s ${delta < 0 ? 'snabbare än' : 'bakom'}`
  return `${difference} Tempus-PB ${formatTrainingTime(event.reference)} (${shortDate(event.referenceDate)}).`
}

export function FlightRecordView({ data, competitions = [], weekTypes = [], saveWeights, saveMeasure, loadPreview, savePresentation }) {
  const [period, setPeriod] = useState(28)
  const [section, setSection] = useState('line')
  const [metricChoice, setMetricChoice] = useState({})
  const [seriesKey, setSeriesKey] = useState('')
  const [selectedDate, setSelectedDate] = useState(null)
  const [targetId, setTargetId] = useState('')
  const [savedWeights, setSavedWeights] = useState(() => readFlightWeights(data.weights))
  const [weights, setWeights] = useState(() => readFlightWeights(data.weights))
  const [savedBoostSettings, setSavedBoostSettings] = useState(() => readFlightBoostSettings(data.boostSettings))
  const [boostSettings, setBoostSettings] = useState(() => readFlightBoostSettings(data.boostSettings))
  const [savedPbSettings, setSavedPbSettings] = useState(() => readFlightPbSettings(data.pbBoostSettings, savedBoostSettings.times))
  const [pbSettings, setPbSettings] = useState(savedPbSettings)
  const [saving, setSaving] = useState(false)
  const [weightMessage, setWeightMessage] = useState({ text: '' })
  const saveLock = useRef(false)
  const previewRevision = useMemo(() => [data, savedWeights, savedBoostSettings, savedPbSettings], [data, savedWeights, savedBoostSettings, savedPbSettings])
  const changedKeys = [...new Set([...Object.keys(weights), ...Object.keys(savedWeights)])]
    .filter(key => (weights[key] ?? 0) !== (savedWeights[key] ?? 0))
  const boostConfigChanged = Object.entries(boostSettings).some(([kind, config]) =>
    Object.entries(config).some(([key, value]) => savedBoostSettings[kind][key] !== value))
    || JSON.stringify(pbSettings) !== JSON.stringify(savedPbSettings)
  let configError = ''
  try { validateFlightBoostSettings(boostSettings) } catch (error) { configError = error.message }
  const previewBoostSettings = configError ? savedBoostSettings : boostSettings
  let pbError = ''
  if (data.pbBoostSettingsAvailable) {
    try { validateFlightPbSettings(pbSettings) } catch (error) { pbError = error.message }
  }
  const previewPbSettings = data.pbBoostSettingsAvailable ? (pbError ? savedPbSettings : pbSettings) : undefined
  const weighted = section === 'line'
  const customMeasures = data.customMeasures ?? []
  const line = useMemo(() => flightLine(data.days, data.contextDays ?? [], data.timeLifts ?? [], weights, data.customMeasures, data.taperAdjustments, previewBoostSettings, previewPbSettings), [data, weights, previewBoostSettings, previewPbSettings])
  const save = async (panel) => {
    const savingBoosts = panel === 'boosts'
    if ((!changedKeys.length && !boostConfigChanged) || saveLock.current || !data.weightsAvailable || !saveWeights || (savingBoosts && (configError || pbError))) return
    saveLock.current = true
    setSaving(true)
    setWeightMessage({ text: '' })
    const pending = savingBoosts ? { ...savedWeights, ...boostWeights(weights) } : { ...weights, ...boostWeights(savedWeights) }
    try {
      const result = await saveWeights(pending,
        savingBoosts && data.boostSettingsAvailable ? boostSettings : undefined,
        savingBoosts && data.pbBoostSettingsAvailable ? pbSettings : undefined)
      setWeights(current => savingBoosts ? { ...current, ...boostWeights(result.weights) } : { ...result.weights, ...boostWeights(current) })
      setSavedWeights(result.weights)
      if (result.boostSettings) {
        setSavedBoostSettings(result.boostSettings)
        setBoostSettings(result.boostSettings)
      }
      if (result.pbBoostSettings) {
        const saved = readFlightPbSettings(result.pbBoostSettings)
        setSavedPbSettings(saved)
        setPbSettings(saved)
      }
      setWeightMessage({ panel, text: savingBoosts ? 'Boostarna är sparade.' : 'Vikterna är sparade.' })
    } catch (error) {
      setWeightMessage({ panel, text: error.message, error: true })
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }
  const settings = {
    weights, saving, available: data.weightsAvailable,
    onChange(key, value, initial) {
      setWeights(current => changeFlightWeight(initial ?? current, key, value))
      setWeightMessage({ text: '' })
    },
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
    {loadPreview && savePresentation && <FlightPresentationSettings initial={data.presentation} available={data.presentationAvailable}
      competitions={competitions} loadPreview={loadPreview} savePresentation={savePresentation}
      refreshKey={previewRevision} />}
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
    {weighted && <>
      <FlightWeightControls {...settings} customMeasures={customMeasures} sleepGoalMinutes={data.sleepGoalMinutes} measuresAvailable={data.measuresAvailable}
        onSave={() => save('weights')} dirty={changedKeys.some(key => !isBoost(key))} message={weightMessage.panel === 'weights' ? weightMessage : null}
        onReset={() => {
          setWeights(current => ({ ...defaultFlightWeights, ...boostWeights(current) }))
          setWeightMessage({ text: '' })
        }} />
      <FlightBoostControls {...settings} taperAvailable={data.taperAvailable} configAvailable={data.boostSettingsAvailable}
        pbAvailable={data.pbBoostSettingsAvailable} pbConfig={pbSettings} config={boostSettings} configError={configError || pbError}
        onPbChange={(kind, key, value) => {
          setPbSettings(current => ({ ...current, [kind]: changePracticeBoost(current[kind], key, value) }))
          setWeightMessage({ text: '' })
        }}
        onConfigChange={(kind, key, value) => {
          setBoostSettings(current => ({ ...current, [kind]: { ...current[kind], [key]: value } }))
          setWeightMessage({ text: '' })
        }}
        onSave={() => save('boosts')} dirty={changedKeys.some(isBoost) || boostConfigChanged} message={weightMessage.panel === 'boosts' ? weightMessage : null}
        onReset={() => {
          setWeights(current => ({ ...current, ...boostWeights(defaultFlightWeights) }))
          setBoostSettings(defaultFlightBoostSettings)
          setPbSettings(defaultFlightPbSettings())
          setWeightMessage({ text: '' })
        }} />
    </>}
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
        points={points} selected={day.date} onSelect={setSelectedDate} asOf={data.asOf} target={target} period={period} weekTypes={weighted ? weekTypes : undefined} />)}
    </div>}
    {plots.length > 0 ? <div className="flight-detail-row">
      <p>{coverage ? `${coverage} ${weighted ? 'dagar med beräknat värde' : timed ? 'jämförbara dagar' : 'dagar med rapporterade mått'} i perioden` : 'För lite underlag för att visa en graf i perioden.'}</p>
      <label className="flight-field">Visa dag
        <select value={day.date} onChange={event => setSelectedDate(event.target.value)}>
          {[...days].reverse().map(item => <option value={item.date} key={item.date}>{item.date === data.asOf ? 'Idag · ' : ''}{shortDate(item.date)}</option>)}
        </select>
      </label>
    </div> : <p>Välj ett eller flera mått att visa.</p>}
    {linePoint ? <FlightLineDetail point={linePoint} practiceChecks={data.practiceChecks?.filter(time => time.date === day.date) ?? []}
      practiceAvailable={data.practiceTimesAvailable} tempusAvailable={data.tempusHistoryAvailable}
      timeWeight={weights.times} pbSettings={previewPbSettings ?? defaultFlightPbSettings(previewBoostSettings.times)} /> : plots.length > 0 && <div className="flight-day-list">
      {plots.map(({ metric }) => <DayDetail key={metric.key} day={day} metric={metric} timed={timed} series={series} timedPoints={timedPoints} showMetric={plots.length > 1} />)}
    </div>}
    {data.warnings.length > 0 && <details className="flight-method"><summary>Underlag som saknas</summary><ul>{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <details className="flight-method">
      <summary>Så läser du formresan</summary>
      <p>Flight-linjen jämför snittet från sju dagar med medianen från de 28 föregående dagarna. Ett mått behöver två aktuella svarsdagar och tre tidigare. Streckade partier och ringar visar begränsat underlag. Det gäller när bara ett av flera valda mått har underlag eller när underlaget täcker mindre än halva den valda vikten.</p>
      <p>Testlopp och träningstider för hela distansen utan hjälpmedel jämförs med ett tidigare Tempus-PB i samma gren och bassänglängd. Tävlingsdräkt går bra. När ett sådant PB saknas kan en förbättring mot medianen från minst tre jämförbara simdagar under de senaste 56 dagarna ge ett lyft. Full effekt och avtoning varar tillsammans i högst sju dagar från passdatumet.</p>
      <p>Toppning och vila använder registrerade vilodagar och genomförda pass. En tydlig sänkning kräver underlag från minst fem dagar den senaste veckan och jämförs med simmarens tidigare träningsnivå. Simmeter kan även komma från ett kopplat pass. Justeringen läggs på dagar där Flight-linjen har ett grundvärde.</p>
      <p>Testlopp och träningstider jämförs med samma distans, simsätt, bassäng, start, hjälpmedel, tidtagning och övriga förutsättningar. Varje punkt visar dagens snabbaste tid i serien. Tävlingsresultat ligger för sig.</p>
      <p>Luckor är dagar utan ett värde i underlaget. När tävlingsmålet ligger nära visas tävlingsdagen till höger i grafen.</p>
    </details>
  </>
}

function CompetitionJourney({ journey, asOf, selected, next, onSelect, sky }) {
  const viewport = useRef(null)
  const activeStop = useRef(null)
  useEffect(() => {
    const strip = viewport.current, stop = activeStop.current
    if (!strip || !stop) return
    const visible = strip.getBoundingClientRect(), item = stop.getBoundingClientRect()
    if (item.left < visible.left || item.right > visible.right) strip.scrollLeft += item.left - visible.left - 12
  }, [selected?.id, journey.length])

  const dayLabel = date => date.slice(0, 4) === asOf.slice(0, 4) ? shortDate(date) : `${shortDate(date)} ${date.slice(0, 4)}`
  return <section className="flight-journey" aria-label="Tävlingsresan">
    <header><h3><span aria-hidden="true">⚑</span> Tävlingsresan</h3></header>
    {journey.length ? <div className="flight-journey-scroll" ref={viewport} tabIndex={0} aria-label="Tävlingar i datumordning">
      <ol>{journey.map(event => {
        const isSelected = event.id === selected?.id
        const isNext = event.id === next?.id
        const remaining = daysBetween(asOf, event.startDate)
        const label = event.status === 'past' ? 'Datum passerat' : event.status === 'current' ? 'Pågår'
          : isNext ? `Nästa · ${remaining} ${remaining === 1 ? 'dag' : 'dagar'}` : isSelected ? `Om ${remaining} ${remaining === 1 ? 'dag' : 'dagar'}` : 'Kommande'
        const details = <>
          {sky ? <span className="flight-journey-palace-wrap" aria-hidden="true"><img src={palaceArt} alt="" className="flight-journey-palace" /></span>
            : <span className="flight-journey-node" aria-hidden="true">{event.status === 'past' ? '•' : '⚑'}</span>}
          <small className="flight-journey-date">{dayLabel(event.startDate)}{event.endDate !== event.startDate && ` – ${dayLabel(event.endDate)}`}</small>
          <strong>{event.title}</strong>
          <small className="flight-journey-status">{label}</small>
        </>
        return <li key={event.id} className={`flight-journey-event ${event.status}${isNext ? ' next' : ''}${event.championship ? ' championship' : ''}`}>
          {event.status === 'past' ? <div className="flight-journey-stop">{details}</div>
            : <button type="button" className="flight-journey-stop" aria-pressed={isSelected}
              ref={isSelected ? activeStop : null} onClick={() => onSelect(event.id)}>{details}</button>}
        </li>
      })}</ol>
    </div> : <p>Inga tävlingar i kalendern ännu.</p>}
  </section>
}

export function FlightPresentationFields({ draft, saving, update }) {
  return <>
    <label className="flight-presentation-toggle"><input type="checkbox" checked={draft.sky} disabled={saving} onChange={event => update({ sky: event.target.checked })} /> Flygtema</label>
    {draft.sky && <div className="flight-presentation-fields">
      <label className="flight-field">Planets lutning
        <select value={draft.angle == null ? 'trend' : 'manual'} disabled={saving} onChange={event => update({ angle: event.target.value === 'trend' ? null : 0 })}>
          <option value="trend">Följ senaste trenden</option><option value="manual">Välj lutning själv</option>
        </select>
      </label>
      {draft.angle != null && <label className="flight-field flight-presentation-range">
        <span>Lutning <strong>{draft.angle > 0 ? '+' : ''}{draft.angle}°</strong></span>
        <input type="range" min={-FLIGHT_PITCH_LIMIT} max={FLIGHT_PITCH_LIMIT} value={draft.angle} disabled={saving}
          onChange={event => update({ angle: Number(event.target.value) })} />
      </label>}
      <label className="flight-field">Illustrerad riktning
        <select value={draft.forwardDays} disabled={saving} onChange={event => update({ forwardDays: Number(event.target.value) })}>
          <option value={0}>Av</option>
          {Array.from({ length: FLIGHT_FORWARD_LIMIT }, (_, index) => index + 1).map(days => <option key={days} value={days}>{days} {days === 1 ? 'dag' : 'dagar'}</option>)}
        </select>
      </label>
    </div>}
  </>
}

function FlightPresentationSettings({ initial, available, competitions, loadPreview, savePresentation, refreshKey }) {
  const [saved, setSaved] = useState(() => readFlightPresentation(initial))
  const [draft, setDraft] = useState(saved)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const saveLock = useRef(false)
  const dirty = Object.keys(draft).some(key => draft[key] !== saved[key])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setPreview(null)
    setError('')
    loadPreview(controller.signal).then(result => {
      if (!controller.signal.aborted) setPreview(result)
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [open, loadPreview, refreshKey, attempt])

  const update = patch => {
    setDraft(current => ({ ...current, ...patch }))
    setMessage(null)
  }
  const save = async () => {
    if (saveLock.current || !available || !dirty) return
    saveLock.current = true
    setSaving(true)
    setMessage(null)
    try {
      const result = await savePresentation(draft)
      setSaved(result.presentation)
      setDraft(result.presentation)
      setMessage({ text: 'Visningen är sparad för simmaren.' })
    } catch (error) {
      setMessage({ text: error.message, error: true })
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }
  return <details className="flight-presentation" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Simmarens visning {saved.sky && <small>Flygtema på</small>}</summary>
    {open && <div className="flight-presentation-body">
      <FlightPresentationFields draft={draft} saving={saving} update={update} />
      <FlightSettingActions available={available} dirty={dirty} saving={saving} onSave={save} label="Spara visning" message={message}
        onReset={() => { setDraft(defaultFlightPresentation); setMessage(null) }} />
      <h3>Förhandsvisning av simmarvyn</h3>
      {preview ? <SwimmerFlightChart data={preview} competitions={competitions} presentation={draft} />
        : error ? <div className="flight-error"><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></div>
          : <p className="empty" role="status">Hämtar simmarens graf…</p>}
    </div>}
  </details>
}

function SwimmerFlightChart({ data, competitions = [], presentation = data.presentation }) {
  const [targetId, setTargetId] = useState(null)
  const journey = useMemo(() => flightCompetitionJourney(competitions, data.asOf), [competitions, data.asOf])
  const next = journey.find(event => event.status !== 'past')
  const competition = journey.find(event => event.id === targetId && event.status !== 'past') ?? next
  const target = competition ? { title: competition.title, championship: competition.championship, date: competition.startDate < data.asOf ? data.asOf : competition.startDate } : null
  return <div className="flight-swimmer-presentation">
    {data.points.length > 0 ? <FlightPlot days={data.points} points={data.points} metric={lineMetric} asOf={data.asOf} target={target} period={data.points.length}
      status={data.partial ? 'Delar av underlaget saknas' : undefined} presentation={presentation} /> : <p>För lite underlag för att visa en graf.</p>}
    <CompetitionJourney journey={journey} selected={competition} next={next} asOf={data.asOf} onSelect={setTargetId} sky={presentation?.sky === true} />
  </div>
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
