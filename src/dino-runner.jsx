import React, { useCallback, useEffect, useRef, useState } from 'react'
import './dino-runner.css'

const WIDTH = 960
const HEIGHT = 420
const GROUND = 340

function drawScene(canvas, game) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const scale = Math.min(canvas.width / WIDTH, canvas.height / HEIGHT)
  ctx.setTransform(scale, 0, 0, scale, (canvas.width - WIDTH * scale) / 2, (canvas.height - HEIGHT * scale) / 2)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, '#b9e8e4'); sky.addColorStop(1, '#eaf7dc')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#ffffff80'
  for (const cloud of game.clouds) {
    ctx.beginPath(); ctx.ellipse(cloud.x, 78 + cloud.y, 39, 12, 0, 0, Math.PI * 2); ctx.ellipse(cloud.x + 25, 74 + cloud.y, 25, 16, 0, 0, Math.PI * 2); ctx.ellipse(cloud.x - 23, 81 + cloud.y, 22, 11, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#9fd4b0'
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.quadraticCurveTo(170, 250, 335, GROUND); ctx.quadraticCurveTo(560, 265, 740, GROUND); ctx.lineTo(WIDTH, GROUND); ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.fill()
  ctx.fillStyle = '#245d53'; ctx.fillRect(0, GROUND, WIDTH, 5)
  ctx.strokeStyle = '#52856d'; ctx.lineWidth = 3; ctx.setLineDash([22, 19]); ctx.lineDashOffset = -game.distance % 41; ctx.beginPath(); ctx.moveTo(0, GROUND + 20); ctx.lineTo(WIDTH, GROUND + 20); ctx.stroke(); ctx.setLineDash([])
  for (const obstacle of game.obstacles) {
    if (obstacle.type === 'cactus') {
      ctx.fillStyle = '#167667'; ctx.fillRect(obstacle.x + 10, GROUND - obstacle.height, 19, obstacle.height)
      ctx.fillRect(obstacle.x, GROUND - obstacle.height + 24, 13, 13); ctx.fillRect(obstacle.x, GROUND - obstacle.height + 12, 13, 22)
      ctx.fillRect(obstacle.x + 27, GROUND - obstacle.height + 45, 13, 13); ctx.fillRect(obstacle.x + 27, GROUND - obstacle.height + 33, 13, 22)
      ctx.fillStyle = '#53b69b'; ctx.fillRect(obstacle.x + 13, GROUND - obstacle.height + 5, 5, obstacle.height - 9)
    } else {
      ctx.fillStyle = '#203d48'; ctx.beginPath(); ctx.ellipse(obstacle.x + 28, GROUND - obstacle.height + 13, 27, 12, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(obstacle.x + 5, GROUND - obstacle.height + 12, 7, 15); ctx.fillRect(obstacle.x + 25, GROUND - obstacle.height + 18, 6, 12)
      ctx.fillStyle = '#c9f05a'; ctx.beginPath(); ctx.arc(obstacle.x + 42, GROUND - obstacle.height + 12, 2.5, 0, Math.PI * 2); ctx.fill()
    }
  }
  const dino = game.dino
  const x = 126, y = GROUND - dino.height
  ctx.fillStyle = '#14796c'
  ctx.beginPath(); ctx.moveTo(x + 12, y + 33); ctx.lineTo(x - 14, y + 23); ctx.lineTo(x + 10, y + 46); ctx.lineTo(x + 21, y + 42); ctx.fill()
  ctx.fillRect(x + 12, y + 20, 42, 28); ctx.fillRect(x + 36, y + 2, 28, 31); ctx.fillRect(x + 54, y + 13, 20, 12)
  ctx.fillStyle = '#c9f05a'; ctx.fillRect(x + 51, y + 9, 5, 5); ctx.fillRect(x + 41, y + 31, 11, 9)
  ctx.fillStyle = '#102d37'; ctx.fillRect(x + 59, y + 10, 4, 4)
  const stride = game.running && dino.grounded ? Math.sin(game.distance * .12) * 5 : 0
  ctx.fillStyle = '#105f58'; ctx.fillRect(x + 18, y + 44, 10, 15 + stride); ctx.fillRect(x + 40, y + 44, 10, 15 - stride)
  ctx.fillStyle = '#102d37'; ctx.font = '700 22px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.fillText(String(Math.floor(game.score)).padStart(5, '0'), WIDTH - 32, 43)
}

function makeGame() {
  return { running: false, over: false, score: 0, speed: 330, distance: 0, last: 0, spawnIn: 900, dino: { height: 60, velocity: 0, grounded: true }, obstacles: [], clouds: [{ x: 180, y: 0 }, { x: 520, y: 35 }, { x: 825, y: -5 }] }
}

export default function DinoRunner({ code, onBack, preview = false, request }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(makeGame())
  const rafRef = useRef(0)
  const mounted = useRef(true)
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    mounted.current = true
    if (!preview) request('/api/points?game=dino', code).then(setBest).catch(() => {})
    return () => { mounted.current = false; cancelAnimationFrame(rafRef.current) }
  }, [code, preview, request])

  const saveScore = useCallback(async (value) => {
    if (preview || value < 1) return
    setMessage('Sparar rekord…')
    try {
      const data = await request('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'dino', score: value }) })
      if (mounted.current) { setBest(data); setMessage('✓ Rekordet är sparat!') }
    } catch { if (mounted.current) setMessage('Rekordet kunde inte sparas just nu.') }
  }, [code, preview, request])

  const frame = useCallback((now) => {
    const game = gameRef.current
    if (!game.running) return
    const delta = Math.min(40, now - (game.last || now)); game.last = now
    const dt = delta / 1000
    game.score += dt * 12
    // A long, readable ramp: the first seconds stay welcoming, then the
    // runner gradually reaches a pace that requires deliberate timing.
    game.speed = Math.min(820, 330 + game.score * .55)
    game.distance += game.speed * dt
    game.spawnIn -= delta
    if (game.spawnIn <= 0) {
      const bird = game.score > 120 && Math.random() < Math.min(.38, .12 + game.score / 2600)
      const height = bird ? 60 : 48 + Math.random() * (48 + Math.min(18, game.score / 40))
      game.obstacles.push({ x: WIDTH + 15, type: bird ? 'bird' : 'cactus', height, width: bird ? 52 : 42 })
      game.spawnIn = Math.max(620, 1120 + Math.random() * 440 - Math.min(500, game.score * .42))
    }
    game.obstacles.forEach((obstacle) => { obstacle.x -= game.speed * dt })
    game.obstacles = game.obstacles.filter((obstacle) => obstacle.x > -80)
    game.clouds.forEach((cloud) => { cloud.x -= game.speed * dt * .12; if (cloud.x < -70) cloud.x = WIDTH + 50 })
    const dino = game.dino
    if (!dino.grounded) { dino.velocity += 1750 * dt; dino.height -= dino.velocity * dt; if (dino.height <= 60) { dino.height = 60; dino.velocity = 0; dino.grounded = true } }
    const left = 126 + 14, right = 126 + 66
    const top = GROUND - dino.height + 7, bottom = GROUND - dino.height + 59
    const collision = game.obstacles.some((obstacle) => {
      const obstacleTop = GROUND - obstacle.height
      const obstacleBottom = obstacle.type === 'bird' ? obstacleTop + 28 : GROUND
      return left < obstacle.x + obstacle.width - 7 && right > obstacle.x + 7 && top < obstacleBottom && bottom > obstacleTop + 3
    })
    if (collision) {
      game.running = false; game.over = true; setStatus('over'); setScore(Math.floor(game.score)); saveScore(Math.floor(game.score)); drawScene(canvasRef.current, game); return
    }
    drawScene(canvasRef.current, game); setScore(Math.floor(game.score)); rafRef.current = requestAnimationFrame(frame)
  }, [saveScore])

  const start = () => {
    cancelAnimationFrame(rafRef.current); gameRef.current = makeGame(); gameRef.current.running = true; gameRef.current.last = performance.now(); setScore(0); setMessage(''); setStatus('running'); rafRef.current = requestAnimationFrame(frame); canvasRef.current?.focus()
  }
  const jump = () => {
    const game = gameRef.current
    if (game.running && game.dino.grounded) { game.dino.grounded = false; game.dino.velocity = -690 }
    else if (game.over || !game.running) start()
  }

  useEffect(() => { drawScene(canvasRef.current, gameRef.current) }, [])
  useEffect(() => {
    const keydown = (event) => {
      if (['Space', 'ArrowUp', ' '].includes(event.code) && !event.repeat) { event.preventDefault(); jump() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  return <section className="dino-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="dino-heading"><div><p className="eyebrow">Veckans spel · Retro Runner</p><h1>Dino Runner <span>🦖</span></h1></div><span className="dino-tag">HOPPA. DUCKA. HÅLL UT.</span></div><p className="dino-intro">Tryck på mellanslag, pil upp eller skärmen för att hoppa över hindren. Tempot ökar ju längre du klarar dig.</p>
    <div className="dino-layout"><div className="dino-main"><div className="dino-hud"><span>POÄNG<strong>{score}</strong></span><span>DITT BÄSTA<strong>{best?.ownBest ?? '—'}</strong></span></div><div className="dino-stage"><canvas ref={canvasRef} width="960" height="420" aria-label="Dino Runner spelplan" onPointerDown={jump} />{status !== 'running' && <div className="dino-overlay"><span>{status === 'over' ? '💥' : '🦖'}</span><small>{status === 'over' ? 'RUN OVER' : 'RETRO RUNNER'}</small><h2>{status === 'over' ? `Du fick ${score} poäng` : 'Redo att springa?'}</h2><p>{status === 'over' ? 'Hindren blir snabbare ju längre du springer.' : 'Hoppa över kaktusarna och se hur långt du kommer.'}</p><button className="primary-button" onClick={start}>{status === 'over' ? 'Spring igen →' : 'Starta spelet →'}</button></div>}</div><button className="primary-button dino-jump" onPointerDown={(event) => event.preventDefault()} onClick={jump}>{status === 'running' ? '⬆ Hoppa' : '▶ Starta / spela igen'}</button>{message && <p className="dino-save" role="status">{message}</p>}</div><aside className="dino-board"><p className="eyebrow">Dino Runner · den här månaden</p><h2>Topplistan</h2>{best?.leaderboard?.length ? <ol>{best.leaderboard.map((item) => <li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{item.score}</b></li>)}</ol> : <p className="empty">Ingen har spelat ännu.</p>}<small>{preview ? 'Testläge: resultat och poäng sparas inte.' : 'Ditt bästa resultat sparas automatiskt när rundan tar slut.'}</small></aside></div>
  </section>
}
