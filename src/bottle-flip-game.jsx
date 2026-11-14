import React, { useCallback, useEffect, useRef, useState } from 'react'
import { advanceBottle, BOTTLE_ROUND_SECONDS, BOTTLE_ATTEMPTS, createBottleGame, startBottle, pressBottle, releaseBottle, cancelBottleCharge, pauseBottle, resumeBottle, validBottleScore } from './bottle-flip-engine.js'
import { drawBottle } from './bottle-flip-art.js'
import { paintBottlePower } from './bottle-flip-power.js'
import { enterBalanceFullscreen as enterFullscreen, exitBalanceFullscreen as exitFullscreen } from './balance-fullscreen.js'
import './bottle-flip-game.css'

const snapshot = game => ({ status: game.status, phase: game.phase, score: game.score, lives: game.lives, charge: game.charge, elapsed: game.elapsed, landings: game.landings, streak: game.streak, bestStreak: game.bestStreak, feedback: game.feedbackFor > 0 ? game.feedback : '' })

export default function BottleFlipGame({ code, onBack, preview = false, request }) {
  const model = useRef(null)
  if (!model.current) model.current = createBottleGame()
  const canvas = useRef(null), shell = useRef(null), input = useRef(null), mounted = useRef(false), handled = useRef(null), pending = useRef(null), saveLock = useRef(false), boardEpoch = useRef(0), reducedMotion = useRef(false), fullscreenButton = useRef(null), fullscreenBusy = useRef(false)
  const [view, setView] = useState(() => snapshot(model.current)), [board, setBoard] = useState(null), [boardError, setBoardError] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false), [fullscreen, setFullscreen] = useState(null)
  const powerFill = useRef(null)
  const refreshView = () => setView(snapshot(model.current))
  const paint = () => { if (canvas.current) drawBottle(canvas.current, model.current, reducedMotion.current); paintBottlePower(powerFill.current, model.current.charge) }
  const clearInput = useCallback(() => { input.current = null; cancelBottleCharge(model.current); paintBottlePower(powerFill.current, 0) }, [])
  const pause = useCallback(() => { clearInput(); pauseBottle(model.current); setView(snapshot(model.current)) }, [clearInput])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const loadBoard = useCallback(async () => {
    if (preview) return
    const epoch = ++boardEpoch.current
    try {
      const data = await request('/api/points?game=bottleflip&lifetime=true', code)
      if (mounted.current && epoch === boardEpoch.current) { setBoard(data); setBoardError('') }
    } catch { if (mounted.current && epoch === boardEpoch.current) setBoardError('Topplistan kunde inte hämtas. Du kan fortfarande spela.') }
  }, [code, preview, request])
  useEffect(() => { loadBoard() }, [loadBoard])
  const save = useCallback(async () => {
    if (preview || !pending.current || saveLock.current) return
    saveLock.current = true; setSaving(true); setMessage('Sparar resultatet…'); ++boardEpoch.current
    const result = pending.current
    try {
      const data = await request('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'bottleflip', score: result.score }) })
      if (mounted.current) { ++boardEpoch.current; setBoard(data); setBoardError(''); pending.current = null; setMessage('Resultatet är sparat.') }
    } catch { if (mounted.current) setMessage('Resultatet kunde inte sparas. Försök igen eller fortsätt utan att spara.') }
    finally { saveLock.current = false; if (mounted.current) setSaving(false) }
  }, [code, preview, request])
  useEffect(() => {
    const game = model.current
    if (!['over', 'complete'].includes(view.status) || handled.current === game) return
    handled.current = game
    if (!validBottleScore(game.score)) { setMessage('Ingen landning denna gång. Prova igen!'); return }
    if (preview) { setBoard(previous => ({ ownBest: Math.max(previous?.ownBest || 0, game.score), leaderboard: [] })); setMessage('Testläge – resultat och poäng sparas inte.'); return }
    pending.current = { score: game.score }; save()
  }, [view.status, preview, save])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = media.matches; paint() }
    update(); media.addEventListener('change', update)
    const observer = new ResizeObserver(paint); if (canvas.current) observer.observe(canvas.current)
    return () => { observer.disconnect(); media.removeEventListener('change', update) }
  }, [])
  useEffect(() => {
    paint()
    if (view.status !== 'playing') return
    let frame, last = performance.now(), lastView = 0
    const loop = now => {
      const dt = (now - last) / 1000; last = now
      if (dt > 1) { pause(); paint(); return }
      advanceBottle(model.current, dt); paint()
      if (now - lastView > 65 || model.current.status !== 'playing') { refreshView(); lastView = now }
      if (model.current.status === 'playing') frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [view.status, pause])
  useEffect(() => {
    const hide = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hide) }
  }, [pause])
  const start = () => {
    if (saveLock.current || pending.current) return
    clearInput(); model.current = startBottle(createBottleGame()); setMessage(''); refreshView(); shell.current?.focus({ preventScroll: true })
  }
  const begin = token => { if (input.current === null && pressBottle(model.current)) { input.current = token; refreshView() } }
  const release = token => { if (input.current === token) { input.current = null; releaseBottle(model.current); paintBottlePower(powerFill.current, 0); refreshView() } }
  const pointerDown = event => {
    if (event.button !== 0 || input.current !== null || model.current.status !== 'playing' || model.current.phase !== 'resting') return
    event.preventDefault(); shell.current?.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); begin(`pointer:${event.pointerId}`)
  }
  const pointerUp = event => { event.preventDefault(); release(`pointer:${event.pointerId}`) }
  const pointerCancel = event => { if (input.current === `pointer:${event.pointerId}`) { clearInput(); refreshView() } }
  const isChargeKey = event => ['Space', 'ArrowUp', 'KeyW'].includes(event.code) || event.code === 'Enter' && event.target.dataset.bottleHold !== undefined
  const keyDown = event => {
    if (isChargeKey(event) && (event.target === shell.current || event.target.tagName === 'CANVAS' || event.target.dataset.bottleHold !== undefined)) {
      event.preventDefault(); if (!event.repeat) begin(`key:${event.code}`)
    }
    if (event.code === 'KeyP' && !event.repeat) { event.preventDefault(); if (model.current.status === 'paused') { resumeBottle(model.current); refreshView() } else pause() }
    if (event.key === 'Tab' && fullscreen) {
      const buttons = [...shell.current.querySelectorAll('button:not([disabled])')], first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && [shell.current, first].includes(document.activeElement)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  const keyUp = event => { if (isChargeKey(event)) { event.preventDefault(); release(`key:${event.code}`) } }
  const closeFullscreen = useCallback(async () => {
    pause()
    try { await exitFullscreen(shell.current, document); if (mounted.current) { setFullscreen(null); fullscreenButton.current?.focus({ preventScroll: true }) } } catch { /* Keep the exit button available. */ }
  }, [pause])
  const toggleFullscreen = async () => {
    if (fullscreenBusy.current) return
    fullscreenBusy.current = true; pause()
    try {
      if (fullscreen) await closeFullscreen()
      else {
        const target = shell.current, mode = await enterFullscreen(target, document)
        if (mounted.current) setFullscreen(mode)
        else await exitFullscreen(target, document).catch(() => {})
      }
    } finally { fullscreenBusy.current = false }
  }
  useEffect(() => {
    const target = shell.current
    const sync = () => { if ((document.fullscreenElement || document.webkitFullscreenElement) !== target) { pause(); setFullscreen(value => value === 'native' ? null : value) } }
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync)
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); exitFullscreen(target, document).catch(() => {}) }
  }, [pause])
  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; fullscreenButton.current?.focus({ preventScroll: true })
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); closeFullscreen() } }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [fullscreen, closeFullscreen])
  const finished = ['over', 'complete'].includes(view.status), time = Math.max(0, Math.ceil(BOTTLE_ROUND_SECONDS - view.elapsed))
  return <section className="bottle-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="bottle-heading"><div><p className="eyebrow">Veckans spel · precision & timing</p><h1>Bottle Flip <span>Poolside</span></h1><p>En flaska. En perfekt landning. En till?</p></div><span className="bottle-mode">{preview ? 'Testläge · inget sparas' : 'Din egen rekordjakt'}</span></header>
    <div className="bottle-layout"><div ref={shell} className={`bottle-shell${fullscreen ? ` bottle-fullscreen ${fullscreen}` : ''}`} tabIndex={0} onKeyDown={keyDown} onKeyUp={keyUp} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { clearInput(); refreshView() } }} aria-label="Bottle Flip. Håll mellanslag eller uppåtpil för kraft, släpp för att kasta. P pausar.">
      <div className="bottle-toolbar"><strong>SIMKOLL <span>POOL CLUB</span></strong><div><button type="button" onClick={pause} disabled={view.status !== 'playing'}>Ⅱ Paus</button><button type="button" ref={fullscreenButton} onClick={toggleFullscreen}>{fullscreen ? '↙ Stäng' : '⛶ Fullskärm'}</button></div></div>
      <div className="bottle-hud"><div><span>POÄNG</span><strong>{view.score}</strong></div><div><span>FÖRSÖK KVAR</span><strong aria-label={`${view.lives} av ${BOTTLE_ATTEMPTS} försök kvar`}>{view.lives}/{BOTTLE_ATTEMPTS}</strong></div><div><span>TID KVAR</span><strong>{Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}</strong></div></div>
      <div className="bottle-stage"><canvas ref={canvas} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={pointerCancel} onContextMenu={event => event.preventDefault()} aria-label="Flaska som kastas mellan numrerade startpallar sedda bakifrån vid poolen, med gröna och vita ryggsimsvimplar ovanför. De vita markeringarna visar mitten." />
        {view.status === 'playing' && view.feedback && <div className="bottle-feedback" role="status">{view.feedback}</div>}
        {view.status !== 'playing' && <div className="bottle-overlay"><div><p className="bottle-kicker">HÅLL · SLÄPP · LANDA</p><h2>{finished ? (view.status === 'complete' ? 'Snygg runda!' : 'Bra försök!') : view.status === 'paused' ? 'Ta en paus' : 'Hitta din perfekta flip'}</h2>{finished ? <><strong className="bottle-result">{view.score}<small> POÄNG</small></strong><p>{view.landings} landningar · längsta perfekta svit: {view.bestStreak}</p></> : <p>Håll inne för kraft. Släpp för att kasta.<br />Sikta på mitten och bygg en perfekt svit.</p>}
          {view.status === 'paused' ? <button type="button" className="bottle-primary" onClick={() => { resumeBottle(model.current); refreshView(); shell.current?.focus({ preventScroll: true }) }}>Fortsätt spela →</button> : <button type="button" className="bottle-primary" disabled={saving || Boolean(pending.current)} onClick={start}>{finished ? 'Spela igen' : 'Starta spelet'} →</button>}
          <small>{view.status === 'ready' ? '1 försök · högst 60 sekunder · en knapp' : message}</small>
          {finished && pending.current && !saving && <div className="bottle-save-actions"><button type="button" onClick={save}>Försök spara igen</button><button type="button" onClick={() => { pending.current = null; start() }}>Spela utan att spara</button></div>}
        </div></div>}
      </div>
      <div className="bottle-charge"><div><span>KRAFT</span><strong>{view.phase === 'charging' ? `${Math.round(view.charge * 100)} % · släpp för att kasta` : view.phase === 'flying' ? 'Flaskan är i luften…' : 'Längre håll = längre kast'}</strong></div><div className="bottle-power" role="progressbar" aria-label="Kastkraft" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.charge * 100)}><span ref={powerFill} /></div></div>
      <button type="button" className={`bottle-hold${view.phase === 'charging' ? ' held' : ''}`} data-bottle-hold="" aria-describedby="bottle-accessible-control" disabled={view.status !== 'playing' || view.phase === 'flying'} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={pointerCancel} onContextMenu={event => event.preventDefault()} onClick={event => { if (event.detail === 0) { if (input.current === 'assistive') release('assistive'); else begin('assistive') } }}><span>{view.phase === 'charging' ? 'SLÄPP FÖR ATT KASTA' : 'HÅLL FÖR KRAFT'}</span><small>eller håll mellanslag / ↑</small></button>
      <span id="bottle-accessible-control" className="bottle-sr-only">Med skärmläsare: aktivera knappen för att ladda, aktivera igen för att kasta.</span>
    </div><aside className="bottle-records"><p className="eyebrow">Bottle Flip · genom tiderna</p><h2>Snyggaste serien</h2><div className="bottle-own"><span>{preview ? 'DITT BÄSTA I TESTET' : 'DITT PERSONBÄSTA'}</span><strong>{board?.ownBest || '—'}<small> poäng</small></strong></div>{preview ? <p>Testläge: inga resultat, poäng eller topplistor hämtas eller sparas.</p> : boardError ? <><p role="status">{boardError}</p><button type="button" className="secondary-button" onClick={loadBoard}>Försök hämta igen</button></> : !board ? <p role="status">Hämtar topplistan…</p> : board.leaderboard?.length ? <ol>{board.leaderboard.map(item => <li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{item.score}</b></li>)}</ol> : <p>Bli först att sätta ett rekord!</p>}<div className="bottle-rules"><h3>Så får du poäng</h3><p>Landning: <b>10</b><br />Mitt i prick: <b>+5–20</b> i svit<br />Hoppa över en plattform: <b>+10</b></p><p>Den vita markeringen visar mitten. Högre och smalare plattformar kräver mer precision. Första missen avslutar rundan. Du har högst 60 sekunder.</p><p><kbd>P</kbd> pausar. Du kan också hålla och släppa direkt på spelbilden.</p></div></aside></div>
  </section>
}
