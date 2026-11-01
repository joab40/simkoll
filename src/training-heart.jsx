import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TrainingHeartGlyph from './training-heart-glyph.jsx'
import { trainingHeartLoadSummary } from '../shared/training-heart-load.js'
import './training-heart.css'

const colors = { unknown: 'För lite aktuell känsloinformation', green: 'God rapporterad kropp- och dagskänsla', yellow: 'Blandad eller lägre kropp- och dagskänsla', red: 'Låg rapporterad kropp- eller dagskänsla' }
const rings = { unknown: 'Jämförelse saknas', lower: 'Lägre rapporterad belastning', similar: 'Liknande rapporterad belastning', higher: 'Högre rapporterad belastning' }
const motions = { none: 'Ingen animation: för lite aktuell fartkänsla', slow: 'Lugn animation: lägre fartkänsla', gentle: 'Mjuk animation: fartkänsla i mitten av skalan', brisk: 'Något snabbare animation: högre fartkänsla' }
const number = value => value == null ? 'Saknas' : Number(value).toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const date = value => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }) : 'saknas'
const metric = value => value.days ? `${number(value.value)}/5 · ${value.days} dagar · senaste ${date(value.lastDay)}` : 'Saknas för perioden'
const motionKey = 'simkoll-training-heart-motion'
const readMotion = () => { try { return localStorage.getItem(motionKey) !== 'off' } catch { return true } }

