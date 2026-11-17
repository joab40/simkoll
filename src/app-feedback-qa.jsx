import React,{useCallback,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import FeedbackInbox,{FeedbackBadge,useFeedbackCount} from './app-feedback-dialog.jsx'
import './styles.css'

function Badge({request}){const state=useFeedbackCount('admin',true,request);return <span>Meny · Appfeedback <FeedbackBadge state={state}/></span>}
function Demo(){
  const [role,setRole]=useState('swimmer'),[,render]=useState(0),[fail,setFail]=useState(false)
  const store=useRef({sequence:2,fail:false,reads:{},attempts:new Map(),rows:[
    {id:'101',profileName:'Tova',profileEmoji:'🐬',comment:'Jag vill kunna planera in plugg i kalendern.',status:'in_progress',archived:false,createdAt:'2026-11-15T12:55:09Z',messages:[{id:'1',role:'superadmin',content:'Bra idé! Menar du att markera tid för skolan, eller att meddela frånvaro från träning?',createdAt:'2026-11-16T20:00:00Z'}]},
    {id:'102',profileName:'En annan simmare',profileEmoji:'🏊',comment:'Kan vi få en tydligare veckovy?',status:'new',archived:false,createdAt:'2026-11-17T08:00:00Z',messages:[]},
  ]})
  const request=useCallback(async(url,code,options={})=>{
    const db=store.current,role=code==='admin'?'superadmin':'swimmer',query=new URL(url,'http://fixture.invalid').searchParams,body=options.body?JSON.parse(options.body):null
    const rows=role==='superadmin'?db.rows:db.rows.filter(row=>row.id==='101')
    const unread=row=>row.messages.some(message=>message.role!==role&&Number(message.id)>Number(db.reads[`${role}:${row.id}`]??0))||(role==='superadmin'&&db.reads[`${role}:${row.id}`]===undefined)
    if(body){
      const row=rows.find(row=>row.id===body.id);if(!row)throw Error('Dialogen finns inte')
      if(body.action==='feedback-read'){db.reads[`${role}:${row.id}`]=Math.max(Number(body.throughId),Number(db.reads[`${role}:${row.id}`]||0));return{read:true}}
      if(body.action==='feedback-message'){
        if(!db.attempts.has(body.requestId)){const message={id:String(db.sequence++),role,content:body.content,createdAt:new Date().toISOString()};row.messages.push(message);db.attempts.set(body.requestId,message.id)}
        if(db.fail){db.fail=false;setFail(false);throw Error('Simulerat tappat svar. Tryck Kontrollera samma försök.')}
        render(value=>value+1);return{id:db.attempts.get(body.requestId),created:true}
      }
      throw Error('Okänd demoåtgärd')
    }
    if(query.get('id')){const row=rows.find(row=>row.id===query.get('id'));return{...row,readThrough:row.messages.at(-1)?.id||'0',olderBefore:null,canReply:true}}
    const list=rows.filter(row=>query.get('unreadOnly')!=='true'||unread(row)).map(row=>({...row,unread:unread(row),lastMessage:row.messages.at(-1)||null}))
    return{items:list,unreadCount:rows.filter(unread).length,nextBefore:null}
  },[])
  return <main style={{maxWidth:850,margin:'24px auto',padding:16}}><h1>Appfeedback · fiktiv demo</h1><p>Inga API-anrop, riktiga meddelanden, pushnotiser eller databasändringar.</p><div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}><button type="button" onClick={()=>setRole('swimmer')} aria-pressed={role==='swimmer'}>Simmarvy</button><button type="button" onClick={()=>setRole('superadmin')} aria-pressed={role==='superadmin'}>Superadminvy</button><Badge request={request}/></div><label style={{display:'block',marginTop:15}}><input type="checkbox" checked={fail} onChange={event=>{setFail(event.target.checked);store.current.fail=event.target.checked}}/> Tappa nästa svar efter sparat meddelande</label><FeedbackInbox key={role} code={role==='superadmin'?'admin':'swimmer'} role={role} request={request}/></main>
}
if(new URLSearchParams(location.search).get('viewport')==='mobile')createRoot(document.getElementById('root')).render(<iframe title="Feedback i mobilbredd" src="/app-feedback-qa.html" style={{width:390,height:'100vh',border:0,display:'block'}}/>);else createRoot(document.getElementById('root')).render(<Demo/> )
