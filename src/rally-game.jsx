import React, { useCallback, useEffect, useRef, useState } from 'react'
import { advanceRally, createRallyGame, recoverRallyCar, finishRallyReplay, validRallyScore, RALLY_TRACKS, RALLY_LAPS } from './rally-engine.js'
import { loadRallyGhost, keepFasterRallyGhost, saveRallyGhost } from './rally-ghost.js'
import { drawRally } from './rally-art.js'
import { guardRallyTouches } from './rally-touch.js'
import { requestWeeklyGhost } from './rally-weekly-client.js'
import { rallyWeekStart } from '../shared/rally-weekly.js'
import { enterBalanceFullscreen as enterFullscreen, exitBalanceFullscreen as exitFullscreen } from './balance-fullscreen.js'
import './rally-game.css'

const timeText = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5,'0')}`
const snapshot = game => ({ elapsed: game.elapsed, rank: game.rank, laps: game.cars[0].laps, missedGate: game.cars[0].missedGate, speed: game.cars[0].speed, offroad: game.cars[0].offroad, boost: game.cars[0].boost, score: game.score, bestLap: game.cars[0].bestLap, countdown: Math.ceil(game.countdown), status: game.status })

const browserStorage = () => { try { return window.localStorage } catch { return null } }

export default function RallyGame({ code, profileId, onBack, preview = false, request }) {
  const canvas = useRef(null), area = useRef(null), fullscreenButton = useRef(null)
  const game = useRef(null); if(!game.current) game.current = createRallyGame()
  const keys = useRef(new Map()), pointers = useRef(new Map()), mounted = useRef(false), saveLock = useRef(false), version = useRef(0), fullscreenLock = useRef(false), reduced = useRef(false)
  const [phase,setPhase] = useState('ready'), [run,setRun] = useState(0), stage = 0
  const [ghost,setGhost] = useState(()=>preview ? null : loadRallyGhost(browserStorage(),profileId))
  const bestGhost = useRef(ghost), raceGhost = useRef(ghost), ghostVisible = useRef(true)
  const [showGhost,setShowGhost] = useState(true), [ghostWarning,setGhostWarning] = useState(false), [newBest,setNewBest] = useState(false)
  const raceWeekly = useRef(null), raceWeek = useRef(null), weeklyVisible = useRef(true), weeklyVersion = useRef(0), startLock = useRef(false), weeklyLock = useRef(false), pendingWeekly = useRef(null)
  const [weekly,setWeekly] = useState(null), [weeklyLoading,setWeeklyLoading] = useState(false), [weeklyError,setWeeklyError] = useState(''), [weeklySaveError,setWeeklySaveError] = useState('')
  const [showWeekly,setShowWeekly] = useState(true), [weeklySaving,setWeeklySaving] = useState(false), [starting,setStarting] = useState(false)
  const [view,setView] = useState(()=>snapshot(game.current)), [held,setHeld] = useState({}), [full,setFull] = useState(null)
  const [board,setBoard] = useState(null), [boardError,setBoardError] = useState(false), [saving,setSaving] = useState(false), [saveError,setSaveError] = useState(false), [message,setMessage] = useState('')
  const release = useCallback(()=>{keys.current.clear();pointers.current.clear();setHeld({})},[])
  const pause = useCallback(()=>{release();setPhase(current=>current==='running'?'paused':current)},[release])
  const draw = useCallback(()=>drawRally(canvas.current,game.current,{reducedMotion:reduced.current,ghost:ghostVisible.current?raceGhost.current:null,weeklyGhost:weeklyVisible.current?raceWeekly.current:null}),[])
  const loadWeekly = useCallback(async()=>{
    if(preview)return null
    const current=++weeklyVersion.current;setWeeklyLoading(true);setWeeklyError('')
    try {
      const result=await requestWeeklyGhost(request,code)
      if(!mounted.current||current!==weeklyVersion.current)return null
      setWeekly(result);return result
    } catch(error) {if(mounted.current&&current===weeklyVersion.current){setWeekly(null);setWeeklyError(error.message||'Veckans ghost kunde inte hämtas.')}}
    finally {if(mounted.current&&current===weeklyVersion.current)setWeeklyLoading(false)}
    return null
  },[code,preview,request])
  const loadBoard = useCallback(async()=>{
    if(preview)return
    const current=++version.current;setBoardError(false)
    try {
      const result=await request('/api/points?game=rally&lifetime=true',code)
      if(!mounted.current||current!==version.current)return
      setBoard(result)
    } catch {if(mounted.current&&current===version.current)setBoardError(true)}
  },[code,preview,request])
  useEffect(()=>{
    mounted.current=true;loadBoard();loadWeekly();draw()
    const preference=matchMedia('(prefers-reduced-motion: reduce)'), change=()=>{reduced.current=preference.matches;draw()}
    change();preference.addEventListener('change',change)
    const resize=new ResizeObserver(draw);resize.observe(canvas.current)
    return ()=>{mounted.current=false;version.current++;weeklyVersion.current++;resize.disconnect();preference.removeEventListener('change',change)}
  },[loadBoard,loadWeekly,draw])
  const save = useCallback(async score=>{
    if(preview||!validRallyScore(score)||saveLock.current)return
    saveLock.current=true;setSaving(true);setSaveError(false);setMessage('Sparar ditt rallyresultat…')
    try {
      await request('/api/points',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-game-score',gameKey:'rally',score})})
      if(mounted.current){setMessage('✓ Sparat! Ditt bästa rallyresultat räknas.');setBoard(old=>({...old,ownBest:Math.max(old?.ownBest||0,score)}));loadBoard()}
    }catch{if(mounted.current){setSaveError(true);setMessage('Resultatet kunde inte sparas. Försök igen eller välj uttryckligen att fortsätta utan att spara.')}}
    finally{saveLock.current=false;if(mounted.current)setSaving(false)}
  },[code,preview,request,loadBoard])
  const saveWeekly = useCallback(async()=>{
    if(preview||weeklyLock.current||!pendingWeekly.current)return
    weeklyLock.current=true;setWeeklySaving(true);setWeeklySaveError('')
    try {
      const result=await requestWeeklyGhost(request,code,pendingWeekly.current)
      if(mounted.current){weeklyVersion.current++;setWeekly(result);setWeeklyError('');setWeeklyLoading(false);pendingWeekly.current=null}
    } catch(error) {if(mounted.current)setWeeklySaveError(error.message||'Din veckoghost kunde inte delas. Det vanliga rallyresultatet sparas separat.')}
    finally {weeklyLock.current=false;if(mounted.current)setWeeklySaving(false)}
  },[code,preview,request])
  const shareGhost = useCallback(candidate=>{
    const context=raceWeek.current
    if(preview||!candidate||!context?.active)return
    const pending=pendingWeekly.current
    pendingWeekly.current={weekStart:context.weekStart,replay:pending?.weekStart===context.weekStart&&pending.replay.duration<candidate.duration?pending.replay:candidate}
    saveWeekly()
  },[preview,saveWeekly])
  const keepGhost = useCallback(()=>{
    const candidate=finishRallyReplay(game.current)
    const previous=preview?bestGhost.current:keepFasterRallyGhost(bestGhost.current,loadRallyGhost(browserStorage(),profileId))
    const best=keepFasterRallyGhost(previous,candidate)
    bestGhost.current=best;setGhost(best);setNewBest(best===candidate)
    if(best===candidate&&!preview)setGhostWarning(!saveRallyGhost(browserStorage(),profileId,best))
    return candidate
  },[preview,profileId])
  useEffect(()=>{
    if(phase!=='running')return
    let frame=0,last=null,nextHud=0
    const tick=now=>{
      const controls=[...keys.current.values(),...pointers.current.values()]
      advanceRally(game.current,last===null?0:(now-last)/1000,{steer:Number(controls.includes('right'))-Number(controls.includes('left'))});last=now;draw()
      if(now>=nextHud||['finished','timeout'].includes(game.current.status)){setView(snapshot(game.current));nextHud=now+80}
      if(['finished','timeout'].includes(game.current.status)){
        release();setPhase(game.current.status)
        if(game.current.status==='finished'){
          const candidate=keepGhost();save(game.current.score);shareGhost(candidate)
        }
        return
      }
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    const hide=()=>{if(document.hidden)pause()}
    window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hide)
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hide)}
  },[phase,run,draw,pause,release,save,keepGhost,shareGhost])
  const start = async()=>{
    if(saveLock.current||weeklyLock.current||startLock.current||saveError)return
    startLock.current=true;setStarting(true);release();setPhase('paused')
    try {
      const next=preview?null:await loadWeekly()
      if(!mounted.current)return
      // Freeze this rival for the whole race. Uploads/load responses only update
      // next race's sidebar; they never replace a car during an ongoing race.
      raceWeekly.current=next?.active?next.leader:null
      raceWeek.current={weekStart:next?.weekStart||rallyWeekStart(),active:!preview&&next?.active!==false}
      raceGhost.current=bestGhost.current;game.current=createRallyGame();setRun(value=>value+1);setNewBest(false);setView(snapshot(game.current));setMessage('');setPhase('running');canvas.current?.focus({preventScroll:true});draw()
    } finally {startLock.current=false;if(mounted.current)setStarting(false)}
  }
  const updateHeld=()=>{const values=[...keys.current.values(),...pointers.current.values()];setHeld(Object.fromEntries(['left','right'].map(name=>[name,values.includes(name)])))}
  const press=(event,control)=>{if(phase!=='running')return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,control);updateHeld()}
  const lift=event=>{pointers.current.delete(event.pointerId);updateHeld()}
  const keyboard=(event,down)=>{
    if(event.target.closest('input,select,textarea'))return
    if(down&&full&&event.key==='Tab'){
      const controls=[...area.current.querySelectorAll('button:not([disabled]), canvas[tabindex="0"]')],first=controls[0],last=controls.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      return
    }
    if(down&&event.code==='KeyP'){event.preventDefault();pause();return}
    const button=event.target.closest('button'), control=(['Space','Enter'].includes(event.code)&&button?.dataset.drive)||({ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'}[event.code])
    if(!control||phase!=='running'||(button&&!button.dataset.drive&&['Space','Enter'].includes(event.code)))return
    event.preventDefault();if(down)keys.current.set(event.code,control);else keys.current.delete(event.code);updateHeld()
  }
  const closeFull=useCallback(async()=>{pause();try{await exitFullscreen(area.current,document)}catch{return}if(mounted.current){setFull(null);fullscreenButton.current?.focus({preventScroll:true})}},[pause])
  const toggleFull=async()=>{
    if(fullscreenLock.current)return
    fullscreenLock.current=true;pause()
    try{if(full)await closeFull();else{const target=area.current,mode=await enterFullscreen(target,document);if(mounted.current)setFull(mode);else await exitFullscreen(target,document)}}
    finally{fullscreenLock.current=false}
  }
  useEffect(()=>{
    const target=area.current
    const changed=()=>{if((document.fullscreenElement||document.webkitFullscreenElement)===target)setFull('native');else{pause();setFull(value=>value==='native'?null:value)}}
    document.addEventListener('fullscreenchange',changed);document.addEventListener('webkitfullscreenchange',changed)
    return ()=>{document.removeEventListener('fullscreenchange',changed);document.removeEventListener('webkitfullscreenchange',changed);exitFullscreen(target,document).catch(()=>{})}
  },[pause])
  useEffect(()=>{
    if(!full)return
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';fullscreenButton.current?.focus({preventScroll:true})
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();closeFull()}}
    document.addEventListener('keydown',escape)
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)}
  },[full,closeFull])
  useEffect(()=>guardRallyTouches(area.current,release),[release])
  const racing=phase==='running'&&!starting, finished=phase==='finished', busy=saving||weeklySaving||starting
  const recover=()=>{release();recoverRallyCar(game.current);setView(snapshot(game.current));draw();canvas.current?.focus({preventScroll:true})}
  return <section className="rally-page" onKeyDown={event=>keyboard(event,true)} onKeyUp={event=>keyboard(event,false)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))release()}}>
    <button className="back-button inline" disabled={busy} onClick={onBack}>← Tillbaka</button>
    <header className="rally-heading"><div><p className="eyebrow">Veckans spel · hitta din racinglinje</p><h1>Simkoll Kustrally <span aria-hidden="true">🏎️</span></h1><p>Tre varv. Fyra bilar. Din rytm genom kurvorna.</p></div><span>{preview?'Testläge · inget resultat sparas':'En liten paus mellan passen'}</span></header>
    <div className="rally-layout"><div ref={area} className={`rally-main${full?' rally-fullscreen':''}`} role={full?'dialog':undefined} aria-modal={full?true:undefined} aria-label={full?'Kustrally i fullskärm':undefined}>
      <div className="rally-toolbar"><span>{RALLY_TRACKS[stage].name}</span><div><button type="button" className="secondary-button" disabled={!racing} onClick={pause} aria-label="Pausa rallyt">Ⅱ</button><button type="button" className="secondary-button" disabled={phase==='ready'||busy||saveError} onClick={start} aria-label="Starta om loppet">↻ Börja om</button><button type="button" ref={fullscreenButton} className="secondary-button" onClick={toggleFull}>{full?'↙ Lämna fullskärm':'⛶ Fullskärm'}</button></div></div>
      <div className="rally-hud"><div><small>Placering</small><strong>{view.rank}<span> / 4</span></strong></div><div><small>Racetid</small><strong>{timeText(view.elapsed)}</strong></div><div><small>Fart</small><strong>{Math.round(view.speed*.35)}<span> km/h</span></strong></div></div>
      {racing&&view.missedGate&&<div className="rally-course-warning" role="alert"><span>Kontrollpunkt missad — återgå för att fortsätta varvet.</span><button type="button" className="secondary-button" onClick={recover}>Återgå · +3 s</button></div>}
      <div className="rally-stage"><canvas ref={canvas} tabIndex="0" aria-label="Kustrally. Bilen gasar själv. Styr med vänster/höger eller A/D. P pausar." />
        {phase!=='running'&&<div className="rally-overlay"><div><span className="rally-flag" aria-hidden="true">{finished?'🏁':phase==='paused'?'Ⅱ':'↗'}</span><p className="rally-kicker">{RALLY_TRACKS[stage].name}</p><h2>{phase==='ready'?'Hitta flytet. Ta kurvan.':phase==='paused'?'En paus i depån':phase==='timeout'?'Tillbaka till depån':view.rank===1?'Först över linjen!':`I mål på plats ${view.rank}`}</h2><p>{phase==='ready'?'Bilen gasar själv. Styr genom de mjuka kurvorna och sikta på blå boostplattor. Tre hela varv tar dig i mål.':phase==='paused'?'Klockan står still. Fortsätt när du är redo.':phase==='timeout'?'Tiden tog slut. Testa korta styrtag och håll dig på asfalten. Inget resultat sparas.':`${timeText(view.elapsed)} · ${view.score.toLocaleString('sv-SE')} rallypoäng${view.bestLap?' · Bästa varv '+timeText(view.bestLap):''}`}</p>
          {finished&&newBest&&<p className="rally-unlocked">✓ Ny bästa tid! Ghosten väntar i nästa race.</p>}
          <button type="button" className="primary-button" disabled={busy||saveError} onClick={()=>phase==='paused'?(release(),setPhase('running'),canvas.current?.focus({preventScroll:true})):start()}>{starting?'Hämtar veckans ghost…':saving||weeklySaving?'Sparar…':phase==='ready'?'Till start →':phase==='paused'?'Fortsätt köra →':'Kör igen →'}</button>
        </div></div>}
      </div>
      <div className="rally-controls" role="group" aria-label="Bilens kontroller">{[['left','←','Vänster'],['right','→','Höger']].map(([control,icon,label])=><button type="button" key={control} data-drive={control} aria-label={`${label} – håll inne`} aria-pressed={Boolean(held[control])} className={`rally-drive rally-${control}${held[control]?' is-held':''}`} disabled={!racing} onPointerDown={event=>press(event,control)} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift}><b aria-hidden="true">{icon}</b><span>{label}</span></button>)}</div>
      <div className="rally-track-status" role="status">{racing?(view.status==='countdown'?`Start om ${Math.max(1,view.countdown)}…`:view.missedGate?'Kontrollpunkt missad. Använd Återgå till kontrollpunkt nedan.':view.offroad?'Ut på gräset! Styr tillbaka mot asfalten.':view.boost>0?'BOOST! Sikta mot nästa kurva.':`Varv ${Math.min(RALLY_LAPS,view.laps+1)} av ${RALLY_LAPS} · Håll en jämn racinglinje.`):preview?'Testläge: resultat och poäng sparas inte.':message||'Mobil: håll styrknapparna. Dator: ← / → eller A / D. Bilen gasar själv.'}</div>
      {saveError&&<div className="rally-save-error" role="alert"><p>{message}</p><button type="button" className="secondary-button" disabled={saving} onClick={()=>save(view.score)}>Försök spara igen</button><button type="button" className="text-button" disabled={saving} onClick={()=>{setSaveError(false);setMessage('Du valde att fortsätta utan att spara resultatet.')}}>Fortsätt utan att spara</button></div>}
      <div className="rally-bottom"><span>Fastnat? <button type="button" className="text-button" disabled={!racing||view.status==='countdown'} onClick={()=>{release();recoverRallyCar(game.current);setView(snapshot(game.current));draw();canvas.current?.focus({preventScroll:true})}}>{view.missedGate?'Återgå till kontrollpunkt · +3 s':'Tillbaka på banan · +3 s'}</button></span><span>Vrid gärna mobilen i fullskärm.</span></div>
    </div><aside className="rally-sidebar">
      <section className="rally-weekly"><p className="eyebrow">Veckans utmaning</p><h2>Slå veckans snabbaste <span aria-hidden="true">🏁</span></h2>
        {preview?<p>Veckans delade ghost visas när Kustrally är publicerat som veckans spel. Testlopp hämtar eller delar inga ghosts.</p>:<>
          {weeklyLoading&&<p role="status">Hämtar veckans ghost…</p>}
          {weeklyError?<><p role="status">{weeklyError}</p><button type="button" className="secondary-button" disabled={busy||weeklyLoading} onClick={loadWeekly}>Försök hämta igen</button></>:weekly?.active===false?<p>När Kustrally är publicerat som veckans spel kan alla jaga veckans snabbaste ghost.</p>:weekly?.active&&<>
            <div className="rally-weekly-record"><span className="rally-ghost-swatch is-weekly" aria-hidden="true"/><div><strong>{weekly.leader?`${weekly.leader.emoji} ${weekly.leader.displayName}`:'Bli veckans första förare'}</strong><b>{weekly.leader?timeText(weekly.leader.durationMs/1000):'—'}</b><small>Tre varv · veckan från {weekly.weekStart}</small></div></div>
            <label className="rally-ghost-toggle"><input type="checkbox" checked={showWeekly} onChange={event=>{weeklyVisible.current=event.target.checked;setShowWeekly(event.target.checked);draw()}} /> Visa veckans ghost</label>
            <p>Den guldfärgade bilen är veckans snabbaste hela lopp, oavsett rallypoäng. Den kan inte krocka med dig. Ny ledare hämtas inför nästa lopp.</p>
          </>}
          {weeklySaving&&<p role="status">Delar din veckotid…</p>}
          {weeklySaveError&&<div role="status"><p>{weeklySaveError}</p><button type="button" className="secondary-button" disabled={busy} onClick={saveWeekly}>Försök dela igen</button></div>}
          <p>Ny vecka börjar på måndag. När spelet är veckans spel delas din bästa nya körning med visningsnamn och tid. Inga träningsdata delas.</p>
        </>}
      </section>
      <section className="rally-ghost"><p className="eyebrow">Slå din egen racinglinje</p><h2>Din ghostbil</h2><div className="rally-own"><span className="rally-ghost-swatch" aria-hidden="true"/> Bästa trevarvstid<strong>{ghost?timeText(ghost.duration/1000):'—'}</strong></div><p>{ghost?'Den ljusblå, genomskinliga bilen återspelar ditt snabbaste hela lopp. Den kan inte krocka med dig.':'Kör i mål för att skapa din första ghost. Nästa race kan du jaga din egen bästa tid.'}</p><label className="rally-ghost-toggle"><input type="checkbox" checked={showGhost} onChange={event=>{ghostVisible.current=event.target.checked;setShowGhost(event.target.checked);draw()}} /> Visa egen ghost</label><p>{preview?'Testghost sparas bara under detta besök.':ghostWarning?'Webbläsaren kunde inte spara ghosten. Den finns kvar under detta besök.':'Din egen ghost sparas för profilen i den här webbläsaren, inte mellan enheter. En ändrad bana får en ny ghost.'}</p></section>
      <section className="rally-board"><p className="eyebrow">Kustrally · alla tider</p><h2>Rekordlistan</h2>{preview?<p>Topplistan visas för simmarna.</p>:!board?<p role="status">{boardError?'Topplistan kunde inte hämtas.':'Hämtar topplistan…'}</p>:board.leaderboard?.length?<ol>{board.leaderboard.map(entry=><li key={entry.profileId}><span>{entry.rank}</span><span aria-hidden="true">{entry.emoji}</span><strong>{entry.displayName}</strong><b>{entry.score.toLocaleString('sv-SE')}</b></li>)}</ol>:<p>Bli först att sätta ett rallyrekord!</p>}{!preview&&<div className="rally-own">Ditt personbästa<strong>{board?.ownBest?.toLocaleString('sv-SE')??'—'} <small>poäng</small></strong></div>}{boardError&&<button type="button" className="secondary-button" onClick={loadBoard}>Hämta topplistan igen</button>}<p>Placering väger före tid i rallypoängen. Ghosten följer däremot din snabbaste tid oavsett placering. Tidigare sparade rallypoäng finns kvar i rekordlistan.</p></section>
    </aside></div>
  </section>
}
