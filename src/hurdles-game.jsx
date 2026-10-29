import React, { useEffect, useRef, useState } from 'react'
import { drawAthlete } from './athletics-art.js'
import { HURDLES, HURDLE_BASE, idleHurdles, createHurdles, advanceHurdles, hurdleInput, hurdleScore, hurdleTime } from './hurdles-engine.js'
import './sprint-game.css'
import './hurdles-game.css'

function drawHurdler(ctx, x, ground, race) {
  if (race.y <= 0) { drawAthlete(ctx, x, ground, race.distance * 4, '#ffe194', race.speed > 0.4); return }
  const y = ground - race.y * 55
  ctx.save(); ctx.translate(x, y)
  const limb = (points, color, width = 9) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); points.forEach(([a,b], i) => i ? ctx.lineTo(a,b) : ctx.moveTo(a,b)); ctx.stroke() }
  limb([[0,-40],[-25,-28],[-12,-13]], '#995d43')
  limb([[0,-40],[29,-42],[46,-29]], '#e5a679')
  limb([[41,-28],[53,-26]], '#fff7df', 7)
  limb([[-16,-13],[-5,-11]], '#fff7df', 7)
  limb([[3,-68],[22,-64],[32,-70]], '#995d43', 8)
  ctx.fillStyle = '#ffe194'; ctx.beginPath(); ctx.moveTo(-7,-72); ctx.lineTo(14,-68); ctx.lineTo(7,-39); ctx.lineTo(-10,-42); ctx.fill()
  ctx.fillStyle = '#152b40'; ctx.fillRect(-10,-44,19,9)
  limb([[5,-66],[-8,-55],[11,-47]], '#e5a679', 8)
  ctx.fillStyle = '#e5a679'; ctx.beginPath(); ctx.arc(12,-84,12,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#243247'; ctx.beginPath(); ctx.arc(10,-89,11,Math.PI,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#fff4d7'; ctx.fillRect(0,-91,23,3)
  ctx.restore()
}

