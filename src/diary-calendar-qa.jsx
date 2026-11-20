import React,{useCallback,useState} from 'react'
import {createRoot} from 'react-dom/client'
import TrainingDiary,{DiaryCalendar,DiaryEntry} from './training-diary.jsx'
import {diaryMonthRange} from '../shared/diary-calendar.js'
import {diaryRange,summarizeDiary} from '../shared/training-diary.js'
import './styles.css'

const today='2026-11-20'
function Demo(){
  const [range,setRange]=useState(diaryMonthRange('2026-11',today)),[day,setDay]=useState(null),[message,setMessage]=useState('')
  const month=range.start.slice(0,7)
  const base={type:'swim',state:'completed',slot:'afternoon_swim',title:'Simning',content:'',strengthLogs:[],drylandLogs:[],results:[],comments:[],reportedMeters:null,reportedMinutes:null,estimatedMeters:null,estimatedMinutes:null,rpe:null,feeling:3}
  const entries=[{...base,date:month+'-02'}, {...base,date:month+'-04',focus:'f2_spec',estimatedMeters:4000,estimatedMinutes:90,title:'F2 Spec'}, {...base,date:month+'-07',focus:'fart',reportedMeters:3000}, {...base,date:month+'-10',reportedMinutes:60,reportedMeters:3500}, {...base,date:month+'-12',state:'planned'}, {...base,type:'rest',state:'status',date:month+'-14',title:'Vila'}].map((entry,index)=>({...entry,key:month+':'+index}))
  return <main className="training-diary-page"><p>Lokal testvy · fiktiva uppgifter · inga serveranrop eller databasändringar</p><DiaryCalendar range={range} entries={entries} selectedDay={day} today={today} onDay={setDay} onMonthChange={next=>{setRange(next);setDay(null);setMessage(`Hämtad period: ${next.start}–${next.end}`)}}/><p role="status">{message}</p><h2>{day?`Pass den ${day}`:'Pass i månaden'}</h2>{entries.filter(entry=>!day||entry.date===day).map(entry=><DiaryEntry key={entry.key} entry={entry} code="fixture" request={async()=>({})} reflectionsAvailable={false} onSaved={()=>{}} onDirty={()=>{}}/>)}</main>
}
function FullDiaryDemo(){
  const [lastRequest,setLastRequest]=useState('')
  const request=useCallback(async path=>{
    const url=new URL(path,location.origin)
    if(!url.searchParams.has('diary'))return {times:[],records:[],available:true}
    const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date())
    const range=diaryRange(url.searchParams.get('start'),url.searchParams.get('end'),now)
    setLastRequest(path)
    return {range,entries:[],current:summarizeDiary([],[],range.start,range.end),previous:summarizeDiary([],[],range.previousStart,range.previousEnd),warnings:[],goals:[],raceResults:[],reflectionsAvailable:false}
  },[])
  return <><p role="status">Lokal test av hela dagboken med fiktivt API: {lastRequest}</p><TrainingDiary code="fixture" request={request} onBack={()=>{}} onGoals={()=>{}}/></>
}
const params=new URLSearchParams(location.search),width=Number(params.get('width'))
if([320,390].includes(width))createRoot(document.getElementById('qa-root')).render(<iframe title="Kalender i mobilbredd" src="/diary-calendar-qa.html" style={{width,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('qa-root')).render(params.has('full')?<FullDiaryDemo/>:<Demo/> )
