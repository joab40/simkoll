import React, { useEffect, useId, useRef, useState } from 'react'
import { coachFollowUpHelp } from '../shared/coach-followup-help.js'
import './coach-followup-reason.css'

export default function CoachFollowUpReason({ reason, warning, periodLabel }) {
  const help = coachFollowUpHelp(reason), id = useId(), root = useRef(null)
  const [pinned, setPinned] = useState(false), [transient, setTransient] = useState(false)
  const open = pinned || transient
  const close = () => { setPinned(false); setTransient(false) }
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!root.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const className = warning ? `coach-sleep-reason ${warning}` : undefined
  if (!help) return <li className={className}>{reason}</li>
  return <li ref={root} className={className} onPointerEnter={(event) => { if (event.pointerType === 'mouse') setTransient(true) }} onPointerLeave={() => setTransient(false)}>
    <button type="button" className="coach-followup-reason-trigger" aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} onFocus={() => setTransient(true)} onBlur={() => setTransient(false)} onClick={() => { setTransient(false); setPinned((value) => !value) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close() } }}>
      <span>{warning ? `⚠ ${reason}` : reason}</span><span className="coach-followup-info" aria-hidden="true">i</span>
    </button>
    <div className="coach-followup-reason-help" id={id} role="note" hidden={!open}><strong>{help.title}</strong><p>{help.description}</p>{help.rule && <p>{help.rule}</p>}{periodLabel && <small>Underlag: {periodLabel}.</small>}<small>En signal för dialog, inte en diagnos eller ett automatiskt träningsbeslut.</small></div>
  </li>
}
