import React, { useEffect, useRef, useState } from 'react'
import { advanceSprint, createSprint, sprintStep, sprintScore, sprintTime, SPRINT_BASE } from './sprint-engine.js'
import './sprint-game.css'

const W = 960, H = 500
const idleRace = () => ({ status: 'ready', distance: 0, speed: 0, steps: 0, elapsed: 0 })

function runner(ctx, x, y, phase, color, active, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale)
  ctx.fillStyle = '#251d3240'; ctx.beginPath(); ctx.ellipse(0, 3, 27, 7, 0, 0, Math.PI * 2); ctx.fill()
  const swing = active ? Math.sin(phase) : 0
  const bob = active ? Math.abs(Math.cos(phase)) * 3 : 0
  ctx.translate(0, -bob)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const limb = (points, color, width) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke() }
  limb([[-2,-39],[-swing*19,-21],[-swing*27+6,-4]], '#8e5039', 9)
  limb([[-2,-39],[swing*18,-22],[swing*28-5,-5]], '#e5a679', 10)
  limb([[-swing*27+3,-4],[-swing*27+14,-4]], '#f6f1de', 7)
  limb([[swing*28-6,-5],[swing*28+5,-5]], '#fff7df', 7)
  limb([[1,-65],[-swing*19,-52],[-swing*14+10,-60]], '#8e5039', 8)
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-8,-72); ctx.lineTo(13,-68); ctx.lineTo(7,-40); ctx.lineTo(-10,-40); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#152b40'; ctx.fillRect(-10,-43,19,9)
  limb([[7,-63],[swing*18+8,-53],[swing*14+18,-65]], '#e5a679', 8)
  ctx.fillStyle = '#e5a679'; ctx.beginPath(); ctx.arc(7,-84,12,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#243247'; ctx.beginPath(); ctx.arc(5,-89,11,Math.PI,Math.PI*2); ctx.fill(); ctx.fillRect(-6,-90,11,9)
  ctx.fillStyle = '#fff4d7'; ctx.fillRect(-5,-91,24,3)
  ctx.fillStyle = '#243247'; ctx.fillRect(14,-85,2,3)
  ctx.fillStyle = '#fff9df'; ctx.fillRect(-3,-61,11,12); ctx.fillStyle = '#1e3443'; ctx.font = 'bold 10px monospace'; ctx.fillText('1',-1,-51)
  ctx.restore()
}

