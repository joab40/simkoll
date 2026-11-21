import React,{Component,useCallback,useEffect,useRef,useState} from 'react'
import {Canvas} from '@react-three/fiber'
import SnowRiderScene from './snow-rider-scene.jsx'
import {advanceSnow,createSnowGame,jumpSnow,pauseSnow,resumeSnow,snowUpcomingChallenge,startSnow,validSnowScore,SNOW_SECONDS,SNOW_STEERING_LIMIT} from './snow-rider-engine.js'
import {enterBalanceFullscreen,exitBalanceFullscreen} from './balance-fullscreen.js'
import './snow-rider-game.css'

class SnowGraphicsBoundary extends Component{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(){this.props.onFailure()}
  render(){return this.state.failed?<div className="snow-graphics-fallback">3D-vyn kunde inte startas. Prova att ladda 3D-vyn igen eller använd en annan webbläsare.</div>:this.props.children}
}
const DIRECTION_CUES = {left: '← Sikta vänster', middle: '↕ Sikta i mitten', right: 'Sikta höger →'}

function snapshot(game) {
  const next = snowUpcomingChallenge(game)
  const remaining = next ? next.s - game.distance : Infinity
  const challenge = remaining <= 55 ? next.challenge : null
  const jumpNow = challenge === 'jump' && remaining <= game.speed * .52
  return {
    status: game.status, elapsed: game.elapsed, distance: Math.floor(game.distance),
    score: game.score, gems: game.gems, reason: game.reason, speed: Math.round(game.speed * 3.6),
    cue: challenge === 'jump' ? (jumpNow ? '↑ Hoppa nu' : '↑ Bom framför dig') : DIRECTION_CUES[challenge],
    jumpNow,
  }
}
export default function SnowRiderGame({code,onBack,preview=false,request}){
  const model=useRef(createSnowGame()),input=useRef(new Map()),shell=useRef(),fullButton=useRef(),mounted=useRef(true),saveLock=useRef(false),pending=useRef(null),savedRound=useRef(false),fullscreenBusy=useRef(false)
  const [view,setView]=useState(()=>snapshot(model.current)),[best,setBest]=useState(0),[board,setBoard]=useState(null),[boardError,setBoardError]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[fullscreen,setFullscreen]=useState(null),[graphicsError,setGraphicsError]=useState(false),[graphicsKey,setGraphicsKey]=useState(0),[graphicsReady,setGraphicsReady]=useState(false)
  const [effects,setEffects]=useState(()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const clearInput=useCallback(()=>{input.current.clear();model.current.jumpQueued=false},[])
  const pause=useCallback(()=>{clearInput();pauseSnow(model.current);setView(snapshot(model.current))},[clearInput])
  const graphicsLost=useCallback(()=>{pause();setGraphicsError(true)},[pause])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearInput()}},[clearInput])
  const loadBoard=useCallback(async()=>{if(preview)return;setBoardError('');try{const result=await request('/api/points?game=snowrider',code);if(mounted.current){setBoard(result);setBest(result.ownBest||0)}}catch{if(mounted.current)setBoardError('Topplistan kunde inte hämtas. Du kan fortfarande spela.')}},[code,preview,request])
  useEffect(()=>{loadBoard()},[loadBoard])
  const save=useCallback(async()=>{
    if(preview||!pending.current||saveLock.current)return
    saveLock.current=true;setSaving(true);setMessage('Sparar ditt spelresultat…')
    try{const result=await request('/api/points',code,{method:'POST',retry:false,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-game-score',gameKey:'snowrider',score:pending.current})});pending.current=null;if(mounted.current){setBoard(result);setBest(value=>Math.max(value,result.ownBest||0));setMessage('Spelresultatet är sparat ✓')}}catch{if(mounted.current)setMessage('Resultatet kunde inte sparas. Försök igen eller spela utan att spara.')}finally{saveLock.current=false;if(mounted.current)setSaving(false)}
  },[code,preview,request])
  useEffect(()=>{
    if(!['over','complete'].includes(view.status)||savedRound.current)return
    savedRound.current=true
    if(preview){setBest(value=>Math.max(value,view.score));setMessage('Testläge: resultatet finns bara i den här testomgången.');return}
    if(validSnowScore(view.score)){pending.current=view.score;save()}
    else setMessage('Åk en liten bit till för att sätta ett rekord.')
  },[view.status,view.score,preview,save])
  useEffect(()=>{
    if(view.status!=='playing')return
    let frame,last=0,lastHud=0
    const loop=now=>{
      if(last&&now-last>750){pause();return}
      const delta=last?(now-last)/1000:0;last=now
      const values=[...input.current.values()],steer=(values.includes('right')?1:0)-(values.includes('left')?1:0)
      advanceSnow(model.current,delta,steer)
      if(now-lastHud>90||model.current.status!=='playing'){lastHud=now;setView(snapshot(model.current))}
      if(model.current.status==='playing')frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop);return()=>cancelAnimationFrame(frame)
  },[view.status,pause])
  useEffect(()=>{const hide=()=>{if(document.hidden)pause()};window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hide);return()=>{window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hide)}},[pause])
  const focusCourse = () => {
    if (!fullscreen && window.matchMedia?.('(max-width: 700px)').matches) {
      shell.current?.scrollIntoView({block: 'start', behavior: 'instant'})
    }
    shell.current?.focus({preventScroll: true})
  }
  const start=()=>{if(saveLock.current||pending.current||graphicsError||!graphicsReady)return;clearInput();model.current=startSnow(createSnowGame());savedRound.current=false;setMessage('');setView(snapshot(model.current));focusCourse()}
  const resume=()=>{clearInput();resumeSnow(model.current);setView(snapshot(model.current));focusCourse()}
  const press=(token,action)=>{if(model.current.status!=='playing')return;if(action==='jump')jumpSnow(model.current);else input.current.set(token,action)}
  const pointerDown=(event,action)=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);shell.current?.focus({preventScroll:true});press(`p${event.pointerId}`,action)}
  const releasePointer=event=>{input.current.delete(`p${event.pointerId}`)}
  const keyDown=event=>{
    if(event.key==='Tab'&&fullscreen){const buttons=[...shell.current.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&[shell.current,first].includes(document.activeElement)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}return}
    if(event.code==='KeyP'&&!event.repeat){event.preventDefault();model.current.status==='paused'?resume():pause();return}
    if(event.target.tagName==='BUTTON'&&!event.target.dataset.snowControl)return
    const action=({ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'jump',ArrowUp:'jump',KeyW:'jump'})[event.code]
    if(action){event.preventDefault();if(!event.repeat)press(event.code,action)}
  }
  const closeFullscreen=useCallback(async()=>{pause();await exitBalanceFullscreen(shell.current,document).catch(()=>{});if(mounted.current){setFullscreen(null);fullButton.current?.focus({preventScroll:true})}},[pause])
  const toggleFullscreen=async()=>{if(fullscreenBusy.current)return;fullscreenBusy.current=true;pause();const target=shell.current;try{if(fullscreen)await closeFullscreen();else{const mode=await enterBalanceFullscreen(target,document);if(mounted.current)setFullscreen(mode);else await exitBalanceFullscreen(target,document).catch(()=>{})}}finally{fullscreenBusy.current=false}}
  useEffect(()=>{const target=shell.current,sync=()=>{if((document.fullscreenElement||document.webkitFullscreenElement)!==target){pause();setFullscreen(value=>value==='native'?null:value)}};document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('webkitfullscreenchange',sync);exitBalanceFullscreen(target,document).catch(()=>{})}},[pause])
  useEffect(()=>{
    if(!fullscreen)return
    const previous=document.body.style.overflow;document.body.style.overflow='hidden'
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();closeFullscreen()}}
    document.addEventListener('keydown',escape);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)}
  },[fullscreen,closeFullscreen])
  const finished=['over','complete'].includes(view.status)
  const control=(action,label,icon)=><button type="button" data-snow-control={action} className={`snow-control ${action}`} disabled={view.status!=='playing'} aria-label={label} onPointerDown={event=>pointerDown(event,action)} onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer} onContextMenu={event=>event.preventDefault()} onClick={event=>{if(event.detail===0)action==='jump'?jumpSnow(model.current):model.current.x=Math.max(-SNOW_STEERING_LIMIT,Math.min(SNOW_STEERING_LIMIT,model.current.x+(action==='left'?-.8:.8)))}}><b aria-hidden="true">{icon}</b><span>{label}</span></button>
  return <section className="snow-page"><button type="button" className="back-button inline" onClick={onBack}>← Tillbaka</button><header className="snow-heading"><div><p className="eyebrow">Simkoll arcade · vinteredition</p><h1>Snow <em>Rider</em><span>3D</span></h1><p>Störtbacke med tvära kurvor, krön och hinder.</p></div><span className="snow-mode">{preview?'🧪 Testläge · inget sparas':'🏔 Din egen vintertur'}</span></header>
    <div className="snow-layout"><div ref={shell} tabIndex={0} className={`snow-shell ${fullscreen?'snow-fullscreen '+fullscreen:''}`} onKeyDown={keyDown} onKeyUp={event=>input.current.delete(event.code)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))clearInput()}} aria-label="Snow Rider. Vänster och höger styr, mellanslag hoppar, P pausar.">
      <div className="snow-toolbar"><strong>SIMKOLL <span>FROSTFJÄLL</span></strong><div><button type="button" onClick={()=>setEffects(value=>!value)} aria-pressed={effects}>{effects?'❄ Effekter på':'❄ Effekter av'}</button><button type="button" onClick={pause} disabled={view.status!=='playing'}>Ⅱ Paus</button><button type="button" ref={fullButton} onClick={toggleFullscreen}>{fullscreen?'↙ Stäng':'⛶ Fullskärm'}</button></div></div>
      <div className="snow-stage"><SnowGraphicsBoundary key={graphicsKey} onFailure={graphicsLost}><Canvas aria-label="Snöbana med pulka, granar och kristaller" dpr={[1,1.5]} shadows camera={{fov:58,position:[0,3.8,10.5],near:.1,far:420}} gl={{antialias:true,powerPreference:'high-performance'}} frameloop={view.status==='playing'?'always':'demand'} onCreated={()=>setGraphicsReady(true)} fallback={<div className="snow-graphics-fallback" aria-hidden={graphicsReady}>Din webbläsare behöver WebGL för att visa 3D-spelet.</div>}><SnowRiderScene model={model} effects={effects} onContextLost={graphicsLost}/></Canvas></SnowGraphicsBoundary>
        <div className="snow-hud"><div><small>POÄNG</small><strong>{view.score.toLocaleString('sv-SE')}</strong></div><div><small>KRISTALLER</small><strong>◆ {view.gems}</strong></div><div><small>SPELSTRÄCKA</small><strong>{view.distance.toLocaleString('sv-SE')} <em>m</em></strong></div></div><div className="snow-course-label">NORDIC RUN <i/> {view.speed} km/h</div>
        {view.status === 'playing' && view.cue && <div className={`snow-cue${view.jumpNow ? ' now' : ''}`}>{view.cue}</div>}
        {graphicsError?<div className="snow-overlay"><div><p className="snow-kicker">3D-VYN PAUSAD</p><h2>Vi tappade bilden.</h2><p>Webbläsaren kunde inte behålla 3D-vyn. Pågående åk är pausat. Tidigare sparade rekord påverkas inte.</p>{pending.current&&!saving&&<button onClick={save}>Försök spara ditt avslutade åk igen</button>}<button className="snow-primary" disabled={saving||!!pending.current} onClick={()=>{clearInput();model.current=createSnowGame();setView(snapshot(model.current));setGraphicsError(false);setGraphicsReady(false);setGraphicsKey(key=>key+1)}}>Ladda 3D-vyn igen</button></div></div>:view.status!=='playing'&&<div className="snow-overlay"><div><p className="snow-kicker">{finished?'DIN VINTERTUR':view.status==='paused'?'ANDAS UT EN STUND':'FROSTFJÄLL · BANA 01'}</p><h2>{finished?(view.status==='complete'?'Vilken åktur!':'En sväng till?'):view.status==='paused'?'Backen väntar.':<>Kör<br/><em>störtbacken.</em></>}</h2>{finished?<><strong className="snow-result">{view.score.toLocaleString('sv-SE')} <small>poäng</small></strong><p>{view.elapsed.toLocaleString('sv-SE', {maximumFractionDigits: 1, minimumFractionDigits: 1})} sek · {view.distance} spelmeter · {view.gems} kristaller<br/>{view.reason}</p></>:<p>Hoppa över bommarna och sikta på öppningarna i isvallarna.</p>}
          {view.status==='paused'?<button className="snow-primary" onClick={resume}>Fortsätt åka →</button>:<button className="snow-primary" disabled={saving||!!pending.current||!graphicsReady} onClick={start}>{finished?'Åk igen':'Starta åket'} <span>↗</span></button>}<small>{finished?message:'← → styr · mellanslag hoppar · max 2 minuter'}</small>{finished&&pending.current&&!saving&&<div className="snow-save-actions"><button onClick={save}>Försök spara igen</button><button onClick={()=>{pending.current=null;start()}}>Åk utan att spara</button></div>}</div></div>}
      </div><div className="snow-controls">{control('left','Vänster','←')}{control('jump','Hoppa','↑')}{control('right','Höger','→')}</div><div className="snow-bottomline"><span>❄ STYR · HOPPA · HITTA FLYTET</span><span>{Math.ceil(Math.max(0,SNOW_SECONDS-view.elapsed))} s kvar</span></div>
    </div><aside className="snow-aside"><p className="eyebrow">Din rekordjakt</p><h2>Lite längre.<br/>Lite snyggare.</h2><div className="snow-own"><small>{preview?'BÄST I DENNA TESTSESSION':'DITT VECKOBÄSTA'}</small><strong>{best||'—'}</strong><span>spelpoäng</span></div><p>Varje spelmeter ger 1 poäng. En gyllene kristall ger +25. Första krocken avslutar åket.</p><p>Bromsar finns inte. Lär dig var bommarna kommer och byt sida i tid inför isvallarna.</p>{preview?<p className="snow-record-note">Testläge: inga API-anrop, sparade rekord eller poäng till Simkolls nivåsystem.</p>:<><h3>Veckans åkare</h3>{boardError?<p role="status">{boardError} <button onClick={loadBoard}>Hämta igen</button></p>:board?.leaderboard?.length?<ol>{board.leaderboard.map(row=><li key={row.profileId}><span>{row.emoji} {row.displayName}</span><b>{row.score}</b></li>)}</ol>:<p>{board?'Första spåret är ditt.':'Hämtar veckans rekord…'}</p>}<p className="snow-record-note">Spelmeter och spelpoäng är bara för spelet. De påverkar inte träning, närvaro eller din nivå.</p></>}<small>Spelet pausar om du lämnar fliken. Minska snöeffekterna med knappen ovanför backen.</small></aside></div>
  </section>
}