function paint(canvas, race, now) {
  const ctx = canvas.getContext('2d'), w = 960, h = 500
  if (!ctx) return
  const sky = ctx.createLinearGradient(0,0,0,300); sky.addColorStop(0,'#163a55'); sky.addColorStop(1,'#a3cdc0'); ctx.fillStyle = sky; ctx.fillRect(0,0,w,h)
  ctx.fillStyle = '#ffe2a3'; ctx.beginPath(); ctx.arc(825,65,28,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#254b60'; ctx.fillRect(0,140,w,100)
  for (let row=0;row<5;row++) for(let col=0;col<80;col++) { ctx.fillStyle=['#ebbd87','#a7cbb7','#b596bd'][(row+col)%3]; ctx.fillRect(col*13,153+row*17,5,6) }
  ctx.fillStyle='#eff1da'; ctx.fillRect(0,240,w,38); ctx.fillStyle='#25505a'; ctx.font='bold 18px monospace'; ctx.fillText('SIMKOLL ARENA / 100 M HÄCK',35,266)
  ctx.fillStyle='#719b76';ctx.fillRect(0,278,w,25)
  for(let lane=0;lane<4;lane++){ctx.fillStyle=lane===2?'#d7815b':lane%2?'#b85b49':'#c56b51';ctx.fillRect(0,303+lane*49,w,49);ctx.fillStyle='#ffedc3b0';ctx.fillRect(0,303+lane*49,w,2)}
  const scale=48, runnerX=310, ground=438, x=(distance)=>runnerX+(distance-race.distance)*scale
  for(let m=0;m<=100;m+=5){const at=x(m);if(at < -70 || at>w)continue;ctx.fillStyle='#fff0cc55';ctx.fillRect(at,303,2,197);ctx.fillStyle='#ffeac4';ctx.font='bold 16px monospace';ctx.fillText(`${m}m`,at+7,484)}
  const finish=x(100)
  for(let row=0;row<12;row++)for(let col=0;col<2;col++){ctx.fillStyle=(row+col)%2?'#fff4d7':'#25404b';ctx.fillRect(finish+col*9,303+row*17,9,17)}
  HURDLES.forEach((distance,index)=>{
    const at=x(distance), result=race.results[index]
    if(at < -80 || at>w+80)return
    ctx.save();ctx.translate(at,ground)
    if(result?.hit)ctx.rotate(1.2)
    ctx.strokeStyle='#d7e7df';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(17,0);ctx.moveTo(0,0);ctx.lineTo(0,-45);ctx.stroke()
    ctx.fillStyle=result?.hit?'#df8e70':'#fff2d4';ctx.fillRect(-15,-49,33,9);ctx.fillStyle='#27869a';ctx.fillRect(-3,-49,9,9)
    ctx.restore()
    if(!result){ctx.fillStyle='#ffe19435';ctx.fillRect(at-130,ground+6,90,5)}
  })
  ctx.fillStyle='#173b4a45';ctx.beginPath();ctx.ellipse(runnerX,ground+4,29,7,0,0,Math.PI*2);ctx.fill()
  drawHurdler(ctx,runnerX,ground,race)
  if(race.status==='finished')for(let i=0;i<35;i++){ctx.fillStyle=['#ffe194','#b9e585','#ed9481'][i%3];ctx.fillRect((i*137)%w,20+((now/1000+i*.4)%3)*130,5,8)}
}

export default function HurdlesGame({ code, onBack, preview=false, request }) {
  const shell=useRef(null), canvas=useRef(null), race=useRef(idleHurdles()), handled=useRef(null), mounted=useRef(true), pending=useRef(null)
  const [hud,setHud]=useState(idleHurdles()), [board,setBoard]=useState(null), [message,setMessage]=useState(''), [boardError,setBoardError]=useState(''), [fullscreen,setFullscreen]=useState(false), [saving,setSaving]=useState(false)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{if(preview)return;let alive=true;request('/api/points?game=hurdles100&lifetime=true',code).then(data=>{if(alive)setBoard(current=>current?.ownBest>data.ownBest?current:data)}).catch(()=>{if(alive)setBoardError('Topplistan kunde inte hämtas.')});return()=>{alive=false}},[code,preview,request])
  const save=async(score)=>{
    const owner=race.current
    if(preview){setBoard(current=>({ownBest:Math.max(current?.ownBest||0,score),leaderboard:[]}));setMessage('Testläge – tiden sparas inte.');return}
    pending.current=score;setSaving(true);setMessage('Sparar din tid…')
    try{const data=await request('/api/points',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-game-score',gameKey:'hurdles100',score})});if(!mounted.current)return;setBoard(data);setBoardError('');if(race.current===owner){pending.current=null;setMessage('✓ Din tid är sparad.')}}catch{if(mounted.current&&race.current===owner)setMessage('Tiden kunde inte sparas. Försök igen.')}finally{if(mounted.current&&race.current===owner)setSaving(false)}
  }
  const saveCallback=useRef(save);saveCallback.current=save
  useEffect(()=>{
    let frame,lastHud=0,lastFrame=performance.now()
    const loop=(now)=>{
      const current=race.current,previous=current.status
      if(now-lastFrame>1500&&['countdown','running'].includes(current.status))current.status='paused'
      lastFrame=now;advanceHurdles(current,now)
      if(current.status==='finished'&&handled.current!==current){handled.current=current;const score=hurdleScore(current.elapsed);if(score!==null)saveCallback.current(score);else setMessage('Tiden kunde inte godkännas. Prova ett nytt lopp.')}
      if((['countdown','running'].includes(current.status)&&now-lastHud>50)||previous!==current.status){setHud({...current});lastHud=now}
      if(canvas.current)paint(canvas.current,current,now)
      frame=requestAnimationFrame(loop)
    }
    const pause=()=>{if(document.hidden&&['countdown','running'].includes(race.current.status)){race.current.status='paused';setHud({...race.current})}}
    frame=requestAnimationFrame(loop);document.addEventListener('visibilitychange',pause)
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',pause)}
  },[])
  useEffect(()=>{if(!fullscreen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const escape=(event)=>{if(event.key==='Escape')setFullscreen(false)};document.addEventListener('keydown',escape);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)}},[fullscreen])
  const start=()=>{race.current=createHurdles(performance.now());pending.current=null;setMessage('');setHud({...race.current});shell.current?.focus({preventScroll:true})}
  const input=(action)=>{hurdleInput(race.current,action,performance.now());setHud({...race.current})}
  const keyDown=(event)=>{
    const action=['Space','ArrowRight','KeyD'].includes(event.code)?'run':['ArrowUp','KeyW'].includes(event.code)?'jump':null
    if(action&&event.target.tagName!=='BUTTON'){event.preventDefault();if(!event.repeat)input(action)}
    if(fullscreen&&event.key==='Tab'){const buttons=[...shell.current.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===shell.current)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
  }
  const active=['countdown','running'].includes(hud.status), finished=hud.status==='finished'
  const next=HURDLES[hud.results.length]
  return <section className="sprint-page hurdles-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="sprint-heading"><div><p className="eyebrow">Veckans spel · Retro athletics</p><h1>100 meter häck 🏃</h1></div><span className="sprint-tag">TIO HÄCKAR. HITTA RYTMEN.</span></div><p className="sprint-intro">Tryck snabbt för fart. Hoppa strax före varje häck. En träff kostar fart – snabbaste tiden vinner!</p>
    <div className="sprint-layout"><div ref={shell} className={`sprint-shell hurdles-shell${active?' sprint-active':''}${fullscreen?' sprint-immersive':''}`} tabIndex={0} onKeyDown={keyDown} onContextMenu={event=>event.preventDefault()} aria-label="100 meter häck. Mellanslag för fart och uppåtpil för hopp.">
      <div className="sprint-toolbar"><strong>100 M<small>HÄCK</small></strong><button type="button" onClick={()=>{setFullscreen(!fullscreen);shell.current?.focus({preventScroll:true})}}>{fullscreen?'↙ Stäng':'⛶ Fullskärm'}</button></div>
      <div className="sprint-hud"><div><small>TID</small><strong>{hurdleTime(hud.elapsed)}</strong></div><div><small>FART</small><strong>{Math.round(hud.speed*3.6)}<span> km/h</span></strong></div><div><small>REN ÖVER</small><strong>{hud.cleared}<span> / 10</span></strong></div></div>
      <div className="sprint-stage"><canvas ref={canvas} width={960} height={500} aria-label="Löparbana med tio häckar och mållinje" />
        {hud.status==='countdown'&&<div className="sprint-countdown"><small>KLARA · FÄRDIGA</small><strong>{Math.max(1,Math.ceil((hud.startAt-performance.now())/1000))}</strong></div>}
        {hud.status==='running'&&hud.elapsed<650&&<div className="sprint-go">KÖR!</div>}
        {hud.status==='running'&&hud.feedback&&performance.now()-hud.feedbackAt<1100&&<div className="hurdles-feedback" role="status">{hud.feedback}</div>}
        {!active&&<div className="sprint-overlay"><p className="sprint-overlay-label">100 METER · 10 HÄCKAR</p><h2>{finished?'I mål!':hud.status==='false-start'?'Tjuvstart!':hud.status==='paused'?'Loppet avbröts':hud.status==='timeout'?'Tiden tog slut':'Hitta rytmen över häckarna'}</h2>{finished?<><strong className="sprint-finish-time">{hurdleTime(hud.elapsed)}</strong><p>{hud.cleared} rena passager · {hud.hits} häckträffar</p></>:<p>{hud.status==='false-start'?'Vänta på startsignalen.':'Tryck för fart. Hoppa i den gula zonen före häcken.'}</p>}<button type="button" disabled={saving} onClick={start}>{hud.status==='ready'?'Starta loppet':'Nytt lopp'} →</button>{message&&<small role="status">{message}</small>}{pending.current!==null&&!saving&&<button className="sprint-retry" onClick={()=>save(pending.current)}>Försök spara igen</button>}</div>}
      </div>
      <div className="sprint-progress"><span style={{width:`${hud.distance}%`}} /></div>
      <div className="hurdles-distance"><span>{Math.floor(hud.distance)} / 100 m</span><div className="hurdles-rhythm" aria-label={`${hud.cleared} rena passager, ${hud.hits} häckträffar`}>{HURDLES.map((_,index)=><i key={index} className={hud.results[index]?(hud.results[index].hit?'hit':'clear'):''} />)}</div><span>{next!==undefined?`${Math.max(0,next-hud.distance).toFixed(1).replace('.',',')} m till häck`:'Spurta i mål!'}</span></div>
      <div className="sprint-controls hurdles-controls">{[['run','SPRING','MELLANSLAG'],['jump','HOPPA','↑']].map(([action,label,key])=><button type="button" key={action} className={`sprint-step hurdles-${action}`} disabled={!active} onPointerDown={event=>{event.preventDefault();shell.current?.focus({preventScroll:true});input(action)}} onClick={event=>{if(event.detail===0)input(action)}}><strong>{label}</strong><kbd>{key}</kbd></button>)}</div><p className="sprint-hint">Tryck upprepade gånger för fart · tryck en gång för varje hopp · gul markering hjälper dig tajma</p>
    </div><aside className="sprint-records"><p className="eyebrow">100 m häck · Genom tiderna</p><h2>Snabbast över häckarna</h2><div className="sprint-own"><span>DITT PERSONBÄSTA</span><strong>{board?.ownBest?hurdleTime(HURDLE_BASE-board.ownBest):'—'}</strong></div>{preview?<p>Testläge: inga resultat eller poäng sparas.</p>:boardError?<p>{boardError}</p>:!board?<p>Laddar topplistan…</p>:board.leaderboard?.length?<ol>{board.leaderboard.map(item=><li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{hurdleTime(HURDLE_BASE-item.score)}</b></li>)}</ol>:<p>Bli först att sätta en tid!</p>}<small>Vänta på startsignalen. Hoppa cirka två meter före häcken vid hög fart. Häckträffar sänker farten men du kan fortsätta. Din snabbaste tid räknas.</small></aside></div>
  </section>
}
