import React, { useCallback, useEffect, useRef, useState } from 'react'
import { advanceBalance, BALANCE_ZONE, createBalanceGame } from './balance-engine.js'
import { drawBalance } from './balance-art.js'
import './balance-game.css'

const resultText = { front: 'Framhjulet landade', tip: 'Lite för långt bak!', finish: 'Hela strandpromenaden klar!' }

export default function BalanceGame({ code, onBack, preview = false, request }) {
  const canvas = useRef(null)
  const game = useRef(createBalanceGame())
  const input = useRef({ keys: new Set(), pointers: new Set() })
  const mounted = useRef(false)
  const saveLock = useRef(false)
  const boardVersion = useRef(0)
  const [phase, setPhase] = useState('ready')
  const [view, setView] = useState({ ...game.current })
  const [held, setHeld] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [message, setMessage] = useState('')
  const [boards, setBoards] = useState({ week: null, lifetime: null })
  const [period, setPeriod] = useState('week')
  const [boardError, setBoardError] = useState(false)

  const release = useCallback(() => {
    input.current.keys.clear(); input.current.pointers.clear(); setHeld(false)
  }, [])
  const loadBoards = useCallback(async () => {
    if (preview) return
    const version = ++boardVersion.current
    setBoardError(false)
    const results = await Promise.allSettled([
      request('/api/points?game=balance', code),
      request('/api/points?game=balance&lifetime=true', code),
    ])
    if (!mounted.current || version !== boardVersion.current) return
    setBoards((previous) => ({
      week: results[0].status === 'fulfilled' ? results[0].value : previous.week,
      lifetime: results[1].status === 'fulfilled' ? results[1].value : previous.lifetime,
    }))
    setBoardError(results.some((result) => result.status === 'rejected'))
  }, [code, preview, request])

  useEffect(() => {
    mounted.current = true; loadBoards(); drawBalance(canvas.current, game.current)
    return () => { mounted.current = false; boardVersion.current += 1 }
  }, [loadBoards])

  const save = useCallback(async (score) => {
    if (preview || score < 1 || saveLock.current) return
    saveLock.current = true; setSaving(true); setSaveError(false); setMessage('Sparar ditt resultat…')
    try {
      await request('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'balance', score }) })
      if (mounted.current) {
        setMessage('✓ Resultatet är sparat. Ditt bästa resultat räknas i topplistan.')
        setBoards((previous) => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, { ...value, ownBest: Math.max(value?.ownBest || 0, score) }])))
        loadBoards()
      }
    } catch {
      if (mounted.current) { setSaveError(true); setMessage('Resultatet kunde inte sparas. Försök igen innan du lämnar sidan.') }
    } finally {
      saveLock.current = false
      if (mounted.current) setSaving(false)
    }
  }, [code, preview, request, loadBoards])

  useEffect(() => {
    if (phase !== 'playing') return
    let raf = 0, last = null, nextHud = 0
    const frame = (now) => {
      const dt = last === null ? 0 : (now - last) / 1000; last = now
      advanceBalance(game.current, dt, input.current.keys.size > 0 || input.current.pointers.size > 0)
      drawBalance(canvas.current, game.current)
      if (now >= nextHud || game.current.status === 'over') { setView({ ...game.current }); nextHud = now + 80 }
      if (game.current.status === 'over') { release(); setPhase('over'); save(game.current.score); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const pause = () => { release(); setPhase((value) => value === 'playing' ? 'paused' : value) }
    const visibility = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility) }
  }, [phase, release, save])

  const start = () => {
    if (saveLock.current) return
    release(); game.current = createBalanceGame(); setView({ ...game.current }); setMessage(''); setSaveError(false); setPhase('playing'); canvas.current?.focus({ preventScroll: true })
  }
  const updateHeld = () => setHeld(input.current.keys.size > 0 || input.current.pointers.size > 0)
  const press = (event) => {
    if (phase !== 'playing') return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    input.current.pointers.add(event.pointerId); updateHeld()
  }
  const lift = (event) => { input.current.pointers.delete(event.pointerId); updateHeld() }
  const keyboard = (event, down) => {
    if (!['Space', 'ArrowUp'].includes(event.code) || phase !== 'playing') return
    event.preventDefault()
    if (down) input.current.keys.add(event.code)
    else input.current.keys.delete(event.code)
    updateHeld()
  }
  const inZone = view.angle >= BALANCE_ZONE[0] && view.angle <= BALANCE_ZONE[1]
  const board = boards[period]
  return <section className="balance-page" onKeyDown={(event) => keyboard(event, true)} onKeyUp={(event) => keyboard(event, false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) release() }}>
    <button className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <header className="balance-heading"><div><p className="eyebrow">Veckans spel · balans & timing</p><h1>Preppes balansjakt <span aria-hidden="true">🚲</span></h1><p>En cykel. Ett bakhjul. Hur långt håller du balansen?</p></div><span className="balance-label">{preview ? 'Testläge · inget sparas' : 'Din egen rekordjakt'}</span></header>
    <div className="balance-layout"><div className="balance-main">
      <div className="balance-hud"><div><span>Poäng</span><strong>{view.score.toLocaleString('sv-SE')}</strong></div><div><span>Sträcka</span><strong>{Math.floor(view.distance)} <small>m</small></strong></div><div><span>Personbästa · alla tider</span><strong>{preview ? '—' : boards.lifetime?.ownBest?.toLocaleString('sv-SE') ?? '—'}</strong></div></div>
      <div className="balance-stage">
        <canvas ref={canvas} width="960" height="500" tabIndex="0" aria-label="Spelplan för Preppes balansjakt. Håll mellanslag eller pil upp för att lyfta framhjulet, släpp för att sänka." onPointerDown={press} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift} />
        {phase !== 'playing' && <div className="balance-overlay"><div><span className="balance-overlay-icon" aria-hidden="true">{phase === 'over' ? '🏁' : '🚲'}</span><h2>{phase === 'ready' ? 'Hitta din balans' : phase === 'paused' ? 'Spelet är pausat' : resultText[view.reason]}</h2><p>{phase === 'over' ? `${view.score} poäng · ${Math.floor(view.distance)} meter` : phase === 'paused' ? 'Ingen tid eller poäng räknas medan du pausar.' : 'Håll för att lyfta. Släpp för att sänka.'}</p><button className="primary-button" disabled={saving} onClick={phase === 'paused' ? () => { release(); setPhase('playing'); canvas.current?.focus({ preventScroll: true }) } : start}>{saving ? 'Sparar…' : phase === 'ready' ? 'Börja cykla →' : phase === 'paused' ? 'Fortsätt →' : 'Försök igen →'}</button></div></div>}
      </div>
      <div className="balance-controls">
        <div className="balance-meter"><div><strong>{inZone && phase === 'playing' ? 'Fin balans! Dubbla poäng' : 'Hitta det gröna fältet'}</strong><span>{Math.round(view.angle)}°</span></div><div className="balance-meter-track" role="meter" aria-label="Cykelns lutning" aria-valuemin="0" aria-valuemax="85" aria-valuenow={Math.round(view.angle)}><span className="balance-meter-zone"/><span className="balance-meter-needle" style={{ left: `${Math.max(0, Math.min(100, view.angle / 85 * 100))}%` }}/></div><small>För lågt: framhjulet landar · För högt: du tippar</small></div>
        <div className="balance-buttons"><button className={`balance-hold ${held ? 'is-held' : ''}`} disabled={phase !== 'playing'} onPointerDown={press} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift}>{held ? '↑ Lyfter framhjulet' : 'Håll för att lyfta ↑'}<small>Släpp för att sänka</small></button><button className="secondary-button" disabled={phase !== 'playing'} onClick={() => { release(); setPhase('paused') }} aria-label="Pausa spelet">Ⅱ</button></div>
      </div>
      <p className="balance-save" role="status">{preview ? 'Tränarens testläge: resultat och poäng sparas inte.' : message || 'Mobil: håll skärmen eller knappen. Dator: håll mellanslag eller pil upp.'}</p>
      {saveError && <button className="secondary-button" disabled={saving} onClick={() => save(view.score)}>Försök spara resultatet igen</button>}
      <div className="balance-rules"><span><b>01</b> Hitta rytmen med håll / släpp.</span><span><b>02</b> Grönt fält ger dubbla poäng per meter.</span><span><b>03</b> Farten ökar. Se upp för små gupp!</span></div>
      <p className="balance-footnote">Samma bana för alla. En runda är högst två minuter. Landar framhjulet eller tippar du bakåt tar rundan slut.</p>
    </div><aside className="balance-board"><p className="eyebrow">Preppes balansjakt</p><h2>Topplistan</h2><div className="balance-tabs" role="group" aria-label="Topplistans period"><button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>Denna vecka</button><button aria-pressed={period === 'lifetime'} onClick={() => setPeriod('lifetime')}>Alla tider</button></div>
      {preview ? <p className="empty">I simmarvyn visas veckans och alla tiders rekord här.</p> : !board ? <p role="status">{boardError ? 'Topplistan kunde inte hämtas.' : 'Hämtar topplistan…'}</p> : board.leaderboard?.length ? <ol>{board.leaderboard.map((entry) => <li key={entry.profileId}><span className="balance-rank">{entry.rank}</span><span aria-hidden="true">{entry.emoji}</span><strong>{entry.displayName}</strong><b>{entry.score.toLocaleString('sv-SE')}</b></li>)}</ol> : <p className="empty">Bli först att sätta ett rekord!</p>}
      {!preview && <p className="balance-own">Ditt bästa {period === 'week' ? 'denna vecka' : 'genom tiderna'}<strong>{board?.ownBest?.toLocaleString('sv-SE') ?? '—'} <small>poäng</small></strong></p>}
      {boardError && <button className="secondary-button" onClick={loadBoards}>Hämta topplistan igen</button>}
      <small>Ditt bästa resultat sparas automatiskt efter varje runda. Spelet ingår även i Simkolls sammanlagda rekordlista.</small>
    </aside></div>
  </section>
}
