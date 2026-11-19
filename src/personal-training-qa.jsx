import React, { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CheckIn } from './main.jsx'
import PersonalTrainingPlanner from './personal-training.jsx'
import { DiaryEntry } from './training-diary.jsx'
import { buildDiaryEntries } from '../shared/training-diary.js'
import { normalizePersonalDetails, personalCheckinDetails, personalSlot } from '../shared/personal-training.js'
import { toDiaryResponse } from './personal-training-qa-data.js'

const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
const id='11111111-1111-4111-8111-111111111111'
function Demo(){
  const [view,setView]=useState('home'),[version,setVersion]=useState(0),[message,setMessage]=useState('')
  const store=useRef({plans:[{id,date:today,slot:personalSlot(id),...normalizePersonalDetails({activityType:'swim',origin:'niu',focus:'f2_spec',distanceMeters:3000,durationMinutes:60,timeOfDay:'morning'}),completed:false}],responses:[],sessions:[]})
  const request=useCallback(async(url,code,options={})=>{
    const db=store.current
    if(url.includes('illness=true')||url.includes('sleep=true'))return {records:[{activity_date:today,status:'none',minutes:480,quality:3}]}
    if(url.includes('checkinChoices=true'))return{options:[{id:'22222222-2222-4222-8222-222222222222',date:today,timeOfDay:'afternoon',title:'Klubbens F2 Frisim',activityType:'swim',distanceMeters:4500,durationMinutes:90,workoutReference:'workout:22222222-2222-4222-8222-222222222222'}]}
    if(url.includes('personalSessions=true'))return{sessions:db.plans,registered:[{type:'strength',date:today}]}
    const body=JSON.parse(options.body||'{}')
    if(body.action==='save-personal-session'){
      const plan={id:body.id,date:body.date,slot:personalSlot(body.id),...normalizePersonalDetails(body.details),completed:false}
      db.plans=[...db.plans.filter(item=>item.id!==body.id),plan];setVersion(value=>value+1);return{session:plan}
    }
    if(body.action==='delete-personal-session'){db.plans=db.plans.filter(item=>item.id!==body.id);setVersion(value=>value+1);return{deleted:true}}
    throw Error('Okänd lokal teståtgärd')
  },[])
  const submit=async form=>{
    const db=store.current, uuid=form.personalSessionId||crypto.randomUUID(),details=form.personalSessionId?personalCheckinDetails(form):null
    db.responses.push(toDiaryResponse(form,uuid,today))
    if(form.type==='after'){
      db.sessions.push({id:uuid,session_date:today,session_slot:details?personalSlot(uuid):form.trainingSlot||form.activityType,activity_type:form.activityType,source:'checkin',personal_details:details})
      if(details){const plan=db.plans.find(row=>row.id===uuid);if(plan)plan.completed=true;else db.plans.push({id:uuid,date:today,slot:personalSlot(uuid),...details,completed:true})}
    }
    setMessage('Passet sparades i den fiktiva dagboken. Inget skickades till servern.');setVersion(value=>value+1);setView('home')
  }
  const entries=buildDiaryEntries({sessions:store.current.sessions,responses:store.current.responses,personalPlans:store.current.plans.map(plan=>({id:plan.id,planned_date:plan.date,session_slot:plan.slot,personal_details:plan})),today})
  return <main className="app-shell"><section style={{padding:'12px 18px',background:'#e6f2ed',fontSize:12}}>Lokal testvy · fiktiva uppgifter · inga databasändringar, AI-anrop eller poäng</section>{view==='checkin'?<CheckIn code="fixture" activityDate={today} identified hasProfile competitionToday={false} request={request} onBack={()=>setView('home')} onSubmit={submit}/>:<div className="page-content"><h1>NIU och egna pass</h1><p>Prova samma pass i planering, rapportering och dagbok.</p><button type="button" className="primary-button" onClick={()=>setView('checkin')}>Rapportera träning</button>{message&&<p role="status">{message}</p>}<PersonalTrainingPlanner key={version} code="fixture" start={today} end={today} request={request}/><section><h2>Dagbok</h2>{entries.map(entry=><DiaryEntry key={entry.key} entry={entry} code="fixture" request={request} reflectionsAvailable={false} onSaved={()=>{}} onDirty={()=>{}}/>)}</section></div>}</main>
}
if(new URLSearchParams(location.search).get('viewport')==='mobile')createRoot(document.getElementById('qa-root')).render(<iframe title="Egna pass i mobilbredd" src="/personal-training-qa.html" style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('qa-root')).render(<Demo/> )
