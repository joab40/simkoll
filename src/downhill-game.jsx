import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { enterBalanceFullscreen, exitBalanceFullscreen } from './balance-fullscreen.js'
import { advanceDownhill, createDownhillRace, downhillStartAction, downhillTime, DOWNHILL_GATES, DOWNHILL_GREEN_AT, DOWNHILL_LENGTH, DOWNHILL_SCORE_BASE, DOWNHILL_SECTORS, validDownhillScore } from './downhill-engine.js'
import DownhillScene from './downhill-scene.jsx'
import './ski-jump-game.css'
import './downhill-game.css'

const inRace = phase => phase === 'countdown' || phase === 'racing'
const controls = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }

function snapshot(race) {
  return {
    phase: race.phase, countdown: race.countdown, early: race.early, track: race.track,
    speed: Math.round(race.speed * 3.6), tucked: race.tuck >= .5, cleared: race.cleared, gateIndex: race.gateIndex,
    elapsed: race.elapsed, penalty: race.penalty, launch: race.launch, result: race.result,
    feedback: race.feedback && race.elapsed - race.feedback.at < 1.25 ? race.feedback : null,
  }
}

class DownhillGraphicsBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function DownhillGame({ code, onBack, preview = false, request }) {
  const model = useRef(createDownhillRace())
  const input = useRef(new Map()), shell = useRef(null), goButton = useRef(null), fullButton = useRef(null)
  const fullBusy = useRef(false), mounted = useRef(false), boardRevision = useRef(0), saving = useRef(false)
  const [view, setView] = useState(() => snapshot(model.current))
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(null)
  const [graphics, setGraphics] = useState({ ready: false, error: false, key: 0 })
  const [effects, setEffects] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [board, setBoard] = useState(null), [boardError, setBoardError] = useState(false)
  const [best, setBest] = useState(0), [saveStatus, setSaveStatus] = useState('')

  const pause = useCallback(() => {
    input.current.clear()
    if (inRace(model.current.phase)) setPaused(true)
  }, [])
  const graphicsLost = useCallback(() => {
    pause()
    setGraphics(current => ({ ...current, error: true }))
  }, [pause])

