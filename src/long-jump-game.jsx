import React, { useEffect, useRef, useState } from 'react'
import { drawAthlete } from './athletics-art.js'
import { createJump, advanceJump, pressJump, releaseJump, jumpMetres, JUMP_BOARD, JUMP_ZONE, validJumpScore } from './long-jump-engine.js'
import './sprint-game.css'
import './long-jump-game.css'

const ready = () => ({status:'ready',x:0,y:0,speed:0,angle:0,result:0})
function paint(canvas,jump,now) {
  const ctx=canvas.getContext('2d'),w=960,h=500
  if(!ctx)return
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#193b51');sky.addColorStop(1,'#8dc2b9');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h)
  ctx.fillStyle='#ffe2a3';ctx.beginPath();ctx.arc(820,60,28,0,Math.PI*2);ctx.fill()
  ctx.fillStyle='#284d60';ctx.fillRect(0,155,w,100)
  for(let row=0;row<5;row++)for(let col=0;col<75;col++){ctx.fillStyle=['#c6d8c6','#ebbd87','#b596bd'][(row+col)%3];ctx.fillRect(col*14,165+row*17,5,6)}
  ctx.fillStyle='#eff2da';ctx.fillRect(0,253,w,30);ctx.fillStyle='#31535b';ctx.font='bold 16px monospace';ctx.fillText('SIMKOLL ARENA / LÄNGDHOPP',40,274)
  ctx.fillStyle='#6b9a76';ctx.fillRect(0,283,w,217)
  const scale=43, camera=jump.x*scale, board=480+(JUMP_BOARD-jump.x)*scale
  ctx.fillStyle='#be6e50';ctx.fillRect(0,353,board,92)
  ctx.fillStyle='#edcb87';ctx.fillRect(Math.max(0,board),353,w,92)
  ctx.fillStyle='#f6ebce';ctx.fillRect(0,351,w,3);ctx.fillRect(0,442,w,3)
  ctx.fillStyle='#e6b364';for(let i=0;i<90;i++){const x=board+(i*97)%650;if(x>0&&x<w)ctx.fillRect(x,361+(i*23)%73,3,2)}
  ctx.fillStyle='#ffffff';ctx.fillRect(board-8,350,8,96);ctx.fillStyle='#db503e';ctx.fillRect(board,350,5,96)
  for(let m=0;m<=30;m+=2){const x=480+m*scale-camera;if(x<0||x>w)continue;ctx.fillStyle='#ffffff55';ctx.fillRect(x,353,2,91);ctx.fillStyle='#fff0cd';ctx.font='bold 17px monospace';ctx.fillText(m<JUMP_BOARD?`${JUMP_BOARD-m}m kvar`:`${m-JUMP_BOARD}m`,x+8,470)}
  if(['run','charge'].includes(jump.status)&&jump.x>=JUMP_ZONE){ctx.fillStyle='#ffe194';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillText('HÅLL → SIKTA → SLÄPP',480,315);ctx.textAlign='left'}
  if(jump.status==='landed'){ctx.fillStyle='#956c49';ctx.beginPath();ctx.ellipse(480,425,34,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffdf90';for(let i=0;i<18;i++){const t=(now/1000+i*.2)%2;ctx.fillRect(430+i*6,415-t*30,4,4)}}
  drawAthlete(ctx,480,422-jump.y*scale,jump.status==='flight'?Math.PI/2:jump.x*4,'#ffe194',jump.status==='flight'||(['run','charge'].includes(jump.status)&&jump.speed>.4),1)
  if(jump.status==='flight'){ctx.strokeStyle='#ffffff80';ctx.setLineDash([4,8]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(480-60,422-jump.y*scale+22);ctx.lineTo(480-12,422-jump.y*scale+4);ctx.stroke();ctx.setLineDash([])}
}

export default function LongJumpGame({code,onBack,preview=false,request}) {
  const shell=useRef(null),canvas=useRef(null),race=useRef(ready()),handled=useRef(null),input=useRef(null),mounted=useRef(true)
  const [hud,setHud]=useState(ready()),[attempts,setAttempts]=useState([]),[fullscreen,setFullscreen]=useState(false),[board,setBoard]=useState(null),[message,setMessage]=useState(''),[boardError,setBoardError]=useState('')
  const [saving,setSaving]=useState(false),pending=useRef(null),series=useRef(0)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{if(preview)return;let alive=true;request('/api/points?game=longjump&lifetime=true',code).then(data=>{if(alive)setBoard(current=>current?.ownBest>data.ownBest?current:data)}).catch(()=>{if(alive)setBoardError('Topplistan kunde inte hämtas.')});return()=>{alive=false}},[code,preview,request])
  const save=async(score)=>{
    const id=series.current
    if(preview){setBoard(current=>({ownBest:Math.max(current?.ownBest||0,score),leaderboard:[]}));setMessage('Testläge – inga resultat sparas.');return}
    pending.current=score;setSaving(true);setMessage('Sparar ditt bästa hopp…')
    try{const data=await request('/api/points',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-game-score',gameKey:'longjump',score})});if(!mounted.current)return;setBoard(data);setBoardError('');if(id===series.current){pending.current=null;setMessage('✓ Ditt bästa hopp är sparat.')}}catch{if(mounted.current&&id===series.current)setMessage('Resultatet kunde inte sparas. Försök igen.')}finally{if(mounted.current&&id===series.current)setSaving(false)}
  }
  const resultHandler=useRef(null)
  resultHandler.current=(jump)=>{
    const next=[...attempts,{score:jump.status==='landed'?jump.result:0,angle:Math.round(jump.angle),reason:jump.reason}]
    setAttempts(next)
    if(next.length===3){const best=Math.max(...next.map(item=>item.score));if(validJumpScore(best))save(best);else setMessage('Inget giltigt hopp – prova en ny omgång.')}
  }
  useEffect(()=>{
    let frame,lastHud=0,lastFrame=performance.now()
    const loop=(now)=>{
      const jump=race.current,previous=jump.status
      if(now-lastFrame>1500&&['run','charge','flight'].includes(jump.status)){jump.status='foul';jump.reason='Försöket avbröts när spelet lämnades.';input.current=null;jump.heldAt=null}
      lastFrame=now;advanceJump(jump,now)
      if(['landed','foul'].includes(jump.status)&&handled.current!==jump){handled.current=jump;resultHandler.current(jump);setHud({...jump})}
      else if((['run','charge','flight'].includes(jump.status)&&now-lastHud>50)||previous!==jump.status){setHud({...jump});lastHud=now}
      if(canvas.current)paint(canvas.current,jump,now)
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    const cancel=()=>{if(['run','charge','flight'].includes(race.current.status)){race.current.status='foul';race.current.reason='Försöket avbröts. Ta nästa hopp.';race.current.heldAt=null;input.current=null}}
    const hide=()=>{if(document.hidden)cancel()}
    document.addEventListener('visibilitychange',hide);window.addEventListener('blur',cancel)
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',cancel)}
  },[])
  useEffect(()=>{if(!fullscreen)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';const escape=event=>{if(event.key==='Escape')setFullscreen(false)};document.addEventListener('keydown',escape);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',escape)}},[fullscreen])
  const start=()=>{
    if(attempts.length===3){series.current++;setAttempts([]);setMessage('');pending.current=null}
    input.current=null;race.current=createJump(performance.now());setHud({...race.current});shell.current.focus({preventScroll:true})
  }
  const down=(id)=>{if(input.current!==null)return;input.current=id;pressJump(race.current,performance.now());setHud({...race.current})}
  const up=(id)=>{if(input.current!==id)return;input.current=null;releaseJump(race.current,performance.now());setHud({...race.current})}
  const cancelInput=(id)=>{if(input.current!==id)return;input.current=null;race.current.heldAt=null;if(race.current.status==='charge'){race.current.status='foul';race.current.reason='Hoppet avbröts. Ta nästa försök.'}}
  const keys=(event)=>{
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)down('keyboard')}
    if(fullscreen&&event.key==='Tab'){const buttons=[...shell.current.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===shell.current)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
  }
  const active=['run','charge','flight'].includes(hud.status),complete=attempts.length===3,best=Math.max(0,...attempts.map(item=>item.score))
  return <section className="sprint-page jump-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="sprint-heading"><div><p className="eyebrow">Veckans spel · Retro athletics</p><h1>Längdhopp <span>🏅</span></h1></div><span className="sprint-tag">TRE FÖRSÖK. ETT PERSONBÄSTA.</span></div><p className="sprint-intro">Tryck snabbt för fart. Håll inne nära plankan. Släpp vid 45°!</p>
    <div className="sprint-layout"><div ref={shell} className={`sprint-shell jump-shell${active?' sprint-active':''}${fullscreen?' sprint-immersive':''}`} tabIndex={0} onKeyDown={keys} onKeyUp={event=>{if(event.code==='Space'){event.preventDefault();up('keyboard')}}} aria-label="Längdhopp. Tryck och håll mellanslag eller använd hoppknappen.">
      <div className="sprint-toolbar"><strong>LÄNGD<small>HOPP</small></strong><button type="button" onClick={()=>{setFullscreen(!fullscreen);shell.current.focus({preventScroll:true})}}>{fullscreen?'↙ Stäng':'⛶ Fullskärm'}</button></div>
      <div className="sprint-hud"><div><small>FÖRSÖK</small><strong>{Math.min(3,attempts.length+(active?1:0))||1}<span> / 3</span></strong></div><div><small>FART</small><strong>{Math.round(hud.speed*3.6)}<span> km/h</span></strong></div><div><small>BÄSTA HOPP</small><strong>{best?jumpMetres(best):'—'}</strong></div></div>
      <div className="sprint-stage"><canvas ref={canvas} width={960} height={500} aria-label="Ansatsbana, vit upphoppsplanka och sandgrop" />
        {!active&&<div className="sprint-overlay"><p className="sprint-overlay-label">{complete?'OMGÅNGEN KLAR':`FÖRSÖK ${attempts.length||1} / 3`}</p><h2>{hud.status==='ready'?'Hur långt kan du hoppa?':complete?'Ditt bästa hopp':hud.status==='foul'?'Ogiltigt hopp':'Snyggt landat!'}</h2>{(complete?best:hud.result)>0?<strong className="sprint-finish-time">{jumpMetres(complete?best:hud.result)}</strong>:<p>{hud.reason||'Bygg fart. Sikta på 45°. Undvik övertramp.'}</p>}{hud.status==='landed'&&!complete&&<small>Upphoppsvinkel: {Math.round(hud.angle)}°</small>}<button type="button" disabled={saving} onClick={start}>{hud.status==='ready'?'Starta ansatsen':complete?'Ny omgång':'Nästa försök'} →</button>{message&&<small role="status">{message}</small>}{pending.current!==null&&!saving&&<button className="sprint-retry" onClick={()=>save(pending.current)}>Försök spara igen</button>}</div>}
      </div>
      <div className={`jump-angle${hud.status==='charge'?' charging':''}`}><div><span>{hud.status==='run'?`${Math.max(0,JUMP_BOARD-hud.x).toFixed(1).replace('.',',')} m till plankan`:'UPPHOPPSVINKEL'}</span><strong>{Math.round(hud.angle)}°</strong></div><div className="jump-angle-track"><span className="jump-angle-target"/><i style={{left:`${hud.angle/90*100}%`}}/></div><small>0° <b>45° · perfekt</b> 90°</small></div>
      <div className="jump-controls"><button type="button" className={`sprint-step jump-button${hud.heldAt!==null&&active?' stepped':''}`} disabled={!active||hud.status==='flight'} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);shell.current.focus({preventScroll:true});down(event.pointerId)}} onPointerUp={event=>up(event.pointerId)} onPointerCancel={event=>cancelInput(event.pointerId)} onLostPointerCapture={event=>cancelInput(event.pointerId)} aria-label="Ansats och upphopp"><strong>{hud.status==='charge'?'SLÄPP VID 45°':hud.status==='flight'?'FLYG!':hud.x>=JUMP_ZONE?'HÅLL FÖR UPPHOPP':'TRYCK SNABBT'}</strong><kbd>MELLANSLAG</kbd></button></div>
      <div className="jump-attempts" aria-label="Dina tre hopp">{[0,1,2].map(index=><span key={index}>{index+1} <b>{attempts[index]?(attempts[index].score?jumpMetres(attempts[index].score):'Övertramp / ogiltigt'):'—'}</b></span>)}</div>
    </div><aside className="sprint-records"><p className="eyebrow">Längdhopp · Genom tiderna</p><h2>Längst i sanden</h2><div className="sprint-own"><span>DITT PERSONBÄSTA</span><strong>{board?.ownBest?jumpMetres(board.ownBest):'—'}</strong></div>{preview?<p>Testläge: inga resultat eller poäng sparas.</p>:boardError?<p>{boardError}</p>:!board?<p>Laddar topplistan…</p>:board.leaderboard?.length?<ol>{board.leaderboard.map(item=><li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{jumpMetres(item.score)}</b></li>)}</ol>:<p>Bli först att sätta ett hopp!</p>}<small>Det längsta giltiga hoppet av tre räknas. 45° är spelets idealvinkel. Hoppa nära plankan utan att passera den.</small></aside></div>
  </section>
}
