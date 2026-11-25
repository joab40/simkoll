import React, { useCallback, useEffect, useRef, useState } from 'react'
import { enterBalanceFullscreen, exitBalanceFullscreen } from './balance-fullscreen.js'
import { guardGameTouches } from './balance-touch.js'
import { BOB_DIVE_END, BOB_DIVE_START, BOB_LENGTH, BOB_SCORE_BASE, BOB_START_LIMIT, advanceBob, bobAction, bobTime, createBobRace, validBobScore } from './bobsled-engine.js'
import { createBobScene } from './bobsled-scene.js'
import './ski-jump-game.css'
import './winter-controls.css'
import './bobsled-game.css'

const playing = phase => phase === 'push' || phase === 'racing'
const steerKeys = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
const launchKeys = ['ArrowUp', 'Space']

export default function BobsledGame({ code, onBack, request, preview = false }) {
  const model = useRef(createBobRace())
  const canvas = useRef(null), shell = useRef(null), controls = useRef(null)
  const inputs = useRef(new Map()), fullscreenBusy = useRef(false)
  const [view, setView] = useState(() => ({ ...model.current }))
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(null)
  const [effects, setEffects] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [board, setBoard] = useState(null), [best, setBest] = useState(0)
  const [saveStatus, setSaveStatus] = useState('')
  const [pendingTime, setPendingTime] = useState(null)
  const pause = useCallback(() => {
    inputs.current.clear()
    if (playing(model.current.phase)) setPaused(true)
  }, [])
  const refreshView = () => setView({ ...model.current })
  const act = useCallback(() => {
    if (paused) return
    bobAction(model.current)
    setView({ ...model.current })
  }, [paused])

  useEffect(() => guardGameTouches([controls.current]), [])
  useEffect(() => {
    const node = canvas.current
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.round(node.clientWidth * scale)), height = Math.max(1, Math.round(node.clientHeight * scale))
      if (node.width !== width) node.width = width
      if (node.height !== height) node.height = height
    }
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    resize()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const draw = createBobScene(canvas.current)
    let frame, previous = 0, published = 0
    let phase = model.current.phase
    let width = 0, height = 0, drawn = false
    function run(now) {
      const race = model.current
      const active = playing(race.phase) && !paused && !document.hidden
      if (active && previous) {
        const steer = Math.max(-1, Math.min(1, [...inputs.current.values()].reduce((sum, value) => sum + value, 0)))
        advanceBob(race, (now - previous) / 1000, steer)
        if (race.phase === 'finished') {
          inputs.current.clear()
          setPendingTime(race.result)
          setBest(previousBest => Math.max(previousBest, BOB_SCORE_BASE - race.result))
        }
        if (now - published >= 65 || race.phase !== phase) {
          published = now
          setView({ ...race })
        }
      }
      if (active || !drawn || phase !== race.phase || width !== canvas.current.width || height !== canvas.current.height) {
        width = canvas.current.width
        height = canvas.current.height
        draw(race, effects)
        drawn = true
      }
      previous = now
      phase = race.phase
      frame = requestAnimationFrame(run)
    }
    frame = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frame)
  }, [effects, paused])

  useEffect(() => {
    const keydown = event => {
      if (event.code === 'Escape') {
        if (fullscreen === 'immersive') setFullscreen(null)
        pause()
        return
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.target.closest?.('input, textarea, select')) return
      if (launchKeys.includes(event.code) && event.target.closest?.('button')) return
      const race = model.current
      if (!playing(race.phase) || paused) return
      if (steerKeys[event.code] || launchKeys.includes(event.code)) event.preventDefault()
      if (race.phase === 'racing' && steerKeys[event.code]) inputs.current.set(event.code, steerKeys[event.code])
      if (race.phase === 'push' && launchKeys.includes(event.code) && !event.repeat) act()
    }
    const keyup = event => inputs.current.delete(event.code)
    const hide = () => { if (document.hidden) pause() }
    const fullChange = () => {
      if (fullscreen === 'native' && (document.fullscreenElement || document.webkitFullscreenElement) !== shell.current) setFullscreen(null)
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', hide)
    document.addEventListener('fullscreenchange', fullChange)
    document.addEventListener('webkitfullscreenchange', fullChange)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', hide)
      document.removeEventListener('fullscreenchange', fullChange)
      document.removeEventListener('webkitfullscreenchange', fullChange)
    }
  }, [act, fullscreen, pause, paused])
  useEffect(() => {
    if (fullscreen !== 'immersive') return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [fullscreen])
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    request('/api/points?game=bobsled&lifetime=true', code, { retry: false, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) {
        setBoard(current => current ?? data.leaderboard ?? [])
        setBest(current => Math.max(current, data.ownBest || 0))
      }
    }).catch(() => { if (!controller.signal.aborted) setBoard(current => current ?? 'unavailable') })
    return () => controller.abort()
  }, [code, preview, request])
  const saveRace = useCallback(async time => {
    if (preview || !validBobScore(BOB_SCORE_BASE - time)) return
    setSaveStatus('saving')
    try {
      const data = await request('/api/points', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, retry: false,
        body: JSON.stringify({ action: 'submit-game-score', gameKey: 'bobsled', score: BOB_SCORE_BASE - time }),
      })
      setBoard(data.leaderboard || [])
      setBest(current => Math.max(current, data.ownBest || 0))
      setSaveStatus('saved')
    } catch { setSaveStatus('failed') }
  }, [code, preview, request])
  useEffect(() => { if (pendingTime) void saveRace(pendingTime) }, [pendingTime, saveRace])
  const toggleFullscreen = async () => {
    if (fullscreenBusy.current) return
    fullscreenBusy.current = true
    try {
      if (fullscreen) { await exitBalanceFullscreen(shell.current, document); setFullscreen(null) }
      else setFullscreen(await enterBalanceFullscreen(shell.current, document))
    } finally { fullscreenBusy.current = false }
  }
  const start = () => {
    if (saveStatus === 'saving') return
    setSaveStatus('')
    setPendingTime(null)
    inputs.current.clear()
    act()
    shell.current.focus({ preventScroll: true })
  }
  const resume = () => {
    setPaused(false)
    refreshView()
    shell.current.focus({ preventScroll: true })
  }
  const captureSteer = (direction) => ({
    onPointerDown: event => {
      if (model.current.phase !== 'racing' || paused || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      inputs.current.set(event.pointerId, direction)
      shell.current.focus({ preventScroll: true })
    },
    onPointerUp: event => inputs.current.delete(event.pointerId),
    onPointerCancel: event => inputs.current.delete(event.pointerId),
    onLostPointerCapture: event => inputs.current.delete(event.pointerId),
  })
  const pushing = view.phase === 'push', racing = view.phase === 'racing', finished = view.phase === 'finished'
  const dive = pushing && view.pushTime >= BOB_DIVE_START
  const sweet = dive && view.pushTime <= BOB_DIVE_END
  const bumped = racing && view.elapsed - view.lastHit < .75
  return <section className="ski-page bobsled-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="ski-heading"><h1>Frostfjäll <em>Bobsläde</em></h1></header>
    <div className="ski-layout">
      <div ref={shell} tabIndex={-1} className={`ski-console bobsled-console${fullscreen ? ' ski-fullscreen' : ''}${fullscreen === 'immersive' ? ' immersive' : ''}`}>
        <div className="ski-toolbar"><strong>SIMKOLL <span>FROSTFJÄLL</span></strong><div>
          <button type="button" aria-pressed={effects} onClick={() => setEffects(on => !on)}>❄ Effekter</button>
          <button type="button" disabled={!playing(view.phase)} onClick={paused ? resume : pause}>{paused ? 'Fortsätt' : 'Paus'}</button>
          <button type="button" onClick={toggleFullscreen}>{fullscreen ? 'Stäng fullskärm' : '⛶ Fullskärm'}</button>
        </div></div>
        <div className="ski-stage bobsled-stage">
          <canvas ref={canvas} aria-hidden="true" />
          <div className="bob-hud">
            <div><small>Tid</small><strong>{bobTime(view.result ?? Math.round((view.pushTime + view.elapsed) * 1000))}</strong></div>
            <div><small>Fart</small><strong>{Math.round((pushing ? view.pushes * 0.9 : view.speed) * 3.6)} <em>km/h</em></strong></div>
            <div><small>Bana</small><strong>{Math.floor(view.distance)} <em>/ {BOB_LENGTH} m</em></strong></div>
            <progress aria-label="Avklarad sträcka" value={view.distance} max={BOB_LENGTH} />
          </div>
          {pushing && !paused && <div className={`bob-start${sweet ? ' sweet' : ''}`}>
            <strong>{dive ? 'Hoppa i!' : 'Spring!'}</strong>
            <div className="bob-timing" aria-hidden="true" style={{
              '--bob-progress': `${view.pushTime / BOB_START_LIMIT * 100}%`,
              '--bob-zone-start': `${BOB_DIVE_START / BOB_START_LIMIT * 100}%`,
              '--bob-zone-width': `${(BOB_DIVE_END - BOB_DIVE_START) / BOB_START_LIMIT * 100}%`,
            }}><i /></div>
            <span>{dive ? 'Tryck en gång till' : `${view.pushes} av 12 frånskjut`}</span>
          </div>}
          {racing && !paused && (bumped || view.elapsed < 1.25) && <div className={`bob-cue${bumped ? ' bump' : ''}`}>{bumped ? 'Väggträff · fart tappad' : view.launch}</div>}
          {(view.phase === 'ready' || paused || finished) && <div className="ski-overlay">
            <div className="ski-stage-card bob-card">
              {paused ? <><h2>Pausat</h2><button className="ski-primary" onClick={resume}>Fortsätt åket →</button></> : finished ? <>
                <p className="ski-kicker">Målgång</p><h2 className="ski-finish">{bobTime(view.result)}</h2>
                <p>{view.hits ? `${view.hits} väggträffar` : 'Felfritt åk'} · Toppfart {Math.round(view.maxSpeed * 3.6)} km/h</p>
                <button className="ski-primary" onClick={start} disabled={saveStatus === 'saving'}>Kör igen ↗</button>
                {saveStatus === 'failed' && <button type="button" className="ski-retry" onClick={() => saveRace(view.result)}>Spara tiden igen</button>}
              </> : <><h2>Full fart<em> i isrännan.</em></h2>
                <p>Tryck snabbt för att springa. Hoppa i när markören når det gröna fältet och följ kurvornas gröna spår.</p>
                <button className="ski-primary" onClick={start}>Starta åket ↗</button></>}
            </div>
          </div>}
        </div>
        <div className="winter-controls bob-controls" ref={controls}>
          <button type="button" className="winter-control left" aria-label="Styr vänster" disabled={!racing || paused} {...captureSteer(-1)}><span className="winter-control-arrow" aria-hidden="true" /></button>
          <button type="button" className="winter-control jump" aria-label={dive ? 'Hoppa i bobsläden' : 'Spring och skjut på'}
            disabled={!pushing || paused} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); act() }}
            onClick={event => { if (event.detail === 0) act() }}><span className="winter-control-arrow" aria-hidden="true" /></button>
          <button type="button" className="winter-control right" aria-label="Styr höger" disabled={!racing || paused} {...captureSteer(1)}><span className="winter-control-arrow" aria-hidden="true" /></button>
        </div>
      </div>
      <aside className="ski-side">
        <div className="ski-personal"><span>{preview ? 'Bäst i testläget' : 'Ditt personbästa'}</span><strong>{best ? bobTime(BOB_SCORE_BASE - best) : '—'}</strong></div>
        <ol className="ski-instructions"><li>Bygg fart med snabba tryck på ↑.</li><li>Tryck igen när markören når grönt för att kasta dig i släden.</li><li>Styr mjukt mot den gröna linjen i kurvorna. Släpp på rakorna för att behålla farten.</li></ol>
        <p className="ski-keys">Tangentbord <kbd>↑</kbd> eller <kbd>mellanslag</kbd> för starten · <kbd>←</kbd> <kbd>→</kbd> styr</p>
        {!preview && <div className="ski-ranking"><h2>Snabbast genom tiderna</h2>
          {Array.isArray(board) && board.length ? <ol>{board.map(row => <li key={row.profileId}><span>{row.rank}</span><span>{row.emoji} {row.displayName}</span><strong>{bobTime(BOB_SCORE_BASE - row.score)}</strong></li>)}</ol>
            : <p>{board === null ? 'Hämtar tider…' : board === 'unavailable' ? 'Topplistan kunde inte hämtas.' : 'Inga tider ännu.'}</p>}
        </div>}
      </aside>
    </div>
  </section>
}