  const loadBoard = useCallback(async signal => {
    if (preview) return
    const revision = ++boardRevision.current
    setBoardError(false)
    try {
      const data = await request('/api/points?game=downhill&lifetime=true', code, { retry: false, signal })
      if (mounted.current && !signal?.aborted && revision === boardRevision.current) {
        setBoard(data.leaderboard || [])
        setBest(value => Math.max(value, data.ownBest || 0))
      }
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

  const save = useCallback(async result => {
    const score = DOWNHILL_SCORE_BASE - result.timeMs
    if (!validDownhillScore(score) || saving.current) return
    setBest(value => Math.max(value, score))
    if (preview) return
    saving.current = true
    boardRevision.current++
    setSaveStatus('saving')
    try {
      const data = await request('/api/points', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, retry: false,
        body: JSON.stringify({ action: 'submit-game-score', gameKey: 'downhill', score }),
      })
      if (mounted.current) {
        setBoard(data.leaderboard || [])
        setBest(value => Math.max(value, data.ownBest || 0))
        setBoardError(false)
        setSaveStatus('saved')
      }
    } catch {
      if (mounted.current) setSaveStatus('failed')
    } finally { saving.current = false }
  }, [code, preview, request])

  const running = inRace(view.phase) && !paused && !graphics.error
  useEffect(() => {
    if (!running) return
    let frame, previous = performance.now(), lastHud = 0
    const tick = now => {
      const delta = (now - previous) / 1000
      previous = now
      if (delta > .55) { pause(); return }
      let left = false, right = false, tuck = false
      for (const direction of input.current.values()) {
        if (direction === 'tuck') tuck = true
        else if (direction < 0) left = true
        else right = true
      }
      const race = model.current
      const phase = race.phase
      advanceDownhill(race, delta, Number(right) - Number(left), tuck)
      if (now - lastHud > 65 || phase !== race.phase) {
        setView(snapshot(race))
        lastHud = now
      }
      if (race.phase === 'finished') {
        input.current.clear()
        void save(race.result)
      } else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pause, running, save])

  useEffect(() => {
    const hide = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [pause])

  const closeFull = useCallback(async () => {
    pause()
    await exitBalanceFullscreen(shell.current, document).catch(() => {})
    if (mounted.current) { setFullscreen(null); fullButton.current?.focus({ preventScroll: true }) }
  }, [pause])

  const toggleFull = async () => {
    if (fullBusy.current) return
    fullBusy.current = true
    const target = shell.current
    pause()
    try {
      if (fullscreen) await closeFull()
      else {
        const mode = await enterBalanceFullscreen(target, document)
        if (mounted.current) { setFullscreen(mode); target.focus({ preventScroll: true }) }
        else await exitBalanceFullscreen(target, document).catch(() => {})
      }
    } finally { fullBusy.current = false }
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
    const old = document.body.style.overflow
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); void closeFull() }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', escape) }
  }, [fullscreen, closeFull])

  const act = () => {
    if (!graphics.ready || graphics.error || saving.current) return
    if (paused) {
      setPaused(false)
      goButton.current?.focus({ preventScroll: true })
      return
    }
    if (model.current.phase === 'finished') {
      model.current = createDownhillRace()
      setSaveStatus('')
    }
    if (model.current.phase === 'ready') {
      input.current.clear()
      if (!fullscreen && window.matchMedia('(max-width: 820px)').matches) shell.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      goButton.current?.focus({ preventScroll: true })
    }
    downhillStartAction(model.current)
    setView(snapshot(model.current))
  }

  const onKeyDown = event => {
    if (event.key === 'Tab' && fullscreen) {
      const buttons = [...shell.current.querySelectorAll('button:not(:disabled):not([aria-disabled="true"])')]
      if (event.shiftKey && [buttons[0], shell.current].includes(event.target)) {
        event.preventDefault()
        buttons.at(-1)?.focus()
      } else if (!event.shiftKey && event.target === buttons.at(-1)) {
        event.preventDefault()
        buttons[0]?.focus()
      }
      return
    }
    if (event.code === 'KeyP' && !event.repeat && inRace(model.current.phase)) {
      event.preventDefault()
      if (paused) act()
      else pause()
      return
    }
    const direction = Object.hasOwn(controls, event.code) && controls[event.code]
    if (direction && running) {
      event.preventDefault()
      if (!event.repeat) input.current.set(event.code, direction)
      return
    }
    if (event.code === 'ArrowUp' && running) {
      event.preventDefault()
      if (!event.repeat) {
        input.current.set(event.code, 'tuck')
        if (model.current.phase === 'countdown') act()
      }
      return
    }
    if (event.code === 'Space' && running && model.current.phase === 'racing') return
    if (!['Space', 'ArrowUp'].includes(event.code) || ![goButton.current, shell.current].includes(event.target)) return
    event.preventDefault()
    if (!event.repeat) act()
  }

  const release = event => input.current.delete(`touch-${event.pointerId}`)
  const steer = direction => <button type="button" className="downhill-steer"
    aria-label={direction < 0 ? 'Sväng vänster' : 'Sväng höger'} disabled={!running || view.phase !== 'racing'}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      input.current.set(`touch-${event.pointerId}`, direction)
    }} onPointerCancel={release} onLostPointerCapture={release} onPointerUp={release}>
    <span aria-hidden="true">{direction < 0 ? '←' : '→'}</span>
  </button>

  const result = view.result
  const countdown = view.phase === 'countdown'
  const green = countdown && view.countdown >= DOWNHILL_GREEN_AT
  const nextGate = DOWNHILL_GATES[view.gateIndex]
  const sector = DOWNHILL_SECTORS.findLastIndex(item => view.track >= item.start)
  const feedback = view.feedback ?? (view.elapsed < 1.5 && {
    perfect: { text: 'Perfekt start', tone: 'boost' },
    early: { text: 'Tjuvstart · +0,80 s', tone: 'miss' },
  }[view.launch])
  const startLocked = !graphics.ready || graphics.error || saveStatus === 'saving'

  return <section className="ski-page downhill-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="ski-heading"><h1>Frostfjäll <em>Störtlopp</em></h1>{preview && <span>Testläge</span>}</header>
    <div className="ski-layout">
      <div ref={shell} tabIndex={0} className={`ski-console${fullscreen ? ` ski-fullscreen ${fullscreen}` : ''}`}
        onKeyDown={onKeyDown} onKeyUp={event => input.current.delete(event.code)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) input.current.clear() }}
        aria-label="Störtlopp. Vänster och höger styr. Pil upp startar och hålls inne för att huka. P pausar.">
        <div className="ski-toolbar"><strong>SIMKOLL <span>FROSTFJÄLL</span></strong><div>
          <button type="button" aria-pressed={effects} onClick={() => setEffects(current => !current)}>❄ Effekter</button>
          <button type="button" onClick={pause} disabled={!running}>Ⅱ Paus</button>
          <button type="button" ref={fullButton} aria-pressed={Boolean(fullscreen)} onClick={toggleFull}>{fullscreen ? '↙ Stäng' : '⛶ Fullskärm'}</button>
        </div></div>
        <div className="ski-stage downhill-stage">
          <DownhillGraphicsBoundary key={graphics.key} onError={graphicsLost}>
            <Canvas dpr={[1, 1.45]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
              frameloop={running ? 'always' : 'demand'} camera={{ fov: 60, near: .12, far: 365, position: [0, 4, 10] }}
              aria-label="Frostfjälls störtloppsbana i 3D med portar, granar, berg och lift"
              onCreated={() => setGraphics(current => ({ ...current, ready: true }))}
              fallback={<p className="ski-no-3d">Din webbläsare behöver WebGL för att visa backen.</p>}>
              <DownhillScene model={model} effects={effects} onGraphicsError={graphicsLost} />
            </Canvas>
          </DownhillGraphicsBoundary>

          <div className="ski-stage-hud downhill-hud" aria-hidden="true">
            <div><small>Tid</small><strong>{downhillTime((view.elapsed + view.penalty) * 1000)}</strong></div>
            <div><small>Portar</small><strong>{view.cleared} <em>/ {DOWNHILL_GATES.length}</em></strong></div>
            <div><small>Fart</small><strong>{view.speed} <em>km/h</em></strong></div>
          </div>

          {countdown && !paused && <div className={`downhill-countdown${green ? ' is-green' : ''}`}>
            <strong>{green ? 'KÖR!' : Math.ceil(DOWNHILL_GREEN_AT - view.countdown)}</strong>
            <span>{view.early ? 'Tjuvstart · +0,80 s' : green ? 'Tryck nu' : 'Vänta på grönt'}</span>
          </div>}
          {view.phase === 'racing' && !paused && <>
            {feedback && <div className={`downhill-feedback is-${feedback.tone}`}>{feedback.text}</div>}
            {nextGate && <div className="downhill-next" aria-hidden="true"
              style={{ '--gate-color': nextGate.color }}>
              {nextGate.x < 0 ? '←' : '→'} Port {nextGate.id}
            </div>}
            <div className="downhill-progress" aria-hidden="true">
              <div><i style={{ width: `${view.track / DOWNHILL_LENGTH * 100}%` }} /></div>
              <span>{DOWNHILL_SECTORS[sector].name}</span><span>{Math.ceil(DOWNHILL_LENGTH - view.track)} m kvar</span>
            </div>
          </>}

          {(graphics.error || paused || result || view.phase === 'ready') && <div className="ski-overlay">
            <div className="ski-stage-card">
              {graphics.error ? <>
                <h2>3D-vyn pausades</h2>
                <button type="button" className="ski-primary" onClick={() => setGraphics(current => ({ ready: false, error: false, key: current.key + 1 }))}>Ladda om backen</button>
              </> : paused ? <>
                <h2>Loppet är pausat</h2>
                <button type="button" className="ski-primary" disabled={startLocked} onClick={act}>Fortsätt</button>
              </> : result ? <>
                <p className="ski-kicker">Målgång</p>
                <h2 className="ski-finish">{downhillTime(result.timeMs, 3)}</h2>
                <p>{downhillTime(result.raceMs, 3)} åktid · {result.gates}/{DOWNHILL_GATES.length} portar
                  {result.penaltyMs > 0 && ` · +${(result.penaltyMs / 1000).toLocaleString('sv-SE')} s tillägg`}
                </p>
                <button type="button" className="ski-primary" disabled={startLocked} onClick={act}>Åk igen</button>
                {saveStatus && <small className="ski-save-status" role="status">{{
                  saving: 'Sparar loppet…', failed: 'Tiden kunde inte sparas.', saved: 'Tiden är sparad ✓',
                }[saveStatus]}</small>}
                {saveStatus === 'failed' && <button type="button" className="ski-retry" onClick={() => save(result)}>Försök spara igen</button>}
              </> : <>
                <p className="ski-kicker">1 480 meter · 18 portar</p>
                <h2>Jaga <em>snabbaste tiden.</em></h2>
                <p>Tajma starten och hitta en snabb linje genom portarna.</p>
                <button type="button" className="ski-primary" disabled={startLocked} onClick={act}>{graphics.ready ? 'Till start ↗' : 'Laddar backen…'}</button>
              </>}
            </div>
          </div>}
        </div>
        <div className="ski-controls downhill-controls" role="group" aria-label="Spelkontroller" onContextMenu={event => event.preventDefault()}>
          {steer(-1)}
          <button type="button" ref={goButton} className={`ski-action${green ? ' downhill-go' : ''}`}
            aria-disabled={!running} tabIndex={running ? 0 : -1}
            aria-pressed={view.phase === 'racing' ? view.tucked : undefined}
            onPointerDown={event => {
              if (!running || event.button !== 0) return
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              input.current.set(`touch-${event.pointerId}`, 'tuck')
              if (model.current.phase === 'countdown') act()
            }}
            onPointerCancel={release} onLostPointerCapture={release} onPointerUp={release}
            onClick={event => {
              if (!running || event.detail !== 0) return
              if (model.current.phase === 'countdown') act()
              else if (!input.current.delete('toggle-tuck')) input.current.set('toggle-tuck', 'tuck')
            }}><span aria-hidden="true">↑</span> {view.phase === 'racing' ? 'Huka' : 'Kör'}</button>
          {steer(1)}
        </div>
      </div>
      <aside className="ski-side">
        <h2>Din rekordjakt</h2>
        <div className="ski-personal"><span>{preview ? 'Bäst i testomgången' : 'Din snabbaste tid'}</span><strong>{best ? downhillTime(DOWNHILL_SCORE_BASE - best, 3) : '–'}</strong></div>
        <ol className="ski-instructions">
          <li>Tryck <strong>Kör</strong> när startljuset blir grönt.</li>
          <li>Håll inne <strong>↑</strong> eller <strong>Huka</strong> för att öka farten. Släpp för att resa dig och bromsa lätt.</li>
          <li>Sväng genom portarnas mitt för bättre glid. Tre rena portar i rad ger fartboost.</li>
          <li>Håll dig borta från lössnön i kanten. Varje missad port lägger till 1,25 s.</li>
        </ol>
        <p className="ski-keys"><kbd>←</kbd> <kbd>→</kbd> sväng · <kbd>↑</kbd> huka · <kbd>Mellanslag</kbd> starta</p>
        {!preview && <div className="ski-ranking"><h2>Genom tiderna</h2>
          {boardError ? <><p>Topplistan kunde inte hämtas.</p><button type="button" className="text-button" onClick={() => loadBoard()}>Försök igen</button></>
            : board === null ? <p>Hämtar tider…</p>
              : board.length ? <ol>{board.map(row => <li key={row.profileId}>
                <span>{row.rank}</span><span>{row.emoji} {row.displayName}</span><strong>{downhillTime(DOWNHILL_SCORE_BASE - row.score, 3)}</strong>
              </li>)}</ol> : <p>Inga tider ännu.</p>}
        </div>}
      </aside>
    </div>
  </section>
}
