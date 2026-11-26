import React, { useEffect, useState } from 'react'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { builtInFlightDefaults, flightGroupCurve, flightGroupId, FLIGHT_OVERVIEW_BATCH } from '../shared/flight-defaults.js'
import { FLIGHT_PERIODS } from '../shared/flight-record.js'
import { isTimeDate } from '../shared/swim-times.js'
import { FlightPlot } from './flight-record.jsx'
import { usePlanningWeekTypes } from './use-planning-week-types.js'
import './coach-flight-record.css'

const groupMetric = { label: 'Gruppens Flight-linje', subtitle: '50 = vanlig nivå', legend: 'Gruppens genomsnitt', unit: '', scale: [0, 100] }
const number = value => value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const dateLabel = day => new Date(day + 'T12:00:00Z').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function MiniFlightLine({ points }) {
  let path = ''
  let previous = false
  points.forEach((point, index) => {
    if (!Number.isFinite(point.value)) { previous = false; return }
    const x = 4 + index / Math.max(1, points.length - 1) * 96
    const y = 4 + (100 - point.value) / 100 * 27
    path += `${previous ? 'L' : 'M'} ${x} ${y} `
    previous = true
  })
  const latest = points.findLastIndex(point => Number.isFinite(point.value))
  return <svg className="coach-flight-sparkline" viewBox="0 0 104 35" aria-hidden="true">
    <line x1="4" x2="100" y1="17.5" y2="17.5" className="coach-flight-spark-grid" />
    <path d={path} fill="none" className="coach-flight-spark-path" />
    {latest >= 0 && <circle cx={4 + latest / Math.max(1, points.length - 1) * 96} cy={4 + (100 - points[latest].value) / 100 * 27} r="2.3" />}
  </svg>
}

