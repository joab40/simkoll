import React,{useCallback,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {DiaryEntry} from './training-diary.jsx'
import {buildDiaryEntries,summarizeDiary} from '../shared/training-diary.js'
import './styles.css'

const day='2026-11-17',slot='afternoon_swim'
const options=[['11111111-1111-4111-8111-111111111111','17:00','F2 Spec Övriga',4000,110],['22222222-2222-4222-8222-222222222222','19:00','Distans · Frisim',4000,115],['33333333-3333-4333-8333-333333333333','19:00','Distans',4800,95]].map(([id,time,title,distanceMeters,durationMinutes])=>({id,workoutReference:'workout:'+id,time,title,distanceMeters,durationMinutes,location:'Himlabadet'}))
function Demo(){
  const [reference,setReference]=useState(null),[revision,setRevision]=useState(0)
  const request=useCallback(async(url,code,optionsArg={})=>{
    if(url.includes('diaryChoices=true'))return{options}
    const body=JSON.parse(optionsArg.body||'{}')
    if(body.action==='diary-workout-choice'){setReference(body.workoutReference);return{saved:true}}
    if(body.action==='diary-reflection')return{reflection:{whatWorked:body.whatWorked,nextTime:body.nextTime}}
    throw Error('Okänt lokalt testanrop')
  },[])
  const responses=[{id:'before',activity_date:day,created_at:day+'T14:00:00Z',session_slot:slot,day_type:'before',activity_type:'swim',feeling:3}]
  const entries=buildDiaryEntries({sessions:[{session_date:day,session_slot:slot,activity_type:'swim',source:'manual',workout_reference:reference}],responses,workouts:options.map(option=>({id:option.id,title:option.title,workout_date:day,time_of_day:'afternoon',distance_meters:option.distanceMeters,duration_minutes:option.durationMinutes})),today:'2026-11-19'})
  const summary=summarizeDiary(entries,responses,day,day)
  return <main className="training-diary-page" style={{maxWidth:1000,margin:'auto',padding:20}}><p>Lokal testvy · fiktiv simmare · inga serveranrop, poäng eller databasändringar.</p><h1>Välj pass i efterhand</h1><p>{summary.sessions} genomfört pass · RPE saknas fortfarande · uppdatering {revision}</p>{entries.map(entry=><DiaryEntry key={entry.key} entry={entry} code="fixture" request={request} reflectionsAvailable onSaved={()=>{}} onDirty={()=>{}} onChoiceSaved={async()=>setRevision(n=>n+1)}/>)}</main>
}
if(new URLSearchParams(location.search).get('viewport')==='mobile')createRoot(document.getElementById('qa-root')).render(<iframe title="Passval i mobilbredd" src="/diary-choice-qa.html" style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('qa-root')).render(<Demo/> )
