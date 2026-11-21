import React,{useEffect,useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import SwimmerWeekPlanner from './swimmer-week-planner.jsx'
import WeeklyTrainingVolume from './weekly-training-volume.jsx'
import {createWeeklyTrainingSync,pendingWeeklySessions} from './weekly-training-sync.js'
import './styles.css'

const today='2026-11-20',slot='afternoon_swim'
const base={sessions:['16','17','18','19'].map((n,index)=>({date:'2026-11-'+n,slot,type:'swim',distanceMeters:[3500,3500,3500,3700][index],durationMinutes:[110,110,115,120][index],distanceBasis:'reported',durationBasis:'reported'})),plannedSessions:['16','17','18','19','20'].map(n=>({date:'2026-11-'+n,slot,weekStart:'2026-11-16'}))}
let stored=structuredClone(base)
async function request(path,code,options){
  if(options?.method==='POST'){const {date,slot,completed}=JSON.parse(options.body);stored={...stored,sessions:stored.sessions.filter(item=>item.date!==date||item.slot!==slot)};if(completed)stored.sessions.push({date,slot,type:slot.includes('swim')?'swim':slot,distanceMeters:1500,durationMinutes:120,distanceBasis:'estimated',durationBasis:'estimated'});return {ok:true}}
  return structuredClone(stored)
}
function Card({training,sync}){
  const [edits,setEdits]=useState(new Map()),[saving,setSaving]=useState(new Set()),[message,setMessage]=useState('')
  const sessions=pendingWeeklySessions(training.sessions,edits)
  const toggle=async(date,slot,completed)=>{const key=`${date}-${slot}`;setEdits(current=>new Map(current).set(key,{date,slot,completed}));setSaving(current=>new Set(current).add(key));try{const result=await sync.saveSession(date,slot,completed);setMessage(result.message||'Passet är registrerat ✓')}catch(error){setMessage(error.message)}finally{setEdits(current=>{const next=new Map(current);next.delete(key);return next});setSaving(current=>{const next=new Set(current);next.delete(key);return next})}}
  return <section className="weekly-training-card"><div className="weekly-summary"><div><p className="eyebrow">Min träning den här veckan</p><h3>{sessions.filter(item=>item.type==='swim').length} av 4 simpass</h3><WeeklyTrainingVolume sessions={sessions}/></div></div><SwimmerWeekPlanner today={today} sessions={sessions} plans={training.plannedSessions} saving={saving} onToggle={toggle} onPlan={()=>{}}/><p role="status">{message}</p></section>
}
function Demo(){
  const [training,setTraining]=useState(()=>structuredClone(base)),[home,setHome]=useState(true)
  const sync=useMemo(()=>createWeeklyTrainingSync({request,code:'fixture',profileId:'fixture',onChange:setTraining}),[])
  useEffect(()=>{sync.activate();return()=>sync.dispose()},[sync])
  return <main style={{maxWidth:650,margin:'auto',padding:18}}><p>Lokal synkkontroll · fiktiva uppgifter · inga riktiga serveranrop</p><button className="secondary-button" onClick={()=>setHome(value=>!value)}>{home?'Öppna annan meny':'Tillbaka till startsidan'}</button>{home?<Card training={training} sync={sync}/>:<section><h2>Annan meny</h2><p>Veckokortet är avmonterat. Gå tillbaka för att kontrollera att sparade markeringar och mängder finns kvar.</p></section>}</main>
}
createRoot(document.getElementById('qa-root')).render(<Demo/> )
