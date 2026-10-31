import React, { useState } from 'react'
import { WORKOUT_FOCUSES } from '../shared/workout-focuses.js'
import { workoutStartLabel } from '../shared/workout-start.js'

export default function WorkoutCard({ workout, locked, initiallyExpanded = false }) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const workouts = (Array.isArray(workout) ? workout : workout ? [workout] : []).filter(Boolean)
  return (
    <section className={`workout-card ${workouts.length ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div>{workouts.length > 0 && !locked && <button type="button" className="workout-expand-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Dölj ↑' : `Visa ${workouts.length > 1 ? 'pass' : 'pass'} ↓`}</button>}</div>
      {locked ? <div className="locked-workout"><span>🔒</span><div><strong>Checka in för att se passet</strong><small>Du kan fortfarande välja att svara anonymt.</small></div></div> : workouts.length ? <div className="workout-body">{workouts.map((item) => <article className="workout-day-item" key={item.id}><h3>{item.title}</h3><WorkoutMeta workout={item} />{expanded && <><WorkoutContent content={item.content} />{item.note && <aside><strong>Kommentar från tränaren</strong>{item.note}</aside>}</>}</article>)}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
    </section>
  )
}

export function WorkoutContent({ content }) {
  const lines = String(content || '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  const isSection = (line) => { const clean = line.replace(/^#+\s*/, ''); return /^(insim|uppvärmning|huvudserie|serie|ben|arm|spec|teknik|fart|avsim|nedvarvning|styrka)\b/i.test(clean) || (/^[^·]{1,42}:$/.test(clean) && !/\d/.test(clean)) }
  return <div className="workout-content">{lines.map((line, index) => { const indented = /^\s+/.test(line); const clean = line.trim().replace(/^#+\s*/, '').replace(/^[-•]\s*/, ''); if (isSection(clean)) return <h4 key={`${index}-${clean}`}>{clean.replace(/:$/, '')}</h4>; const parts = clean.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean); const timeIndex = parts.findIndex((part) => /^(?:st\.?|start|starttid)\s*[:.]?\s*[\d:.,-]+/i.test(part)); let start = timeIndex >= 0 ? parts.splice(timeIndex, 1)[0] : ''; if (!start) { const match = clean.match(/\s+(st\.?\s*[\d:.,-]+)\s*$/i); if (match) { start = match[1]; parts.splice(0, parts.length, clean.slice(0, match.index).trim()) } } return <div className={`workout-set${indented ? ' indented' : ''}`} key={`${index}-${clean}`}><span className="workout-set-main">{parts.join(' · ')}</span>{start && <span className="workout-set-time">{workoutStartLabel(start)}</span>}</div> })}</div>
}

export function WorkoutMeta({ workout }) {
  const focus = WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1]
  const groupLabels = { ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }
  if (!focus && !workout.distanceMeters && !workout.durationMinutes && !workout.targetGroups?.length) return null
  return <div className="workout-meta"><span>{focus || 'Pass'}</span>{workout.distanceMeters && <span>{Number(workout.distanceMeters).toLocaleString('sv-SE')} m</span>}{workout.durationMinutes && <span>{workout.durationMinutes} min</span>}{workout.targetGroups?.length && <span>{workout.targetGroups.map((group) => groupLabels[group] || group).join(' · ')}</span>}</div>
}
