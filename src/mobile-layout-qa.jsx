import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {DiaryPeriod} from './training-diary.jsx'
import Scale from './checkin-scale.jsx'
import {CheckIn} from './main.jsx'
import {checkinScaleIcons} from '../shared/checkin-scale-icons.js'

const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
const request=async url=>url.includes('personalSessions=true')?{sessions:[],registered:[]}:url.includes('checkinChoices=true')?{options:[{id:'11111111-1111-4111-8111-111111111111',date:today,timeOfDay:'afternoon',time:'17:00',title:'Träningspass · F2 Frisim',distanceMeters:4700,durationMinutes:115,workoutReference:'workout:11111111-1111-4111-8111-111111111111'}]}:{records:[{activity_date:today,status:'none',minutes:480,quality:3}]}
function Demo(){
  const [draft,setDraft]=useState({start:today.slice(0,7)+'-01',end:today}),[message,setMessage]=useState('')
  if(new URLSearchParams(location.search).get('view')==='checkin')return <main className="app-shell"><CheckIn code="fixture" activityDate={today} hasProfile identified competitionToday={false} request={request} onBack={()=>{}} onSubmit={async()=>{}}/></main>
  return <main className="training-diary-page"><p>Lokal testvy · fiktiva uppgifter · inga serveranrop</p><h1>Mobiljusteringar</h1><DiaryPeriod draft={draft} onDraft={setDraft} onPreset={value=>setMessage(`Valt: ${value}`)} onSubmit={()=>setMessage(`Vald period: ${draft.start}–${draft.end}`)}/><section className="question" style={{marginTop:32}}><p className="eyebrow">Snabbkoll</p><h2>Hur jobbigt var passet?</h2><Scale count={10} left="Väldigt lätt" right="Maxjobbigt" icons={checkinScaleIcons('rpe')} onChange={value=>setMessage(`Vald RPE: ${value} av 10`)}/></section><p role="status">{message}</p></main>
}
const params=new URLSearchParams(location.search),width=Number(params.get('width'))
if([320,375,390,430,768].includes(width)){
  const view=params.get('view')==='checkin'?'?view=checkin':''
  createRoot(document.getElementById('qa-root')).render(<iframe title="Mobiljusteringar i testbredd" src={'/mobile-layout-qa.html'+view} style={{width,height:'100vh',border:0,display:'block'}}/> )
}else createRoot(document.getElementById('qa-root')).render(<Demo/> )
