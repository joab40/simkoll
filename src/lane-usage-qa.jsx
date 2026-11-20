import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import LaneUsagePanel,{LaneUsageSettings} from './lane-usage.jsx'
import {defaultLaneUsage} from '../shared/lane-usage.js'
import './styles.css'
let settings={...defaultLaneUsage(),enabled:true,updated_at:'2026-11-20T00:00:00Z'}
const [a,b]=settings.participants
const records=[{id:crypto.randomUUID(),date:'2026-11-19',time:'19:00',location:'Himlabadet',hasPhoto:false,entries:[{participantId:a.id,name:a.name,lanes:4,swimmers:24},{participantId:b.id,name:b.name,lanes:2,swimmers:18}]},{id:crypto.randomUUID(),date:'2026-11-18',time:'17:00',location:'Himlabadet',hasPhoto:false,entries:[{participantId:a.id,name:a.name,lanes:3,swimmers:21},{participantId:b.id,name:b.name,lanes:3,swimmers:15}]}]
async function request(path,code,options={}){
  const query=new URL(path,location.origin).searchParams
  if(!options.method){if(query.get('laneUsage')==='settings')return {settings};if(query.get('laneUsage')==='photo')return {url:'/favicon.svg'};return {settings,measurements:records.filter(row=>row.date>=query.get('start')&&row.date<=query.get('end'))}}
  const body=JSON.parse(options.body)
  if(body.action==='save-lane-settings'){settings={enabled:body.enabled,title:body.title,participants:body.participants,updated_at:new Date().toISOString()};return {settings}}
  let measurement=records.find(row=>row.id===body.id)
  if(!measurement){measurement={id:body.id,date:body.date,time:body.time,location:body.location,hasPhoto:!!body.photo,entries:body.entries.map(item=>({...item,name:settings.participants.find(p=>p.id===item.participantId).name}))};records.unshift(measurement)}
  return {measurement}
}
function Demo(){const [admin,setAdmin]=useState(false);return <main style={{maxWidth:1100,margin:'auto',padding:16}}><p>Lokal testvy · fiktiva observationer · inga serveranrop eller databasändringar</p><button type="button" className="secondary-button" onClick={()=>setAdmin(!admin)}>{admin?'Till registrering':'Visa inställningar'}</button>{admin?<LaneUsageSettings code="fixture" request={request}/>:<><section className="attendance-panel"><div className="attendance-panel-head"><button className="attendance-toggle">📋 Närvaro under simpass<span>25/32 närvarande</span></button><button className="lane-planner-button">🏊 Banor</button></div></section><LaneUsagePanel code="fixture" date="2026-11-20" request={request}/></>}</main>}
const width=Number(new URLSearchParams(location.search).get('width'))
createRoot(document.getElementById('qa-root')).render([320,390].includes(width)?<iframe title="Banfördelning i mobilbredd" src="/lane-usage-qa.html" style={{width,height:'100vh',border:0,display:'block'}}/>:<Demo/>)
