import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import WorkoutCard from './workout-card.jsx'
import { workoutPreviewContext } from '../shared/workout-preview.js'
import './workout-preview.css'

// No draft HTML is interpolated here. React escapes all content in the portal.
const frameDocument = '<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="workout-preview-root"></main></body></html>'

function SwimmerPreviewFrame({ workouts, width, onClose }) {
  const [target, setTarget] = useState(null)
  useEffect(() => {
    if (!target) return
    // Keyboard events in an iframe do not reach the outer modal dialog.
    const frame = target.ownerDocument
    const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    frame.addEventListener('keydown', escape)
    return () => frame.removeEventListener('keydown', escape)
  }, [target, onClose])
  const prepare = (event) => {
    const frame = event.currentTarget.contentDocument
    if (!frame) return
    // Use the app's actual stylesheets in a real viewport, so media queries
    // behave exactly like a phone/desktop instead of just narrowing a div.
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((style) => frame.head.appendChild(style.cloneNode(true)))
    const spacing = frame.createElement('style')
    spacing.textContent = 'html,body{margin:0;min-height:100%}body{padding:16px}#workout-preview-root>.workout-card{margin-top:0}'
    frame.head.appendChild(spacing)
    setTarget(frame.getElementById('workout-preview-root'))
  }
  return <>
    <iframe className={`swimmer-preview-frame ${width}`} title={`Simmarvyn – ${width === 'mobile' ? 'mobil' : 'webb'}`} sandbox="allow-same-origin" srcDoc={frameDocument} onLoad={prepare} />
    {target && createPortal(<WorkoutCard key={workouts.map((item) => item.id).join('|')} workout={workouts} locked={false} initiallyExpanded />, target)}
  </>
}

export default function WorkoutPreview({ workouts, date, timeOfDay, onClose }) {
  const dialog = useRef(null), close = useRef(null)
  const titleId = useId(), descriptionId = useId()
  const [width, setWidth] = useState('mobile'), [selection, setSelection] = useState('all')
  const visible = selection === 'all' ? workouts : workouts.filter((_, index) => String(index) === selection)
  const incomplete = workouts.some((workout) => !workout.title?.trim() || !workout.content?.trim())
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement, previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal(); close.current?.focus()
    return () => { element.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus?.({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={dialog} className="workout-draft-preview" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="workout-draft-preview-layout">
      <header><div><p className="eyebrow">Förhandsgranskning · inte publicering</p><h2 id={titleId}>Så visas passet för simmaren</h2><p>{workoutPreviewContext(date, timeOfDay)}</p></div><button type="button" ref={close} className="secondary-button" onClick={onClose} aria-label="Stäng förhandsgranskningen">Stäng ×</button></header>
      <p id={descriptionId} className="workout-preview-notice">Visar ditt aktuella utkast som ett upplåst pass efter incheckning. Inget sparas, publiceras eller skickas till simmarna när du förhandsgranskar.</p>
      {incomplete && <p className="workout-preview-notice incomplete" role="status">Rubrik eller passbeskrivning saknas i något utkast. Gå tillbaka och fyll i det före publicering.</p>}
      <div className="workout-preview-controls"><div role="group" aria-label="Förhandsgranskningens skärmbredd"><button type="button" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>Mobil</button><button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>Webb</button></div>{workouts.length > 1 && <label>Visa passalternativ<select value={selection} onChange={(event) => setSelection(event.target.value)}><option value="all">Alla alternativ ({workouts.length})</option>{workouts.map((workout, index) => <option key={workout.id || index} value={String(index)}>{workout.title || `Alternativ ${index + 1}`}</option>)}</select></label>}</div>
      <div className="workout-preview-canvas" role="region" aria-label="Förhandsgranskning. I webbläge kan du rulla i sidled." tabIndex={0}><SwimmerPreviewFrame workouts={visible} width={width} onClose={onClose} /></div>
      {width === 'desktop' && <small className="workout-preview-scroll-hint">Webbvy: 1 080 px. Rulla i sidled om hela bredden inte får plats.</small>}
      <footer><button type="button" className="primary-button" onClick={onClose}>← Tillbaka och redigera</button><small>Publicera först när du är nöjd, från passformuläret.</small></footer>
    </div>
  </dialog>, document.body)
}