function paint(canvas, race, now) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const sky = ctx.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#163a55'); sky.addColorStop(0.48,'#6ebbc2'); sky.addColorStop(1,'#f3d194'); ctx.fillStyle=sky; ctx.fillRect(0,0,W,H)
  ctx.fillStyle='#ffe9ae'; ctx.beginPath(); ctx.arc(825,70,30,0,Math.PI*2); ctx.fill()
  ctx.fillStyle='#ffffff22'; for(let i=0;i<5;i++) ctx.fillRect(70+i*210,38+(i%3)*25,85,5)
  ctx.fillStyle='#254b60'; ctx.fillRect(0,142,W,92)
  for(let row=0;row<5;row++) {
    ctx.fillStyle='#18384e'; ctx.fillRect(0,147+row*17,W,4)
    for(let col=0;col<80;col++) { ctx.fillStyle=['#f3ca81','#6aadb8','#ed9481','#b6b8d6'][(col*7+row*3)%4]; ctx.fillRect(col*13+row%2*6,153+row*17,5,6) }
  }
  ctx.fillStyle='#eff1da'; ctx.fillRect(0,232,W,37); ctx.fillStyle='#25505a'; ctx.font='bold 18px monospace'; ctx.fillText('SIMKOLL  /  ARENA',40,257); ctx.fillText('100 METER',710,257)
  ctx.fillStyle='#759c75'; ctx.fillRect(0,269,W,20)
  ctx.fillStyle='#b85b49'; ctx.fillRect(0,289,W,H-289)
  const camera = race.distance * 29
  for(let lane=0;lane<4;lane++) { ctx.fillStyle=lane===2?'#d7815b':lane%2?'#b85b49':'#c56b51'; ctx.fillRect(0,290+lane*52,W,52); ctx.fillStyle='#ffedc3b0'; ctx.fillRect(0,290+lane*52,W,2) }
  ctx.save(); ctx.beginPath(); ctx.rect(0,289,W,211); ctx.clip()
  for(let m=0;m<=110;m+=10) { const x=480+m*29-camera; if(x<-80||x>W+80)continue; ctx.fillStyle='#fff0cc55'; ctx.fillRect(x,290,2,210); ctx.fillStyle='#ffeac4'; ctx.font='bold 19px monospace'; ctx.fillText(`${m}m`,x+9,483) }
  const finish = 480 + 2900 - camera
  for(let row=0;row<14;row++) for(let col=0;col<2;col++){ctx.fillStyle=(row+col)%2?'#fff4d7':'#25404b';ctx.fillRect(finish+col*9,289+row*16,9,16)}
  const moving = race.status==='running'
  for(let lane=0;lane<4;lane++) {
    const own=lane===2
    const elapsed=race.elapsed/1000
    const distance=own?race.distance:Math.min(100,Math.max(0,elapsed-(lane*0.055))*[8.4,9.5,0,10.3][lane]*(1-Math.exp(-elapsed/1.5)))
    const x=own?480:480+(distance-race.distance)*29
    if(own){ctx.fillStyle='#ffed9e';ctx.beginPath();ctx.moveTo(x-6,325);ctx.lineTo(x+6,325);ctx.lineTo(x,334);ctx.fill()}
    runner(ctx,x,333+lane*52,own?race.steps*1.7+(now-race.lastPress)/120:elapsed*17,['#8fced5','#da9dd0','#ffe297','#a9d19a'][lane],moving && (own?race.speed>0.5:elapsed>0),0.77)
  }
  ctx.restore()
  if(race.status==='finished') for(let i=0;i<45;i++){const t=(now/1000+i*0.43)%3;ctx.fillStyle=['#ffe194','#e6adcb','#b8e6d3'][i%3];ctx.fillRect((i*137)%W,25+t*130,5,9)}
}

