import React, { useEffect, useRef, useState } from 'react'
import { paintHurdles } from './hurdles-art.js'
import { HURDLES, HURDLE_BASE, idleHurdles, createHurdles, advanceHurdles, hurdleInput, hurdleScore, hurdleTime } from './hurdles-engine.js'
import './sprint-game.css'
import './hurdles-game.css'

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
      if(canvas.current)paintHurdles(canvas.current,current,now)
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
      <div className="sprint-controls hurdles-controls">{[['jump','HOPPA','↑'],['run','SPRING','MELLANSLAG']].map(([action,label,key])=><button type="button" key={action} className={`sprint-step hurdles-${action}`} disabled={!active} onPointerDown={event=>{event.preventDefault();shell.current?.focus({preventScroll:true});input(action)}} onClick={event=>{if(event.detail===0)input(action)}}><strong>{label}</strong><kbd>{key}</kbd></button>)}</div><p className="sprint-hint">Tryck upprepade gånger för fart · tryck en gång för varje hopp · gul markering hjälper dig tajma</p>
    </div><aside className="sprint-records"><p className="eyebrow">100 m häck · Genom tiderna</p><h2>Snabbast över häckarna</h2><div className="sprint-own"><span>DITT PERSONBÄSTA</span><strong>{board?.ownBest?hurdleTime(HURDLE_BASE-board.ownBest):'—'}</strong></div>{preview?<p>Testläge: inga resultat eller poäng sparas.</p>:boardError?<p>{boardError}</p>:!board?<p>Laddar topplistan…</p>:board.leaderboard?.length?<ol>{board.leaderboard.map(item=><li key={item.profileId}><span>{item.emoji}</span><strong>{item.displayName}</strong><b>{hurdleTime(HURDLE_BASE-item.score)}</b></li>)}</ol>:<p>Bli först att sätta en tid!</p>}<small>Vänta på startsignalen. Hoppa cirka två meter före häcken vid hög fart. Häckträffar sänker farten men du kan fortsätta. Din snabbaste tid räknas.</small></aside></div>
  </section>
}