export default function CoachFlightOverview({ profiles, availableGroups = [], asOf, request, code, onOpenSwimmer, onOpenSettings, initialOpen }) {
  const [open, setOpen] = useState(initialOpen)
  const [period, setPeriod] = useState(28)
  const [endDate, setEndDate] = useState(null)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState(0)
  const [day, setDay] = useState(null)
  const roster = profiles.filter(profile => !profile.isTestProfile).sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv-SE'))
  const idKey = [...new Set(roster.map(profile => profile.id))].sort().join(',')
  const end = endDate ?? asOf
  const start = coachWeekAddDays(end, 1 - period)
  const loadKey = `${code}:${end}:${idKey}:${attempt}`
  const coveredDays = result?.key === loadKey ? result.days : 0

  useEffect(() => {
    if (!open || !idKey || coveredDays >= period) return
    const controller = new AbortController()
    const ids = idKey.split(',')
    const members = new Map()
    let clubMinSwimmers = builtInFlightDefaults.minSwimmers
    let nextIndex = 0, completed = 0
    setProgress(0)
    setDay(null)
    const loadBatches = async () => {
      while (!controller.signal.aborted && nextIndex < ids.length) {
        const batch = ids.slice(nextIndex, nextIndex + FLIGHT_OVERVIEW_BATCH)
        nextIndex += batch.length
        try {
          const query = new URLSearchParams({ flightRecord: 'overview', end, days: period, ids: batch.join(',') })
          const data = await request(`/api/training?${query}`, code, { signal: controller.signal, retry: false })
          if (controller.signal.aborted) return
          clubMinSwimmers = data.clubMinSwimmers
          data.profiles.forEach(profile => members.set(profile.id, profile))
        } catch {
          if (controller.signal.aborted) return
        }
        // A profile can disappear from the result if its access changed while loading.
        batch.forEach(id => { if (!members.has(id)) members.set(id, { unavailable: true, points: [] }) })
        completed += batch.length
        setProgress(completed)
      }
    }
    Promise.all([loadBatches(), loadBatches()]).then(() => {
      if (!controller.signal.aborted) setResult({ key: loadKey, days: period, members, clubMinSwimmers })
    })
    return () => controller.abort()
  }, [open, loadKey, idKey, code, end, period, request, coveredDays])

  const loaded = coveredDays >= period ? result : null
  const groups = new Set(roster.map(profile => flightGroupId(profile.trainingGroup)))
  const weekPlan = usePlanningWeekTypes({ code, request, from: open && idKey ? start : null, to: end })
  const groupNames = new Map(availableGroups)
  const weekTypes = weekPlan.data?.weekTypes?.filter(row => groups.has(row.groupId))
    .map(row => ({ ...row, groupName: groups.size > 1 ? groupNames.get(row.groupId) ?? row.groupId : null })) ?? []
  const groupMinimum = groups.size === 1 && loaded
    ? [...loaded.members.values()].find(member => groups.has(member.group))?.minSwimmers : null
  const minimum = groupMinimum ?? loaded?.clubMinSwimmers
  const points = loaded ? flightGroupCurve(Array.from({ length: period }, (_, index) => coachWeekAddDays(start, index)),
    roster.map(profile => loaded.members.get(profile.id) ?? {}), minimum) : []
  const selected = points.find(point => point.date === day) ?? points.at(-1)
  const someUnavailable = loaded && [...loaded.members.values()].some(member => member.unavailable || member.partial)

  return <details className="coach-flight-overview" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="coach-flight-icon" aria-hidden="true">✈︎</span>
      <span><strong>Flight Record</strong><small>Gruppens och simmarnas formkurvor</small></span>
      <span className="coach-flight-count">{roster.length} simmare</span>
    </summary>
    <div className="coach-flight-overview-body">
      <div className="coach-flight-overview-tools">
        <div className="flight-segments" role="group" aria-label="Period för Flight Record">
          {FLIGHT_PERIODS.map(days => <button key={days} type="button" aria-pressed={period === days}
            onClick={() => { setPeriod(days); setDay(null) }}>{days} dagar</button>)}
        </div>
        <label className="flight-field">Till och med
          <input type="date" value={end} min="1900-01-01" max={asOf} onChange={event => {
            const date = event.currentTarget.value
            if (isTimeDate(date) && event.currentTarget.validity.valid) setEndDate(date === asOf ? null : date)
          }} />
        </label>
        {onOpenSettings && <button type="button" className="text-button" onClick={onOpenSettings}>Standardinställningar →</button>}
      </div>
      {!roster.length ? <p>Inga simmare i de valda grupperna.</p> : !loaded ? <p role="status">Hämtar Flight Record · {progress} av {roster.length} simmare…</p> : <>
        {someUnavailable && <p role="status" className="coach-flight-note">Delar av underlaget kunde inte hämtas. <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Hämta igen</button></p>}
        <FlightPlot days={points} points={points} metric={groupMetric} asOf={end} period={points.length} selected={selected.date} onSelect={setDay}
          endLabel={end === asOf ? 'Idag' : dateLabel(end)} weekTypes={weekTypes} />
        <div className="coach-flight-overview-meta">
          <p>Genomsnitt av simmarnas Flight-värden med deras respektive inställningar. En dag visas när minst {minimum} simmare har ett värde.</p>
          <label className="flight-field">Dag i gruppkurvan
            <select value={selected.date} onChange={event => setDay(event.target.value)}>
              {[...points].reverse().map(point => <option key={point.date} value={point.date}>{dateLabel(point.date)} · {point.value == null ? 'För lite underlag' : number(point.value)}</option>)}
            </select>
          </label>
        </div>
        <p className="coach-flight-coverage" aria-live="polite">{dateLabel(selected.date)} · {selected.count} av {roster.length} simmare med värde</p>
        <div className="coach-flight-table-wrap">
          <table className="coach-flight-table">
            <caption>Simmarnas Flight Record · {dateLabel(start)}–{dateLabel(end)}</caption>
            <thead><tr><th scope="col">Simmare</th><th scope="col">Senaste värde</th><th scope="col">Trend</th></tr></thead>
            <tbody>{roster.map(profile => {
              const member = loaded.members.get(profile.id)
              const memberPoints = member?.points.filter(point => point.date >= start) ?? []
              const latest = memberPoints.findLast(point => Number.isFinite(point.value))
              return <tr key={profile.id}>
                <th scope="row"><button type="button" className="text-button" onClick={() => onOpenSwimmer(profile.id)}>{profile.emoji} {profile.displayName}</button></th>
                <td>{latest ? <><strong>{number(latest.value)}</strong><small>{dateLabel(latest.date)}{latest.limited || member.partial ? ' · Begränsat underlag' : ''}</small></>
                  : <small>{member?.unavailable || !member ? 'Underlag ej tillgängligt' : 'För lite underlag'}</small>}</td>
                <td>{latest && <MiniFlightLine points={memberPoints} />}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </>}
    </div>
  </details>
}