export default function TrainingHeart({ data, asOf, name, loading = false, error = '', excluded = false }) {
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false), [position, setPosition] = useState(null), [animate, setAnimate] = useState(readMotion)
  const trigger = useRef(null), panel = useRef(null), closeButton = useRef(null), timer = useRef(null), ignoreFocus = useRef(false)
  const id = useId(), heart = !excluded && !loading && !error && data?.asOf === asOf ? data : null
  const color = heart?.color || 'unknown', ring = heart?.load.ring || 'unknown', motion = heart?.speed.motion || 'none'
  const warnings = heart?.warnings || []
  const loadSummary = trainingHeartLoadSummary(heart?.load)
  const unavailable = excluded ? 'Profilen ingår inte i detta underlag, till exempel en testprofil eller en avstängd profil.' : loading ? 'Hämtar aktuellt underlag…' : error ? 'Underlaget kunde inte hämtas. Använd Uppdatera trafikljus för att försöka igen.' : 'Aktuellt underlag saknas. Inget antas vara bra eller dåligt.'
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
    <button ref={trigger} type="button" className={`training-heart-trigger training-heart-with-load ${color} ring-${ring}${animate ? '' : ' motion-off'}`} aria-label={`Träningshjärtat för ${name}: ${loading ? 'hämtar underlag' : error ? 'underlag saknas' : colors[color]}. ${loadSummary.label}. ${loadSummary.description}${warnings.length ? ' Uppföljningssignal finns.' : ''} Visa värden och förklaring.`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} onMouseEnter={enter} onMouseLeave={leave} onFocus={() => { if (!ignoreFocus.current) setOpen(true) }} onBlur={blur} onClick={() => { if (pinned) close(); else { clearTimeout(timer.current); setOpen(true); setPinned(true); requestAnimationFrame(() => closeButton.current?.focus()) } }}>
      <span className="training-heart-icon" aria-hidden="true"><TrainingHeartGlyph motion={motion} />{warnings.length > 0 && <span className="training-heart-warning">!</span>}</span>
      <span className={`training-heart-load-label load-${loadSummary.direction}`} aria-hidden="true"><small>Belastning</small><strong>{loadSummary.value}</strong></span>
    </button>
    {open && createPortal(<section ref={panel} id={`${id}-panel`} className="training-heart-panel" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} style={position ? { ...position } : { visibility: 'hidden' }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave} onBlur={blur}>
      <header><div><small>Värden och förklaring</small><h3 id={`${id}-title`}>Träningshjärtat · {name}</h3></div><button ref={closeButton} type="button" aria-label="Stäng förklaringen" onClick={() => close(true)}>×</button></header>
      <p className="training-heart-caveat">Visuell överblick av rapporterade upplevelser. Inte verklig puls, uppmätt form, diagnos eller en sammanvägd hälsopoäng.</p>
      {warnings.length > 0 && <div className="training-heart-alert"><strong>Att uppmärksamma, även vid grön känslofärg</strong><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      {!heart ? <p role="status">{unavailable}</p> : <>
        <p>Underlag till och med {date(heart.asOf)} · Saknade värden är inte noll.</p>
        <div className="training-heart-load-explanation"><strong>{loadSummary.label}</strong><p>{loadSummary.description}</p><small>{date(heart.periods.start)}–{date(heart.asOf)} mot {date(heart.periods.previousStart)}–{date(heart.periods.previousEnd)} · RPE × rapporterade minuter, inte simmeter eller procent av ett träningsmål. Ringen står stilla; bara hjärtat kan pulsera.</small></div>
        <section><h4>Aktuella värden</h4><dl className="training-heart-overview">
          <div><dt>Kropp</dt><dd>{metric(heart.body)}</dd></div>
          <div><dt>Dagskänsla</dt><dd>{metric(heart.feeling)}</dd></div>
          <div><dt>Belastning</dt><dd>{number(heart.load.value)} RPE × min · {heart.load.total ? `${heart.load.known} av ${heart.load.total} rapporter` : 'inga efterrapporter'}</dd></div>
          <div><dt>Fartkänsla</dt><dd>{metric(heart.speed)}</dd></div>
          <div><dt>Sömn</dt><dd>{heart.sleep.nights ? `${number(heart.sleep.averageMinutes / 60)} h · ${heart.sleep.nights} nätter · senaste ${date(heart.sleep.lastDay)}` : 'Saknas'}</dd></div>
        </dl><p>Färg = kropp och dagskänsla. Ring = rapporterad belastning mot föregående vecka. Rörelse = upplevd simfart. Varning = sömn eller sjukdom.</p></section>
        <details className="training-heart-rules"><summary>Perioder, täckning och hur värdena används</summary>
        <section><h4>Färg · {colors[color]}</h4><p>{date(heart.periods.feelingStart)}–{date(heart.asOf)}:</p><dl><div><dt>Kropp</dt><dd>{metric(heart.body)}</dd></div><div><dt>Dagskänsla</dt><dd>{metric(heart.feeling)}</dd></div></dl><p>Varje dags genomsnitt väger lika. Minst två dagar med svar för vardera måttet behövs. De visade snitten avrundas till en decimal före färgvalet: något snitt högst 2 ger rött, något under 3,5 gult, båda minst 3,5 grönt. Annars grått. På gymmet beskriver kroppssvaret kraft och spänst. Produktregler för samtalsstöd, inte medicinska gränser. Detta skiljer sig från trafikljuset, som även använder planering och uppföljningssignaler.</p></section>
        <section><h4>Ytterring · {rings[ring]}</h4><p>{date(heart.periods.start)}–{date(heart.asOf)}: <strong>{number(heart.load.value)}</strong> RPE × rapporterade minuter. Underlag: {heart.load.known} av {heart.load.total} rapportgrupper.</p><p>Föregående sju dagar, {date(heart.periods.previousStart)}–{date(heart.periods.previousEnd)}: {number(heart.load.previous.value)} · {heart.load.previous.known} av {heart.load.previous.total} rapportgrupper.</p><p>{heart.load.ratio == null ? 'Neutral ring: underlaget räcker inte för jämförelse.' : `Nuvarande belastning är ${number(heart.load.ratio * 100)} % av föregående periods rapporterade belastning.`} Det visade procentvärdet avrundas till en decimal: mindre ring under 80 %, större över 120 %, annars samma. Större betyder mer rapporterad belastning, inte bättre.</p><p>Jämförelse kräver minst tre rapporter på minst två dagar och RPE/minuter i minst 80 % av rapporterna i båda perioderna. Bara uttryckligen rapporterad tid räknas, inte planerade eller uppskattade minuter. Tävling och Inte genomfört ingår inte. Äldre svar utan tydlig aktivitet räknas som saknat underlag. Senaste efterrapport per dag, aktivitet och morgon/eftermiddag används; upprepade svar räknas inte flera gånger. Två separata pass med samma dag, aktivitet och passval kan därför inte särskiljas här.</p></section>
        <section><h4>Animation · fartkänsla från simning</h4><p>{metric(heart.speed)} · {motions[motion]}.</p><p>Senaste sju dagarna, minst två dagar med fartkänsla och ett svar de senaste tre dagarna. Bara efterrapporter uttryckligen märkta simning, inte tävling. Högst 2 ger lugn, minst 4 något snabbare, annars mjuk animation. Gymmets Stark/Explosiv tolkas inte som simfart. Animationen är symbolisk, inte hjärtfrekvens.</p></section>
        <section><h4>Separata uppföljningssignaler · sju dagar</h4><p>Sömn: {heart.sleep.nights ? `${number(heart.sleep.averageMinutes / 60)} h i snitt · ${heart.sleep.nights} nätter · ${heart.sleep.poorNights} med Dålig sömn · senaste ${date(heart.sleep.lastDay)}` : 'Saknas'}. Sjukdom: {heart.sickDays.length} rapporterade dagar.</p>{warnings.length ? <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>Ingen signal i tillgängliga svar. Det är inte ett bevis på full återhämtning.</p>}<p>Sömnsignaler följer Simkolls befintliga regler: de tre senaste rapporterade nätterna inom sju dagar högst 7 h, minst fem sådana nätter, minst två Dålig-svar eller snitt under 7 h på minst tre nätter. Sjukdom senaste sju dagarna visas också. En bra känslofärg tar inte bort varningssymbolen. RPE, fart och sömn ändrar inte själva känslofärgen.</p></section>
        </details>
      </>}
      <footer><button type="button" aria-pressed={!animate} onClick={toggleMotion}>{animate ? 'Stäng av animationer' : 'Aktivera animationer'}</button><small>Gäller träningshjärtan i den här webbläsaren. Minskad rörelse i enhetens inställningar stoppar alltid animationen.</small></footer>
    </section>, document.body)}
  </div>
}
