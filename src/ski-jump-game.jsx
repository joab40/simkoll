import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import SkiJumpScene from './ski-jump-scene.jsx'
import { advanceSkiJump, createSkiJump, formatSkiJumpScore, SKI_K_POINT, SKI_LIP, SKI_WIND, skiAction, skiTiming } from './ski-jump-engine.js'
import './ski-jump-game.css'

const isRunning = phase => ['approach', 'air', 'runout'].includes(phase)
const snapshot = game => ({
  phase: game.phase, wind: game.wind, speed: Math.round(game.speed * 3.6),
  distance: Math.max(0, Math.round(game.distance - SKI_LIP)), landing: game.landing, result: game.result,
})
const windLabel = wind => wind === 0 ? 'Vindstilla' : `${wind > 0 ? '↗ Medvind' : '↙ Motvind'} ${Math.abs(wind)} m/s`
const distanceLabel = distance => distance.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

class GraphicsBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function SkiJumpGame({ code, onBack, preview = false, request }) {
  const model = useRef(createSkiJump())
  const meter = useRef(null), shell = useRef(null), actionButton = useRef(null)
  const mounted = useRef(false), saveLock = useRef(false), boardRevision = useRef(0)
  const [view, setView] = useState(() => snapshot(model.current))
  const [paused, setPaused] = useState(false)
  const [graphics, setGraphics] = useState({ ready: false, failed: false, key: 0 })
  const [effects, setEffects] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [leaderboard, setLeaderboard] = useState(null), [boardError, setBoardError] = useState(false)
  const [best, setBest] = useState(0)
  const [saveStatus, setSaveStatus] = useState('')

  const failGraphics = useCallback(() => {
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
    if (isRunning(model.current.phase)) setPaused(true)
  }, [])
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
      advanceSkiJump(game, Math.min(delta, .075))
      const timing = skiTiming(game)
      if (meter.current && timing) {
        meter.current.style.setProperty('--cursor', `${timing.position * 100}%`)
        meter.current.classList.toggle('in-zone', timing.position >= timing.zone[0] && timing.position <= timing.zone[1])
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
    if (paused) { setPaused(false); return }
    if (model.current.phase === 'runout' || (model.current.phase === 'air' && model.current.landing)) return
    if (model.current.phase === 'finished') {
      const wind = SKI_WIND[Math.floor(Math.random() * SKI_WIND.length)]
      model.current = createSkiJump(wind)
      setSaveStatus('')
    }
    if (model.current.phase === 'ready' && window.matchMedia('(max-width: 640px)').matches) {
      shell.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
    skiAction(model.current)
    publish()
  }

  const onKeyDown = event => {
    if (event.code === 'KeyP' && !event.repeat && isRunning(model.current.phase)) {
      event.preventDefault()
      setPaused(value => !value)
      return
    }
    if (event.code !== 'Space' || (event.target !== actionButton.current && event.target !== shell.current)) return
    event.preventDefault()
    if (!event.repeat) act()
  }

  const result = view.phase === 'finished' ? view.result : null
  const timing = skiTiming(model.current)
  const actionLabel = paused ? 'Fortsätt' : result ? 'Hoppa igen' : view.phase === 'ready' ? 'Starta hoppet' : view.phase === 'approach' ? 'Hoppa' : 'Landa'
  const actionLocked = !graphics.ready || graphics.failed || saveStatus === 'saving'
    || (!paused && (view.phase === 'runout' || (view.phase === 'air' && Boolean(view.landing))))

  return <section className="ski-page">
    <button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="ski-heading">
      <h1>Frostfjäll <em>Backhoppning</em></h1>
      {preview && <span>Testläge</span>}
    </header>
    <div className="ski-layout">
      <div ref={shell} className="ski-console" tabIndex={0} onKeyDown={onKeyDown} aria-label="Backhoppning. Mellanslag styr hoppet, P pausar.">
        <div className="ski-toolbar">
          <strong>Frostfjäll · K{SKI_K_POINT}</strong>
          <div>
            <button type="button" aria-pressed={effects} onClick={() => setEffects(value => !value)}>Snöeffekter</button>
            <button type="button" disabled={!running} onClick={pause}>Paus</button>
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
            <span>{windLabel(view.wind)}</span>
            {view.phase !== 'ready' && <span>{view.phase === 'air' ? `${view.distance} m` : `${view.speed} km/h`}</span>}
          </div>
          {graphics.failed && <div className="ski-stage-card">
            <h2>3D-vyn pausades</h2>
            <button type="button" onClick={() => setGraphics(current => ({ ready: false, failed: false, key: current.key + 1 }))}>Ladda om 3D-vyn</button>
          </div>}
          {!graphics.failed && paused && <div className="ski-stage-card"><h2>Pausat</h2></div>}
          {!graphics.failed && result && <div className="ski-stage-card ski-finish">
            <p>{result.score ? result.distance >= SKI_K_POINT ? 'Förbi K-linjen!' : 'Hoppet är klart' : 'Ett försök till?'}</p>
            <h2>{distanceLabel(result.distance)} <small>m</small></h2>
            {result.score > 0 && <strong>{formatSkiJumpScore(result.score)} p <span>· Stil {result.style}/100</span></strong>}
            <p role="status">{result.reason}</p>
          </div>}
        </div>
        <div className="ski-controls">
          <div className="ski-timing">
            {timing ? <>
              <strong>{view.phase === 'approach' ? 'Upphopp' : 'Landning'}</strong>
              <div className="ski-timing-track" ref={meter} aria-hidden="true" style={{
                '--zone-start': `${timing.zone[0] * 100}%`,
                '--zone-width': `${(timing.zone[1] - timing.zone[0]) * 100}%`,
              }}><span /></div>
            </> : <small role="status">{saveStatus === 'saving' ? 'Sparar hoppet…' : saveStatus === 'failed' ? 'Hoppet kunde inte sparas.' : saveStatus === 'saved' ? 'Hoppet är sparat ✓' : view.phase === 'ready' ? 'Tajma det gröna fältet.' : ''}</small>}
            {saveStatus === 'failed' && <button type="button" className="ski-retry" onClick={() => save(result?.score)}>Försök spara igen</button>}
          </div>
          <button ref={actionButton} type="button" className="ski-action" aria-disabled={actionLocked} onClick={act}>{actionLabel}</button>
        </div>
      </div>
      <aside className="ski-side">
        <div className="ski-personal">
          <span>{preview ? 'Bäst i testomgången' : 'Ditt personbästa'}</span>
          <strong>{best ? formatSkiJumpScore(best) : '–'} <small>p</small></strong>
        </div>
        <ol className="ski-instructions">
          <li><strong>Hoppa</strong> när markören går in i det gröna fältet vid kanten.</li>
          <li><strong>Landa</strong> i nästa gröna fält. Längd och stil avgör poängen.</li>
        </ol>
        <p className="ski-keys"><kbd>Mellanslag</kbd> hoppa och landa</p>
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
