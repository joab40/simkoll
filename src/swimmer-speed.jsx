import React, { useEffect, useRef, useState } from 'react'
import { swimmerSpeedSignal, freshLiveAnswer, formLiveEndOfDay } from '../shared/form-live.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import './swimmer-speed.css'

export default function SwimmerSpeed({ responses = [], now, signal: suppliedSignal }) {
  const [, setClock] = useState(0)
  const base = suppliedSignal || swimmerSpeedSignal(responses, now), fresh = base.fresh && freshLiveAnswer(base, now || new Date().toISOString())
  const signal = fresh ? base : { ...base, fresh: false, level: 'unknown', label: `${base.label}${base.fresh ? ' Äldre svar – inte aktuellt nuläge.' : ''}` }
  const ref = useRef(null), [moving, setMoving] = useState(false)
  useEffect(() => {
    if (now || !base.submittedAt || !base.date) return undefined
    const expires = Math.min(Date.parse(base.submittedAt) + 48 * 3600000, Date.parse(formLiveEndOfDay(coachWeekAddDays(base.date, 1))) + 1)
    if (expires <= Date.now()) return undefined
    const timer = setTimeout(() => setClock(value => value + 1), expires - Date.now() + 10)
    return () => clearTimeout(timer)
  }, [base.submittedAt, base.date, now])
  useEffect(() => {
    let visible = false
    const update = () => { setMoving(visible && !document.hidden); setClock(value => value + 1) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update() })
    observer.observe(ref.current); document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  const when = signal.submittedAt ? new Date(signal.submittedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }) : ''
  return <span ref={ref} className={`swimmer-speed speed-${signal.level}${moving && signal.fresh ? ' speed-moving' : ''}`} role="img" aria-label={`${signal.label}${when ? ` Svar ${when}, aktivitetsdag ${signal.date}.` : ''}`} title={`${signal.label}${when ? ` Svar ${when}, aktivitetsdag ${signal.date}.` : ''}`}>
    <svg viewBox="0 0 48 56" aria-hidden="true"><path d="M28 3 7 31h15l-3 22 23-31H26z" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /></svg>
    <small>{signal.fresh ? `${signal.value}/5` : signal.value == null ? 'Inget svar' : 'Äldre svar'}</small>
  </span>
}
