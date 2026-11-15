import React, { useEffect, useRef, useState } from 'react'
import { swimmerSpeedSignal, refreshSwimmerSpeedSignal } from '../shared/form-live.js'
import './swimmer-speed.css'

export default function SwimmerSpeed({ responses = [], now, signal: suppliedSignal }) {
  const [, setClock] = useState(0)
  const signal = suppliedSignal ? refreshSwimmerSpeedSignal(suppliedSignal, now) : swimmerSpeedSignal(responses, now)
  const ref = useRef(null), [moving, setMoving] = useState(false)
  useEffect(() => {
    if (now || !signal.submittedAt) return undefined
    const expires = signal.refreshAt
    if (expires <= Date.now()) return undefined
    const timer = setTimeout(() => setClock(value => value + 1), expires - Date.now() + 10)
    return () => clearTimeout(timer)
  }, [signal.submittedAt, signal.refreshAt, now])
  useEffect(() => {
    let visible = false
    const update = () => { setMoving(visible && !document.hidden); setClock(value => value + 1) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update() })
    observer.observe(ref.current); document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  const when = signal.submittedAt ? new Date(signal.submittedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }) : ''
  return <span ref={ref} className={`swimmer-speed speed-${signal.level} speed-pulse-${signal.pulse}${signal.fresh && !signal.recent ? ' speed-aging' : ''}${moving && signal.pulse !== 'none' ? ' speed-moving' : ''}`} role="img" aria-label={`${signal.label}${when ? ` Svar ${when}, aktivitetsdag ${signal.date}.` : ''}`} title={`${signal.label}${when ? ` Svar ${when}, aktivitetsdag ${signal.date}.` : ''}`}>
    <svg viewBox="0 0 48 56" aria-hidden="true"><path d="M28 3 7 31h15l-3 22 23-31H26z" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /></svg>
    <small>{signal.value == null ? 'Inget svar' : `${signal.fresh ? '' : 'Senast '}${signal.value}/5`}</small>
    {signal.value != null && <small className="speed-age">{signal.ageLabel}</small>}
  </span>
}
