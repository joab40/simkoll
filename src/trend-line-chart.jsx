import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { activityLabel } from '../shared/checkin-activity.js'
import { hasTrendValue, trendSegments, trendGapSegments, smoothTrendPath, trendDateLayout, trendCalendarItems } from './trend-curve.js'
import { withTrendSwimMeters, SWIM_METER_COLOR } from './trend-swim-meters.js'
import { CHART_ZOOM_LEVELS, chartZoomWidth, chartZoomScroll } from './chart-zoom.js'

function TrainingMeterChart({ items }) {
  const rows = items.map((item) => {
    const reportedSwimMeters = (item.activities || []).filter((activity) => activity.type === 'swim' && Number.isFinite(Number(activity.distanceMeters))).reduce((sum, activity) => sum + Number(activity.distanceMeters), 0)
    return { ...item, reportedSwimMeters }
  }).filter((item) => item.distanceMeters != null || item.reportedSwimMeters > 0)
  if (!rows.length) return null
  const maxMeters = Math.max(...rows.flatMap((item) => [Number(item.distanceMeters) || 0, item.reportedSwimMeters]), 1000)
  const scaleMax = Math.ceil(maxMeters / 1000) * 1000
  const format = (value) => `${Number(value).toLocaleString('sv-SE')} m`
  return <section className="training-meter-section"><div className="training-meter-heading"><div><h3>Simmeter per dag</h3><p>Planerad distans jämförs separat med simning som simmaren själv har rapporterat.</p></div><div className="training-meter-legend"><span><i className="planned" />Planerat</span><span><i className="reported" />Rapporterat</span></div></div><div className="training-meter-list">{rows.map((item, index) => <article key={`${item.date}-${index}`}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><div className="training-meter-values">{item.distanceMeters != null && <div><span>Planerat</span><div className="training-meter-track"><i className="planned" style={{ width: `${Math.max(2, Number(item.distanceMeters) / scaleMax * 100)}%` }} /></div><b>{format(item.distanceMeters)}</b></div>}{item.reportedSwimMeters > 0 && <div><span>Rapporterat</span><div className="training-meter-track"><i className="reported" style={{ width: `${Math.max(2, item.reportedSwimMeters / scaleMax * 100)}%` }} /></div><b>{format(item.reportedSwimMeters)}</b></div>}</div></article>)}</div><small className="training-meter-footnote">Gemensam skala: 0–{format(scaleMax)}. Planerat är inte ett uppmätt resultat. Cykling och annan landträning visas separat.</small></section>
}

function TrainingVolumeChart({ items }) {
  const colors = { swim: '#26b7b0', strength: '#9b8cff', dryland: '#f0b45b', cycling: '#7eaa45', other: '#8a9ba0', unknown: '#b5c0c3' }
  const rows = items.map((item) => {
    const minutesByType = (item.activities || []).reduce((totals, activity) => {
      if (activity.minutes == null || !Number.isFinite(Number(activity.minutes))) return totals
      const type = activity.type || 'unknown'
      totals[type] = (totals[type] || 0) + Number(activity.minutes)
      return totals
    }, {})
    return { ...item, minutesByType, totalMinutes: Object.values(minutesByType).reduce((sum, minutes) => sum + minutes, 0) }
  }).filter((item) => item.totalMinutes > 0)
  if (!rows.length) return null
  const maxMinutes = Math.max(...rows.map((item) => item.totalMinutes))
  const scaleMax = Math.ceil(maxMinutes / 30) * 30
  const types = [...new Set(rows.flatMap((item) => Object.keys(item.minutesByType)))]
  return <section className="training-volume-section"><div className="training-meter-heading"><div><h3>Rapporterad träningstid</h3><p>Minuter som simmaren själv har angett, uppdelade efter aktivitet.</p></div><div className="training-meter-legend">{types.map((type) => <span key={type}><i style={{ background: colors[type] || colors.other }} />{type === 'unknown' ? 'Typ saknas' : activityLabel(type)}</span>)}</div></div><div className="training-volume-list">{rows.map((item, index) => <article key={`${item.date}-${index}`}><div className="training-volume-date"><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><b>{item.totalMinutes} min</b></div><div className="training-volume-track" role="img" aria-label={`${item.totalMinutes} minuter rapporterad träning`}>{types.map((type) => { const minutes = item.minutesByType[type] || 0; return minutes ? <i key={type} title={`${type === 'unknown' ? 'Typ saknas' : activityLabel(type)}: ${minutes} min`} style={{ width: `${minutes / scaleMax * 100}%`, background: colors[type] || colors.other }} /> : null })}</div></article>)}</div><small className="training-meter-footnote">Gemensam skala: 0–{scaleMax} min per dag. Planerad passtid räknas inte som genomförd träning.</small></section>
}

