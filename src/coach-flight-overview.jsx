import React, { useEffect, useState } from 'react'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { builtInFlightDefaults, flightGroupCurve, flightGroupId, FLIGHT_OVERVIEW_BATCH } from '../shared/flight-defaults.js'
import { FlightPlot } from './flight-record.jsx'
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

export default function CoachFlightOverview({ profiles, end, isToday, request, code, onOpenSwimmer, onOpenSettings, initialOpen, refreshKey }) {
  const [open, setOpen] = useState(initialOpen)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState(0)
  const [day, setDay] = useState(null)
  const roster = profiles.filter(profile => !profile.isTestProfile).sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv-SE'))
  const idKey = [...new Set(roster.map(profile => profile.id))].sort().join(',')
  const loadKey = `${code}:${end}:${idKey}:${refreshKey}:${attempt}`

  useEffect(() => {
    if (!open || !idKey || result?.key === loadKey) return
    const controller = new AbortController()
    const ids = idKey.split(',')
    setProgress(0)
    setDay(null)
    const load = async () => {
      const members = new Map()
      let clubMinSwimmers = builtInFlightDefaults.minSwimmers
      for (let index = 0; index < ids.length; index += FLIGHT_OVERVIEW_BATCH) {
        const batch = ids.slice(index, index + FLIGHT_OVERVIEW_BATCH)
        try {
          const data = await request(`/api/training?flightRecord=overview&end=${end}&ids=${encodeURIComponent(batch.join(','))}`, code, { signal: controller.signal, retry: false })
          if (controller.signal.aborted) return
          clubMinSwimmers = data.clubMinSwimmers
          data.profiles.forEach(profile => members.set(profile.id, profile))
        } catch {
          if (controller.signal.aborted) return
          batch.forEach(id => members.set(id, { unavailable: true, points: [] }))
        }
        setProgress(Math.min(ids.length, index + batch.length))
      }
      setResult({ key: loadKey, members, clubMinSwimmers })
    }
    void load()
    return () => controller.abort()
  }, [open, loadKey, idKey, code, end, request, result?.key])

  const loaded = result?.key === loadKey ? result : null
  const groups = new Set(roster.map(profile => flightGroupId(profile.trainingGroup)))
  const groupMinimum = groups.size === 1 && loaded
    ? [...loaded.members.values()].find(member => groups.has(member.group))?.minSwimmers : null
  const minimum = groupMinimum ?? loaded?.clubMinSwimmers
  const points = loaded ? flightGroupCurve(Array.from({ length: 28 }, (_, index) => coachWeekAddDays(end, index - 27)),
    roster.map(profile => loaded.members.get(profile.id) ?? {}), minimum) : []
  const selected = points.find(point => point.date === day) ?? points.at(-1)
  const someUnavailable = loaded && [...loaded.members.values()].some(member => member.unavailable || member.partial)

  return <details className="coach-flight-overview" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="coach-flight-icon" aria-hidden="true">✈︎</span>
      <span><strong>Flight Record</strong><small>Grupptrend och simmarnas formkurvor</small></span>
      <span className="coach-flight-count">{roster.length} simmare</span>
    </summary>
    <div className="coach-flight-overview-body">
      {onOpenSettings && <div className="coach-flight-overview-tools">
        <button type="button" className="text-button" onClick={onOpenSettings}>Standardinställningar →</button>
      </div>}
      {!roster.length ? <p>Inga simmare i de valda grupperna.</p> : !loaded ? <p role="status">Hämtar Flight Record · {progress} av {roster.length} simmare…</p> : <>
        {someUnavailable && <p role="status" className="coach-flight-note">Delar av underlaget kunde inte hämtas. <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Hämta igen</button></p>}
        <FlightPlot days={points} points={points} metric={groupMetric} asOf={end} period={points.length} selected={selected.date} onSelect={setDay}
          endLabel={isToday ? 'Idag' : dateLabel(end)} />
        <div className="coach-flight-overview-meta">
          <p>Genomsnitt av simmarnas Flight-värden med deras respektive inställningar. Minst {minimum} simmare per dag ingår för att gruppkurvan ska visas.</p>
          <label className="flight-field">Dag i gruppkurvan
            <select value={selected.date} onChange={event => setDay(event.target.value)}>
              {[...points].reverse().map(point => <option key={point.date} value={point.date}>{dateLabel(point.date)} · {point.value == null ? 'För lite underlag' : number(point.value)}</option>)}
            </select>
          </label>
        </div>
        <p className="coach-flight-coverage" aria-live="polite">{dateLabel(selected.date)} · {selected.count} av {roster.length} simmare med värde</p>
        <div className="coach-flight-table-wrap">
          <table className="coach-flight-table">
            <caption>Simmarnas Flight Record · senaste 28 dagarna till {dateLabel(end)}</caption>
            <thead><tr><th scope="col">Simmare</th><th scope="col">Senaste värde</th><th scope="col">Trend</th></tr></thead>
            <tbody>{roster.map(profile => {
              const member = loaded.members.get(profile.id)
              const latest = member?.points.findLast(point => Number.isFinite(point.value))
              return <tr key={profile.id}>
                <th scope="row"><button type="button" className="text-button" onClick={() => onOpenSwimmer(profile.id)}>{profile.emoji} {profile.displayName}</button></th>
                <td>{latest ? <><strong>{number(latest.value)}</strong><small>{dateLabel(latest.date)}{latest.limited || member.partial ? ' · Begränsat underlag' : ''}</small></>
                  : <small>{member?.unavailable || !member ? 'Underlag ej tillgängligt' : 'För lite underlag'}</small>}</td>
                <td>{latest && <MiniFlightLine points={member.points} />}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </>}
    </div>
  </details>
}