export default function SprintGame({ code, onBack, preview = false, request }) {
  const canvasRef=useRef(null), shellRef=useRef(null), raceRef=useRef(idleRace()), saveRef=useRef(null), handledFinish=useRef(null)
  const [hud,setHud]=useState(idleRace()), [count,setCount]=useState(3), [fullscreen,setFullscreen]=useState(false)
  const [board,setBoard]=useState(null), [boardError,setBoardError]=useState(''), [saveState,setSaveState]=useState(''), [personalBest,setPersonalBest]=useState(false)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true; return()=>{mounted.current=false}},[])
  useEffect(()=>{ if(preview)return; let alive=true; request('/api/points?game=sprint100&lifetime=true',code).then(data=>{if(alive)setBoard(data)}).catch(()=>{if(alive)setBoardError('Topplistan kunde inte hämtas just nu.')});return()=>{alive=false}},[code,preview,request])
  const save = async (score) => {
    const savedRace = raceRef.current
    if(preview){setBoard(current=>({leaderboard:[],ownBest:Math.max(current?.ownBest||0,score)}));setSaveState('Testläge – tiden sparas inte.');return}
    setSaveState('Sparar din tid…')
    try { const data=await request('/api/points',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-game-score',gameKey:'sprint100',score})}); if(!mounted.current)return;setBoard(data);setBoardError('');if(raceRef.current===savedRace){setSaveState('✓ Din tid är sparad.');saveRef.current=null} }
    catch {if(mounted.current && raceRef.current===savedRace)setSaveState('Tiden kunde inte sparas. Försök igen.');}
  }
  const saveCallback=useRef(save); saveCallback.current=save
  const bestRef=useRef(0); bestRef.current=board?.ownBest||0
  useEffect(()=>{
    let frame, lastHud=0, lastFrame=performance.now()
    const animate=(now)=>{
      const race=raceRef.current, previous=race.status
      if(now-lastFrame>1500 && ['running','countdown'].includes(race.status))race.status='paused'
      lastFrame=now
      advanceSprint(race,now)
      if(race.status==='finished' && handledFinish.current!==race){
        handledFinish.current=race
        const score=sprintScore(race.elapsed)
        setPersonalBest(score!==null && score>bestRef.current)
        if(score!==null){saveRef.current=score;saveCallback.current(score)}
      }
      if((['running','countdown'].includes(race.status) && now-lastHud>70) || previous!==race.status){setHud({...race});setCount(Math.max(1,Math.ceil((race.startAt-now)/1000)));lastHud=now}
      if(canvasRef.current)paint(canvasRef.current,race,now)
      frame=requestAnimationFrame(animate)
    }
    frame=requestAnimationFrame(animate)
    const pause=()=>{if(document.hidden && ['running','countdown'].includes(raceRef.current.status)){raceRef.current.status='paused';setHud({...raceRef.current})}}
    document.addEventListener('visibilitychange',pause)
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',pause)}
  },[])
  const start=()=>{raceRef.current=createSprint(performance.now());setHud({...raceRef.current});setCount(3);setSaveState('');setPersonalBest(false);saveRef.current=null;shellRef.current?.focus({preventScroll:true})}
  const step=(side)=>{sprintStep(raceRef.current,side,performance.now());setHud({...raceRef.current})}
  const keyDown=(event)=>{
    if(fullscreen && event.key==='Tab'){
      const buttons=[...shellRef.current.querySelectorAll('button:not([disabled])')]
      const first=buttons[0],last=buttons.at(-1)
      if(event.shiftKey && (document.activeElement===first || document.activeElement===shellRef.current)){event.preventDefault();last?.focus()}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
    }
    const side=['ArrowLeft','a','A'].includes(event.key)?'left':['ArrowRight','d','D'].includes(event.key)?'right':null
    if(side){event.preventDefault();if(!event.repeat)step(side)}
  }
  useEffect(()=>{if(!fullscreen)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';const escape=event=>{if(event.key==='Escape'){shellRef.current?.classList.remove('sprint-immersive');setFullscreen(false)}};document.addEventListener('keydown',escape);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',escape)}},[fullscreen])
  const toggleFullscreen=()=>{
    const target=shellRef.current
    // Viewport-sized game mode works in iPhone Safari/PWA as well as desktop,
    // without relying on the inconsistently supported Fullscreen API.
    setFullscreen(!fullscreen);target.focus({preventScroll:true})
  }
  const active=['running','countdown'].includes(hud.status)
  const statusText={ready:'Ta plats på startlinjen',finished:personalBest?'Nytt personbästa!':'I mål!', 'false-start':'Tjuvstart!', paused:'Loppet avbröts',timeout:'Ta ett nytt försök'}[hud.status]
  return <section className="sprint-page">
    <button className="back-button inline" onClick={onBack}>← Tillbaka</button>
    <div className="sprint-heading"><div><p className="eyebrow">Veckans spel · Retro athletics</p><h1>100m Sprint <span>⚡</span></h1></div><span className="sprint-tag">EN BANA. DIN BÄSTA TID.</span></div>
    <p className="sprint-intro">Vänster. Höger. Full fart. Vänta på signalen och växla knappar för att springa!</p>
    <div className="sprint-layout"><div ref={shellRef} className={`sprint-shell${active?' sprint-active':''}${fullscreen?' sprint-immersive':''}`} tabIndex={0} onKeyDown={keyDown} aria-label="100 meter sprint. Använd A och D eller vänster och höger pil.">
      <div className="sprint-toolbar"><strong>100<span>m</span> <small>SPRINT</small></strong><button type="button" onClick={toggleFullscreen} aria-label={fullscreen?'Lämna fullskärm':'Öppna fullskärm'}>{fullscreen?'↙ Stäng':'⛶ Fullskärm'}</button></div>
      <div className="sprint-hud"><div><small>TID</small><strong>{sprintTime(hud.elapsed)}</strong></div><div><small>DISTANS</small><strong>{Math.floor(hud.distance)}<span> / 100 m</span></strong></div><div><small>FART</small><strong>{Math.round(hud.speed*3.6)}<span> km/h</span></strong></div></div>
      <div className="sprint-stage"><canvas ref={canvasRef} width={W} height={H} aria-label="Löparbana med din löpare i den gula tröjan" />
        {hud.status==='countdown' && <div className="sprint-countdown" aria-live="polite"><small>{count===3?'PÅ ERA PLATSER':count===2?'FÄRDIGA':'VÄNTA…'}</small><strong key={count}>{count}</strong></div>}
        {hud.status==='running' && hud.elapsed<700 && <div className="sprint-go">KÖR!</div>}
        {!active && <div className="sprint-overlay"><p className="sprint-overlay-label">{hud.status==='finished'?'MÅLLINJEN':'100 METER / EN CHANS'}</p><h2>{statusText}</h2>{hud.status==='finished'?<strong className="sprint-finish-time">{sprintTime(hud.elapsed)}</strong>:<p>{hud.status==='false-start'?'Vänta tills nedräkningen är klar.':hud.status==='paused'?'Lämnade du spelet? Starta om för en rättvis tid.':'Du är löparen i gult. Växla vänster och höger.'}</p>}<button type="button" onClick={start}>{hud.status==='ready'?'Starta loppet':'Spring igen'} <span>→</span></button>{saveState && <small role="status">{saveState}</small>}{saveRef.current!==null && saveState.startsWith('Tiden kunde') && <button type="button" className="sprint-retry" onClick={()=>save(saveRef.current)}>Försök spara igen</button>}</div>}
      </div>
      <div className="sprint-progress" role="progressbar" aria-label="Till mållinjen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(hud.distance)}><span style={{width:`${hud.distance}%`}} /></div>
      <div className="sprint-controls">{['left','right'].map((side)=><button type="button" key={side} className={`sprint-step ${side}${hud.lastSide===side&&hud.status==='running'?' stepped':''}`} onPointerDown={(event)=>{event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);shellRef.current.focus({preventScroll:true});step(side)}} onClick={event=>{if(event.detail===0)step(side)}} aria-label={side==='left'?'Vänster steg':'Höger steg'}><span>{side==='left'?'←':'→'}</span><strong>{side==='left'?'VÄNSTER':'HÖGER'}</strong><kbd>{side==='left'?'A':'D'}</kbd></button>)}</div>
      <p className="sprint-hint">{hud.status==='countdown'?'Vänta på KÖR!':hud.status==='running'?'Växla knapparna – håll rytmen!':'Mobil: två tummar · Dator: A / D eller ← / →'}</p>
    </div><aside className="sprint-records"><p className="eyebrow">100m · Genom tiderna</p><h2>Snabbast på banan</h2><div className="sprint-own"><span>DIN BÄSTA TID</span><strong>{board?.ownBest?sprintTime(SPRINT_BASE-board.ownBest):'—'}</strong></div>{preview?<p>Testläge: inga tider eller poäng sparas.</p>:boardError?<p role="status">{boardError}</p>:board===null?<p>Laddar topplistan…</p>:board.leaderboard?.length?<ol>{board.leaderboard.map(item=><li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{item.displayTime||sprintTime(SPRINT_BASE-item.score)}</b></li>)}</ol>:<p>Bli först att sätta en tid!</p>}<small>Snabbaste giltiga loppet räknas. En stadig rytm slår vilt knapptryckande.</small></aside></div>
  </section>
}
