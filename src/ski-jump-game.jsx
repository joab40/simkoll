import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { enterBalanceFullscreen, exitBalanceFullscreen } from './balance-fullscreen.js'
import SkiJumpScene from './ski-jump-scene.jsx'
import { advanceSkiJump, createSkiJump, formatSkiJumpScore, SKI_BALANCE_ZONE, SKI_CROSSWINDS, SKI_K_POINT, SKI_LIP, SKI_WIND, skiAction, skiTiming } from './ski-jump-engine.js'
import './ski-jump-game.css'

const isRunning = phase => ['approach', 'air', 'runout'].includes(phase)
const snapshot = game => ({
  phase: game.phase, wind: game.wind, crosswind: game.phase === 'air' ? game.gust : game.crosswind,
  speed: Math.round(game.speed * 3.6),
  distance: Math.max(0, Math.round(game.distance - SKI_LIP)), landing: game.landing, result: game.result,
})
const windLabel = wind => `${wind < 0 ? '←' : wind > 0 ? '→' : '·'} ${Math.abs(wind).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}`
const pick = options => options[Math.floor(Math.random() * options.length)]
const steeringKeys = { ArrowLeft: -1, ArrowRight: 1, KeyA: -1, KeyD: 1 }
const distanceLabel = distance => distance.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function updateGauge(element, { position, zone }) {
  element.style.setProperty('--cursor', `${position * 100}%`)
  element.style.setProperty('--zone-start', `${zone[0] * 100}%`)
  element.style.setProperty('--zone-width', `${(zone[1] - zone[0]) * 100}%`)
  element.classList.toggle('in-zone', position >= zone[0] && position <= zone[1])
}

class GraphicsBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function SkiJumpGame({ code, onBack, preview = false, request }) {
  const model = useRef(createSkiJump(0, 2))
  const meter = useRef(null), balance = useRef(null), input = useRef(new Map())
  const shell = useRef(null), actionButton = useRef(null), fullscreenButton = useRef(null)
  const fullscreenBusy = useRef(false)
  const [fullscreen, setFullscreen] = useState(null)
  const mounted = useRef(false), saveLock = useRef(false), boardRevision = useRef(0)
  const [view, setView] = useState(() => snapshot(model.current))
  const [paused, setPaused] = useState(false)
  const [graphics, setGraphics] = useState({ ready: false, failed: false, key: 0 })
  const [effects, setEffects] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [leaderboard, setLeaderboard] = useState(null), [boardError, setBoardError] = useState(false)
  const [best, setBest] = useState(0)
  const [saveStatus, setSaveStatus] = useState('')