export default function TrendLineChart({ items = [], range, meterDays = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const [visible, setVisible] = useState({ feeling: true, body: true, rpe: true, speedFeeling: true, passRating: true, swimMeterScale: true })
  const [zoom, setZoom] = useState(1), [viewport, setViewport] = useState(800), [scroll, setScroll] = useState(0), [dragging, setDragging] = useState(false)
  const scrollRef = useRef(null), pendingCenter = useRef(null), pan = useRef(null), id = useId()
  const originalItems = items
  items = withTrendSwimMeters(trendCalendarItems(items, { ...range, meterDays }))
  const periodKey = `${range?.start || items[0]?.date}|${range?.endExclusive || items.at(-1)?.date}|${items.length}`
  const width = chartZoomWidth(viewport, zoom)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const measure = () => { setViewport(el.clientWidth || 800); setScroll(el.scrollLeft) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [Boolean(items.length)])
  useEffect(() => {
    setZoom(1); setHoverIndex(null); setDragging(false); pan.current = null; pendingCenter.current = null
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
    setScroll(0)
  }, [periodKey])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (pendingCenter.current != null) {
      el.scrollLeft = chartZoomScroll(pendingCenter.current, width, el.clientWidth)
      pendingCenter.current = null
    }
    setScroll(el.scrollLeft)
  }, [width])
  const zoomTo = (next) => {
    const el = scrollRef.current
    if (el) pendingCenter.current = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
    setHoverIndex(null); setZoom(next)
  }
  const reset = () => { pendingCenter.current = 0; setZoom(1); setHoverIndex(null); if (scrollRef.current) scrollRef.current.scrollLeft = 0; setScroll(0) }
  const move = direction => { const el = scrollRef.current; if (el) { el.scrollLeft += direction * el.clientWidth * .75; setScroll(el.scrollLeft); setHoverIndex(null) } }
  const pointerDown = event => {
    const el = event.currentTarget
    if (event.pointerType !== 'mouse' || event.button !== 0 || el.scrollWidth <= el.clientWidth || event.target.closest('[role="button"]')) return
    pan.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft }
    el.setPointerCapture(event.pointerId); setDragging(true)
  }
  const pointerMove = event => {
    if (!pan.current || pan.current.id !== event.pointerId) return
    event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x)
    setHoverIndex(null)
  }
  const pointerEnd = event => { if (pan.current?.id === event.pointerId) { pan.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } }
  if (!items.length) return <p className="empty">Inga genomförda pass under perioden.</p>
  const meterScaleMax = Math.max(10, Math.ceil(Math.max(...items.map((item) => item.swimMeterScale || 0))))
  const metrics = [{ key: 'feeling', label: 'Känsla', color: '#26b7b0', max: 5 }, { key: 'body', label: 'Kropp', color: '#a9d33e', max: 5 }, { key: 'rpe', label: 'RPE', color: '#f59e9e', max: 10 }, { key: 'speedFeeling', label: 'Fartkänsla', color: '#9b8cff', max: 5 }, { key: 'passRating', label: 'Passet', color: '#f0b45b', max: 5 }]
  metrics.push({ key: 'swimMeterScale', label: 'Simmeter', color: SWIM_METER_COLOR, max: meterScaleMax })
  const height = 230, left = 34, right = 92, top = 16, bottom = 34, chartWidth = width - left - right, chartHeight = height - top - bottom
  const dateLayout = trendDateLayout(items)
  const dayWidth = chartWidth * dateLayout.dayWidth
  const x = (index) => left + dateLayout.positions[index] * chartWidth
  const dayX = (date) => left + dateLayout.labels.find((label) => label.date === date).position * chartWidth
  const y = (value, max) => top + chartHeight - (Number(value) / max) * chartHeight
  const lineSegments = (metric) => visible[metric.key] ? trendSegments(items, metric.key) : []
  const slotLabels = { morning_swim: 'Förmiddag', afternoon_swim: 'Eftermiddag' }
  const labelStep = Math.max(1, Math.ceil(dateLayout.labels.length / Math.max(2, Math.floor(chartWidth / 62))))
  const maxScroll = Math.max(0, width - viewport)
  const zoomIndex = CHART_ZOOM_LEVELS.indexOf(zoom)
  return <div className="trend-line-section">
    <div className="trend-line-filter"><strong>Visa i diagrammet</strong>{metrics.map((metric) => <button type="button" className={visible[metric.key] ? 'active' : ''} aria-pressed={visible[metric.key]} key={metric.key} onClick={() => setVisible((current) => ({ ...current, [metric.key]: !current[metric.key] }))}><i style={{ background: metric.color }} />{metric.label}</button>)}</div>
    <div className="trend-zoom-controls" role="group" aria-label="Zoom och förflyttning i diagrammet"><strong>Zoom</strong><button type="button" aria-label="Zooma ut diagrammet" disabled={zoomIndex === 0} onClick={() => zoomTo(CHART_ZOOM_LEVELS[zoomIndex - 1])}>−</button><output aria-live="polite">{zoom}×</output><button type="button" aria-label="Zooma in diagrammet" disabled={zoomIndex === CHART_ZOOM_LEVELS.length - 1} onClick={() => zoomTo(CHART_ZOOM_LEVELS[zoomIndex + 1])}>+</button><button type="button" onClick={reset} disabled={zoom === 1 && scroll < 1}>Återställ</button><span className="trend-pan-buttons"><button type="button" aria-label="Flytta diagrammet åt vänster" disabled={scroll < 1} onClick={() => move(-1)}>←</button><button type="button" aria-label="Flytta diagrammet åt höger" disabled={scroll >= maxScroll - 1} onClick={() => move(1)}>→</button></span></div>
    <p className="trend-zoom-hint" id={`${id}-hint`}>Zooma in för fler detaljer. Svep i sidled, dra med musen eller använd pilarna. Samma period och värden visas vid all zoom.</p>
    <div className="trend-line-wrap" ref={scrollRef} role="region" aria-label="Skrollbart träningsdiagram" aria-describedby={`${id}-hint`} tabIndex={0} data-panning={dragging} onScroll={event => setScroll(event.currentTarget.scrollLeft)} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { pan.current = null; setDragging(false) }}><svg className="trend-line-chart" style={{ width, minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Träningsupplevelse och simmeter över tid. Vänster skala 0–5, höger RPE 0–10 och separat meterskala 0–${meterScaleMax * 1000} meter.`}>
      {[0, 1, 2, 3, 4, 5].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick, 5)} y2={y(tick, 5)} /><text x={left - 8} y={y(tick, 5) + 3}>{tick}</text></g>)}
      {[0, 2, 4, 6, 8, 10].map((tick) => <text className="trend-rpe-axis" key={`rpe-${tick}`} x={width - right + 8} y={y(tick, 10) + 3}>{tick}</text>)}
      {visible.swimMeterScale && [0, 1, 2, 3, 4, 5].map((tick) => <text key={`meter-${tick}`} x={width - right + 30} y={y(tick, 5) + 3}>{(tick / 5 * meterScaleMax).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}k m</text>)}
      {items.map((item, index) => item.competition && <g key={`competition-${item.date}-${index}`} className="trend-competition-marker" role="button" tabIndex="0" aria-label={`Tävlingsdag ${new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE')}${item.competitionReportDelayDays > 0 ? `, återkoppling registrerad ${item.competitionReportDelayDays} dagar senare` : ''}`} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex(index)} onBlur={() => setHoverIndex(null)} onClick={() => setHoverIndex((current) => current === index ? null : index)}><rect x={dayX(item.date) - dayWidth / 2} y={top} width={dayWidth} height={chartHeight} fill="rgba(240, 180, 91, 0.18)" /><circle cx={x(index)} cy={top + 8} r="5" fill="#bd7412" /><title>{`Tävlingsdag${item.competitionReportDelayDays > 0 ? ` · återkoppling registrerad ${item.competitionReportDelayDays} dagar senare` : ''}`}</title></g>)}
      {metrics.map((metric) => lineSegments(metric).map((segment, segmentIndex) => <path key={`${metric.key}-${segmentIndex}`} className={`trend-line-${metric.key}`} d={smoothTrendPath(segment.map((point) => ({ x: x(point.index), y: y(point.value, metric.max) })))} fill="none" stroke={metric.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />))}
      {metrics.filter(metric => visible[metric.key] && metric.key !== 'swimMeterScale').flatMap(metric => trendGapSegments(items, metric.key).map(([a, b], index) => <path key={`gap-${metric.key}-${index}`} className={`trend-gap-${metric.key}`} d={`M ${x(a.index)},${y(a.value, metric.max)} L ${x(b.index)},${y(b.value, metric.max)}`} fill="none" stroke={metric.color} strokeDasharray="6 5" strokeWidth="2" opacity=".75"><title>Visuell förbindelse över saknade svar – inga registrerade mellanvärden</title></path>))}
      {metrics.map((metric) => visible[metric.key] && items.map((item, index) => hasTrendValue(item[metric.key]) ? <circle key={`${metric.key}-${index}`} className={`trend-dot-${metric.key}`} cx={x(index)} cy={y(Number(item[metric.key]), metric.max)} r="4" fill={metric.color} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} /> : null))}
      {dateLayout.labels.filter((label, index) => index % labelStep === 0 || index === dateLayout.labels.length - 1).map((label) => <text className="trend-x-label" key={label.date} x={dayX(label.date)} y={height - 10}>{new Date(`${label.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</text>)}
    </svg></div>
    {hoverIndex != null && items[hoverIndex] && <div className="trend-hover-card"><strong>{new Date(`${items[hoverIndex].date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong>{metrics.filter((metric) => visible[metric.key]).map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{hasTrendValue(items[hoverIndex][metric.key]) ? metric.key === 'swimMeterScale' ? `Simmeter: ${items[hoverIndex].swimMeters.toLocaleString('sv-SE')} m · ${items[hoverIndex].swimMeterSource}` : `${metric.label}: ${items[hoverIndex][metric.key]}` : `${metric.label}: uppgift saknas`}</span>)}{items[hoverIndex].competition && <span className="trend-competition-detail"><i style={{ background: '#bd7412' }} />Tävlingsdag{items[hoverIndex].competitionReportDelayDays > 0 ? ` · återkoppling registrerad ${items[hoverIndex].competitionReportDelayDays} dagar senare` : ''}</span>}</div>}
    <p className="trend-curve-note">Svart linje visar simmeter: rapporterad distans eller uppskattning från kopplade genomförda pass. I simmarens graf visas 0 m när ingen simning är registrerad; registrerad simning med okänd distans är en lucka. I gruppgrafen kan meter avse planerade pass. Färgade prickar visar registrerade skattningar. Streckade färgade linjer förbinder kända punkter över saknade svar, utan registrerade eller beräknade mellanvärden. Ingen förlängning görs före första eller efter sista svaret. Skattningar 0–5 till vänster, RPE 0–10 och tusental meter till höger. Gul bakgrund visar tävlingsdag. {meterScaleMax > 10 && 'Meterskalan har utökats för dagar över 10 000 m.'}</p>
    <div className="trend-line-legend">{metrics.map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}{items.some((item) => item.competition) && <span><i style={{ background: '#bd7412' }} />Tävlingsdag</span>}</div>
    <TrainingMeterChart items={originalItems} />
    <TrainingVolumeChart items={originalItems} />
    <div className="trend-pass-list">{originalItems.map((item, index) => <article key={`${item.date}-${index}`}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><span>{item.title}{item.mixedActivities && ' · Flera aktivitetstyper – passvärden visas separat'}{item.focus ? ` · ${item.focus}` : ''}{item.sessionSlots?.length ? ` · ${item.sessionSlots.map((slot) => slotLabels[slot] || slot).join(' + ')}` : ''}</span><small>{[item.durationMinutes != null && `${item.durationMinutes} min`, `${item.count} svar`].filter(Boolean).join(' · ')}</small>{item.activities?.map((activity, activityIndex) => <div className="trend-activity-note" key={activityIndex}><b>{activity.type ? activityLabel(activity.type) : 'Äldre svar · aktivitetstyp saknas'}</b><small>{activity.distanceMeters != null ? `${activity.type === 'swim' ? Number(activity.distanceMeters).toLocaleString('sv-SE') + ' m' : activity.type ? (Number(activity.distanceMeters) / 1000).toLocaleString('sv-SE') + ' km' : 'Rapporterad distans'}${activity.minutes != null ? ' · ' : ''}` : ''}{activity.minutes != null && `${activity.minutes} min`}</small>{activity.rpe != null && <small>RPE {activity.rpe}/10</small>}{activity.comment && <p>{activity.comment}</p>}</div>)}</article>)}</div>
  </div>
}
