import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TrainingEnergyGlyph from './training-energy-glyph.jsx'
import TrainingEnergyDetails from './training-energy-details.jsx'
import { currentTrainingEnergy } from '../shared/training-energy.js'
import './training-heart.css'

const motionKey = 'simkoll-training-heart-motion'
const readMotion = () => { try { return localStorage.getItem(motionKey) !== 'off' } catch { return true } }

// Keep the component/API name for compatibility; live presentation is now energy.
export default function TrainingHeart({ data, asOf, name, loading = false, error = '', excluded = false }) {
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false), [position, setPosition] = useState(null), [animate, setAnimate] = useState(readMotion)
  const [now, setNow] = useState(Date.now), [burst, setBurst] = useState(false)
  const trigger = useRef(null), panel = useRef(null), closeButton = useRef(null), timer = useRef(null), ignoreFocus = useRef(false)
  const id = useId(), heart = !excluded && !loading && !error && data?.asOf === asOf ? data : null
  const energy = currentTrainingEnergy(heart?.energy, now)
  const label = loading ? 'Hämtar känslosvar…' : error ? 'Underlag saknas' : energy.label
  const unavailable = excluded ? 'Profilen ingår inte i underlaget.' : loading ? 'Hämtar aktuellt underlag…' : error ? 'Underlaget kunde inte hämtas. Använd Uppdatera trafikljus för att försöka igen.' : 'Aktuellt underlag saknas.'
  const signature = energy.effect === 'max' ? Object.values(energy.metrics).map(metric => metric?.at).join('|') : ''
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const interval = setInterval(tick, 30000)
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(interval); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [])
  useEffect(() => {
    setBurst(false)
    if (!signature || !animate) return
    try {
      const key = 'simkoll-energy-burst:' + name
      if (sessionStorage.getItem(key) === signature) return
      sessionStorage.setItem(key, signature)
    } catch { /* Animation still works when session storage is unavailable. */ }
    setBurst(true)
    const timeout = setTimeout(() => setBurst(false), 1800)
    return () => clearTimeout(timeout)
  }, [signature, animate, name])
  const close = (restoreFocus = false) => {
    clearTimeout(timer.current); setOpen(false); setPinned(false)
    if (restoreFocus) { ignoreFocus.current = true; trigger.current?.focus(); queueMicrotask(() => { ignoreFocus.current = false }) }
  }
  const contains = node => node && (trigger.current?.contains(node) || panel.current?.contains(node))
  const enter = () => { clearTimeout(timer.current); if (window.matchMedia('(hover: hover)').matches) setOpen(true) }
  const leave = () => {
    clearTimeout(timer.current)
    if (!pinned) timer.current = setTimeout(() => { if (!contains(document.activeElement)) close() }, 180)
  }
  // A click on selectable, non-focusable panel text has relatedTarget=null.
  // Outside pointerdown/window blur handle that case without closing the panel
  // while the coach is selecting its explanation text.
  const blur = event => { if (event.relatedTarget && !contains(event.relatedTarget)) close() }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const update = event => setAnimate(event.type === 'simkoll-heart-motion' ? event.detail : readMotion())
    window.addEventListener('simkoll-heart-motion', update); window.addEventListener('storage', update)
    return () => { window.removeEventListener('simkoll-heart-motion', update); window.removeEventListener('storage', update) }
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const pointer = event => { if (!contains(event.target)) close() }
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(panel.current?.contains(document.activeElement)) } }
    const windowBlur = () => close()
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key)
    window.addEventListener('blur', windowBlur)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); window.removeEventListener('blur', windowBlur) }
  }, [open])
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return undefined }
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect || rect.bottom < 0 || rect.top > innerHeight) { close(); return }
      const width = Math.min(390, innerWidth - 16), below = innerHeight - rect.bottom - 16, above = rect.top - 16
      const down = below >= 280 || below >= above, maxHeight = Math.max(80, Math.min(560, down ? below : above))
      const height = Math.min(panel.current?.getBoundingClientRect().height || maxHeight, maxHeight)
      const next = { width, maxHeight, left: Math.max(8, Math.min(innerWidth - width - 8, rect.right - width)), top: down ? rect.bottom + 8 : Math.max(8, rect.top - height - 8) }
      setPosition(current => current && Object.keys(next).every(key => next[key] === current[key]) ? current : next)
    }
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    const observer = new ResizeObserver(update)
    if (panel.current) observer.observe(panel.current)
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open])
  const toggleMotion = () => {
    const next = !animate; setAnimate(next)
    try { localStorage.setItem(motionKey, next ? 'on' : 'off') } catch { /* Preference can still apply on this card without storage. */ }
    window.dispatchEvent(new CustomEvent('simkoll-heart-motion', { detail: next }))
  }
  return <div className="training-heart-control">
    <button ref={trigger} type="button" className={`training-heart-trigger training-heart-with-load training-energy-trigger${animate ? '' : ' motion-off'}`} aria-label={`Träningskänsla för ${name}: ${label}. Rapporterade upplevelser, inte uppmätt form. Visa värden och förklaring.`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} onMouseEnter={enter} onMouseLeave={leave} onFocus={() => { if (!ignoreFocus.current) setOpen(true) }} onBlur={blur} onClick={() => { if (pinned) close(); else { clearTimeout(timer.current); setOpen(true); setPinned(true); requestAnimationFrame(() => closeButton.current?.focus()) } }}>
      <span className="training-heart-icon" aria-hidden="true"><TrainingEnergyGlyph level={energy.level} effect={energy.effect} burst={burst} /></span>
      <span className="training-heart-status" aria-hidden="true"><strong>{label}</strong><small>Rapporterat senaste dygnet</small>{heart?.warnings.length > 0 && <small className="training-energy-followup">Separat uppföljningssignal</small>}</span>
    </button>
    {open && createPortal(<section ref={panel} id={`${id}-panel`} className="training-heart-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} style={position ? { ...position } : { visibility: 'hidden' }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave} onBlur={blur}>
      <header><div><small>Värden och förklaring</small><h3 id={`${id}-title`}>Träningskänsla · {name}</h3></div><button ref={closeButton} type="button" aria-label="Stäng förklaringen" onClick={() => close(true)}>×</button></header>
      {heart ? <TrainingEnergyDetails heart={heart} energy={energy} /> : <p role="status">{unavailable}</p>}
      <footer><button type="button" onClick={toggleMotion}>{animate ? 'Stäng av animationer' : 'Slå på animationer'}</button><small>Gäller energistjärnor i den här webbläsaren. Minskad rörelse i enhetens inställningar stoppar alltid animationen.</small></footer>
    </section>, document.body)}
  </div>
}