  const failGraphics = useCallback(() => {
    input.current.clear()
    setGraphics(current => ({ ...current, failed: true }))
    if (isRunning(model.current.phase)) setPaused(true)
  }, [])
  const loadBoard = useCallback(async signal => {
    if (preview) return
    const revision = ++boardRevision.current
    setBoardError(false)
    try {
      const data = await request('/api/points?game=skijump&lifetime=true', code, { signal, retry: false })
      if (!mounted.current || signal?.aborted || revision !== boardRevision.current) return
      setLeaderboard(data.leaderboard || [])
      setBest(current => Math.max(current, data.ownBest || 0))
    } catch {
      if (mounted.current && !signal?.aborted && revision === boardRevision.current) setBoardError(true)
    }
  }, [code, preview, request])
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    void loadBoard(controller.signal)
    return () => { mounted.current = false; controller.abort() }
  }, [loadBoard])

  const save = useCallback(async score => {
    if (preview || !score || saveLock.current) return
    saveLock.current = true
    boardRevision.current += 1
    setSaveStatus('saving')
    try {
      const data = await request('/api/points', code, {
        method: 'POST', retry: false, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit-game-score', gameKey: 'skijump', score }),
      })
      if (!mounted.current) return
      setLeaderboard(data.leaderboard || [])
      setBest(current => Math.max(current, data.ownBest || 0))
      setBoardError(false)
      setSaveStatus('saved')
    } catch {
      if (mounted.current) setSaveStatus('failed')
    } finally { saveLock.current = false }
  }, [code, preview, request])

  const publish = useCallback(() => {
    const game = model.current
    setView(snapshot(game))
    if (game.phase === 'finished' && game.result?.score > 0) {
      setBest(current => Math.max(current, game.result.score))
      void save(game.result.score)
    }
  }, [save])

  const pause = useCallback(() => {
    input.current.clear()
    if (isRunning(model.current.phase)) setPaused(true)
  }, [])

  const closeFullscreen = useCallback(async () => {
    pause()
    await exitBalanceFullscreen(shell.current, document).catch(() => {})
    if (mounted.current) {
      setFullscreen(null)
      fullscreenButton.current?.focus({ preventScroll: true })
    }
  }, [pause])

  const toggleFullscreen = async () => {
    if (fullscreenBusy.current) return
    fullscreenBusy.current = true
    const target = shell.current
    pause()
    try {
      if (fullscreen) await closeFullscreen()
      else {
        const mode = await enterBalanceFullscreen(target, document)
        if (mounted.current) {
          setFullscreen(mode)
          target.focus({ preventScroll: true })
        } else await exitBalanceFullscreen(target, document).catch(() => {})
      }
    } finally { fullscreenBusy.current = false }
  }

  useEffect(() => {
    const target = shell.current
    const sync = () => {
      if ((document.fullscreenElement || document.webkitFullscreenElement) === target) return
      pause()
      setFullscreen(current => current === 'native' ? null : current)
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      void exitBalanceFullscreen(target, document).catch(() => {})
    }
  }, [pause])

  useEffect(() => {
    if (!fullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void closeFullscreen()
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', escape)
    }
  }, [fullscreen, closeFullscreen])
  useEffect(() => {
    const hide = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [pause])

  const running = isRunning(view.phase) && !paused && !graphics.failed
  useEffect(() => {
    if (!running) return
    let frame, previous = performance.now(), lastHud = 0
    const tick = now => {
      const delta = (now - previous) / 1000
      previous = now
      if (delta > .55) { pause(); return }
      const game = model.current
      const phase = game.phase
      let left = false, right = false
      for (const steer of input.current.values()) {
        if (steer < 0) left = true
        else right = true
      }
      advanceSkiJump(game, Math.min(delta, .075), Number(right) - Number(left))
      if (game.phase !== 'air' && phase === 'air') input.current.clear()
      if (balance.current) {
        balance.current.style.setProperty('--cursor', `${50 + game.bank * 50}%`)
        balance.current.classList.toggle('in-zone', Math.abs(game.bank) <= SKI_BALANCE_ZONE)
      }
      const timing = skiTiming(game)
      if (meter.current && timing) {
        updateGauge(meter.current, timing)
      }
      if (now - lastHud >= 90 || phase !== game.phase) {
        if (game.phase === 'finished') publish()
        else setView(snapshot(game))
        lastHud = now
      }
      if (isRunning(game.phase)) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pause, publish, running])

  const act = () => {
    if (!graphics.ready || graphics.failed || saveLock.current) return
    if (paused) {
      setPaused(false)
      actionButton.current?.focus({ preventScroll: true })
      return
    }
    const phase = model.current.phase
    if (phase === 'runout' || (phase === 'air' && model.current.landing)) return
    if (phase === 'finished') {
      model.current = createSkiJump(pick(SKI_WIND), pick(SKI_CROSSWINDS))
      setSaveStatus('')
    }
    if (model.current.phase === 'ready') {
      input.current.clear()
      if (!fullscreen && window.matchMedia('(max-width: 640px)').matches) {
        shell.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
      actionButton.current?.focus({ preventScroll: true })
    }
    skiAction(model.current)
    publish()
  }

  const onKeyDown = event => {
    if (event.key === 'Tab' && fullscreen) {
      const buttons = [...shell.current.querySelectorAll('button:not(:disabled):not([aria-disabled="true"])')]
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && (event.target === first || event.target === shell.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault()
        first?.focus()
      }
      return
    }
    if (event.code === 'KeyP' && !event.repeat && isRunning(model.current.phase)) {
      event.preventDefault()
      if (paused) act()
      else pause()
      return
    }
    const steer = Object.hasOwn(steeringKeys, event.code) && steeringKeys[event.code]
    if (steer && running && model.current.phase === 'air') {
      event.preventDefault()
      if (!event.repeat) input.current.set(event.code, steer)
      return
    }
    if (event.code !== 'Space' || (event.target !== actionButton.current && event.target !== shell.current)) return
    event.preventDefault()
    if (!event.repeat) act()
  }

  const releasePointer = event => { input.current.delete(`pointer-${event.pointerId}`) }
  const result = view.phase === 'finished' ? view.result : null
  const ready = view.phase === 'ready'
  const timing = skiTiming(model.current)
  const steering = running && view.phase === 'air'
  const actionLocked = !running || !graphics.ready || view.phase === 'runout' || Boolean(view.landing)
  const overlayActionLocked = !graphics.ready || saveStatus === 'saving'
  const showOverlay = graphics.failed || paused || result || ready

  const steerButton = (direction, label) => <button type="button" className="ski-steer" disabled={!steering}
    aria-label={label} onPointerDown={event => {
      if (event.button !== 0 || !steering) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      input.current.set(`pointer-${event.pointerId}`, direction)
    }} onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}>
    <span aria-hidden="true">{direction < 0 ? '←' : '→'}</span>
  </button>

  return <section className="ski-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="ski-heading">
      <h1>Frostfjäll <em>Backhoppning</em></h1>
      {preview && <span>Testläge</span>}
    </header>
    <div className="ski-layout">
      <div ref={shell} className={`ski-console${fullscreen ? ` ski-fullscreen ${fullscreen}` : ''}`}
        tabIndex={0} onKeyDown={onKeyDown} onKeyUp={event => input.current.delete(event.code)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) input.current.clear() }}
        aria-label="Backhoppning. Vänster och höger balanserar. Mellanslag hoppar och landar. P pausar.">
        <div className="ski-toolbar">
          <strong>SIMKOLL <span>FROSTFJÄLL</span></strong>
          <div>
            <button type="button" aria-pressed={effects} onClick={() => setEffects(value => !value)}>❄ Effekter</button>
            <button type="button" disabled={!running} onClick={pause}>Ⅱ Paus</button>
            <button ref={fullscreenButton} type="button" aria-pressed={Boolean(fullscreen)} onClick={toggleFullscreen}>
              {fullscreen ? '↙ Stäng' : '⛶ Fullskärm'}
            </button>
          </div>
        </div>
        <div className="ski-stage">
          <GraphicsBoundary key={graphics.key} onError={failGraphics}>
            <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} frameloop={running ? 'always' : 'demand'}
              camera={{ near: .08, far: 530, fov: 56, position: [1.1, 48, 9.2] }}
              aria-label="3D-hoppbacke med snö, fjäll och granar"
              onCreated={() => setGraphics(current => ({ ...current, ready: true }))}
              fallback={<p className="ski-no-3d">Din webbläsare behöver WebGL för att visa backen.</p>}>
              <SkiJumpScene model={model} effects={effects} onGraphicsError={failGraphics} />
            </Canvas>
          </GraphicsBoundary>
          <div className="ski-stage-hud" aria-hidden="true">
            <div><small>Distans</small><strong>{view.distance} <em>m</em></strong></div>
            <div>
              <small>Sidvind</small><strong>{windLabel(view.crosswind)} <em>m/s</em></strong>
              {view.wind !== 0 && <span className="ski-wind-secondary">
                {view.wind > 0 ? 'Medvind' : 'Motvind'} {Math.abs(view.wind)} m/s
              </span>}
            </div>
            <div><small>Fart</small><strong>{view.speed} <em>km/h</em></strong></div>
          </div>

          {showOverlay && <div className="ski-overlay">
            <div className="ski-stage-card">
              {graphics.failed ? <>
                <h2>Prova 3D-vyn igen</h2>
                <button type="button" className="ski-primary" onClick={() => setGraphics(current => ({ ready: false, failed: false, key: current.key + 1 }))}>Ladda om backen</button>
              </> : paused ? <>
                <h2>Hoppet är pausat</h2>
                <button type="button" className="ski-primary" disabled={overlayActionLocked} onClick={act}>Fortsätt</button>
              </> : result ? <>
                <p className="ski-kicker">{result.distance >= SKI_K_POINT && result.score ? 'Förbi K-linjen' : 'Ditt hopp'}</p>
                <h2 className="ski-finish">{distanceLabel(result.distance)} <small>m</small></h2>
                {result.score > 0 && <strong className="ski-finish-points">{formatSkiJumpScore(result.score)} p <span>· Stil {result.style}/100</span></strong>}
                <p role="status">{result.reason}</p>
                <button type="button" className="ski-primary" disabled={overlayActionLocked} onClick={act}>Hoppa igen</button>
                {saveStatus && <small className="ski-save-status" role="status">{{
                  saving: 'Sparar hoppet…', failed: 'Hoppet kunde inte sparas.', saved: 'Hoppet är sparat ✓',
                }[saveStatus]}</small>}
                {saveStatus === 'failed' && <button type="button" className="ski-retry" onClick={() => save(result.score)}>Försök spara igen</button>}
              </> : <>
                <p className="ski-kicker">Frostfjäll · K{SKI_K_POINT}</p>
                <h2>Sikta mot <em>K-linjen.</em></h2>
                <p>Tajma upphoppet, balansera i sidvinden och sätt landningen.</p>
                <button type="button" className="ski-primary" disabled={overlayActionLocked} onClick={act}>
                  {graphics.ready ? 'Starta hoppet ↗' : 'Laddar backen…'}
                </button>
              </>}
            </div>
          </div>}

          {!showOverlay && (timing || steering) && <div className="ski-gauges">
            {steering && <div className="ski-gauge">
              <strong>Balans</strong>
              <div className="ski-gauge-track ski-balance-track" ref={balance} aria-hidden="true" style={{
                '--zone-start': `${50 - SKI_BALANCE_ZONE * 50}%`, '--zone-width': `${SKI_BALANCE_ZONE * 100}%`,
              }}><span /></div>
            </div>}
            {timing && <div className="ski-gauge">
              <strong>{view.phase === 'approach' ? 'Upphopp' : 'Landning'}</strong>
              <div className="ski-gauge-track ski-timing-track" ref={meter} aria-hidden="true"
                style={{ '--zone-start': `${timing.zone[0] * 100}%`, '--zone-width': `${(timing.zone[1] - timing.zone[0]) * 100}%` }}>
                <span />
              </div>
            </div>}
          </div>}
        </div>
        <div className="ski-controls" role="group" aria-label="Spelkontroller" onContextMenu={event => event.preventDefault()}>
          {steerButton(-1, 'Balansera åt vänster')}
          <button ref={actionButton} type="button" className="ski-action" aria-disabled={actionLocked} tabIndex={actionLocked ? -1 : 0} onClick={() => { if (!actionLocked) act() }}>
            <span aria-hidden="true">{view.phase === 'air' ? '↓' : '↑'}</span>
            {view.phase === 'air' ? 'Landa' : 'Hoppa'}
          </button>
          {steerButton(1, 'Balansera åt höger')}
        </div>
      </div>
      <aside className="ski-side">
        <h2>Din rekordjakt</h2>
        <div className="ski-personal">
          <span>{preview ? 'Bäst i testomgången' : 'Ditt personbästa'}</span>
          <strong>{best ? formatSkiJumpScore(best) : '–'} <small>p</small></strong>
        </div>
        <ol className="ski-instructions">
          <li><strong>Hoppa</strong> när markören går in i det gröna fältet vid kanten.</li>
          <li><strong>Balansera</strong> med korta vänster- och högertryck. Håll markören i mitten.</li>
          <li><strong>Landa</strong> i nästa gröna fält. Bra balans ger mer plats och högre stilpoäng.</li>
        </ol>
        <p className="ski-keys"><kbd>←</kbd> <kbd>→</kbd> balansera · <kbd>Mellanslag</kbd> hoppa och landa</p>
        {!preview && <div className="ski-ranking">
          <h2>Genom tiderna</h2>
          {boardError ? <><p>Topplistan kunde inte hämtas.</p><button type="button" className="text-button" onClick={() => loadBoard()}>Försök igen</button></>
            : leaderboard === null ? <p>Hämtar rekord…</p>
              : leaderboard.length ? <ol>{leaderboard.map(entry => <li key={entry.profileId}>
                <span>{entry.rank}</span><span>{entry.emoji} {entry.displayName}</span><strong>{formatSkiJumpScore(entry.score)}</strong>
              </li>)}</ol>
                : <p>Inga rekord ännu.</p>}
        </div>}
      </aside>
    </div>
  </section>
}
