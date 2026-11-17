import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { startVisiblePolling } from './visible-refresh.js'
import './app-feedback-dialog.css'

const changed = () => window.dispatchEvent(new Event('simkoll-feedback-changed'))
const post = (request, code, body) => request('/api/community',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const stamp = value => new Date(value).toLocaleString('sv-SE',{dateStyle:'medium',timeStyle:'short'})

export function useFeedbackCount(code, enabled, request = apiRequest, scopeKey = code) {
  const [state,setState] = useState({code,scopeKey,count:null,error:false})
  useEffect(()=>{
    setState({code,scopeKey,count:null,error:false})
    if (!enabled) return
    let active=true
    const load=()=>request('/api/community?feedbackDialog=true&count=true',code,{retry:false}).then(data=>{if(active)setState({code,scopeKey,count:data.unreadCount,error:false})}).catch(()=>{if(active)setState(current=>({...current,error:true}))})
    const stop=startVisiblePolling(load,30000)
    const refresh=()=>{if(!document.hidden)void load()}
    window.addEventListener('simkoll-feedback-changed',refresh)
    return()=>{active=false;stop();window.removeEventListener('simkoll-feedback-changed',refresh)}
  },[code,enabled,request,scopeKey])
  return enabled && state.code===code && state.scopeKey===scopeKey ? state : {count:null,error:false}
}
export function FeedbackBadge({state}) {
  return state.error ? <b className="tab-count" title="Feedbacknotiser kunde inte hämtas" aria-label="Feedbacknotiser kunde inte hämtas">!</b> : state.count>0 ? <b className="tab-count" aria-label={state.count===1?'1 oläst feedbackdialog':`${state.count} olästa feedbackdialoger`}>{state.count}</b> : null
}

export function FeedbackSection({jumpRequest=0,children}) {
  const section=useRef(null)
  useEffect(()=>{
    if(!jumpRequest)return
    const frame=window.requestAnimationFrame(()=>{
      section.current?.focus({preventScroll:true})
      section.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
    })
    return()=>window.cancelAnimationFrame(frame)
  },[jumpRequest])
  return <section ref={section} className="feedback-home-section" tabIndex={-1} aria-label="Appförslag och svar">{children}</section>
}

export function FeedbackDialog({id,code,role='swimmer',onClose,request=apiRequest}) {
  const dialog=useRef(null),alive=useRef(false),busy=useRef(false),attempt=useRef(null),acked=useRef(null),messageEnd=useRef(null)
  const [data,setData]=useState(null),[text,setText]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[older,setOlder]=useState(null),[history,setHistory]=useState([])
  useEffect(()=>{
    alive.current=true;dialog.current.showModal()
    return()=>{alive.current=false;dialog.current?.close()}
  },[])
  const load=async()=>{
    const result=await request(`/api/community?feedbackDialog=true&id=${encodeURIComponent(id)}`,code,{retry:false})
    if(alive.current){setData(result);setError('')}
  }
  useEffect(()=>{
    const stop=startVisiblePolling(()=>load().catch(reason=>{if(alive.current)setError(reason.message)}),15000)
    return stop
  },[id,code,request])
  // Acknowledgement follows a rendered, open dialog, never a list/preview fetch.
  // The exact snapshot cursor cannot consume a later-arriving response.
  useEffect(()=>{
    if(!data || document.hidden || !dialog.current?.open || acked.current===data.readThrough) return
    let active=true
    post(request,code,{action:'feedback-read',id,throughId:data.readThrough}).then(()=>{
      if(active&&alive.current){acked.current=data.readThrough;changed()}
    }).catch(()=>{if(active&&alive.current)setError('Dialogen visas, men läsmarkeringen kunde inte sparas. Öppna dialogen igen för att försöka på nytt.')})
    return()=>{active=false}
  },[data,code,id,request])
  useEffect(()=>{if(data)messageEnd.current?.scrollIntoView({block:'nearest'})},[data?.readThrough])
  const send=async event=>{
    event.preventDefault()
    if(busy.current||(!text.trim()&&!attempt.current))return
    busy.current=true;setSaving(true);setError('')
    try{
      attempt.current ||= {requestId:crypto.randomUUID(),content:text.trim()}
      await post(request,code,{action:'feedback-message',id,...attempt.current})
      attempt.current=null
      if(alive.current){setText('');setUncertain(false);changed();await load()}
    }catch(reason){if(alive.current){setUncertain(Boolean(attempt.current));setError(reason.message)}}
    finally{busy.current=false;if(alive.current)setSaving(false)}
  }
  const loadOlder=async()=>{
    if(older==='loading')return
    setOlder('loading');setError('')
    try{
      const before=history[0]?.id || data.olderBefore
      const result=await request(`/api/community?feedbackDialog=true&id=${encodeURIComponent(id)}&before=${before}`,code)
      if(alive.current){setHistory(rows=>[...result.messages,...rows]);setOlder(result.olderBefore?'more':'done')}
    }catch(reason){if(alive.current){setOlder(null);setError(reason.message)}}
  }
  const messages=[...new Map([...history,...(data?.messages||[])].map(row=>[row.id,row])).values()]
  return <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-dialog-title" onCancel={event=>{event.preventDefault();onClose()}}>
    <header><div><p className="eyebrow">Privat appfeedback</p><h2 id="feedback-dialog-title">{role==='superadmin'?'Dialog om förslaget':'Dialog om ditt förslag'}</h2><small>Bara simmaren och superadmin kan läsa dialogen.</small></div><button type="button" onClick={onClose} aria-label="Stäng feedbackdialogen">×</button></header>
    <div className="feedback-dialog-body">
      {!data&&!error&&<p role="status">Hämtar konversationen…</p>}
      {data&&<><blockquote className="feedback-original"><small>Ursprunglig feedback · {stamp(data.createdAt)}</small><p>{data.comment||'Feedback utan fritext.'}</p></blockquote>
        {(data.olderBefore||history.length>0)&&older!=='done'&&<button className="text-button" type="button" disabled={older==='loading'} onClick={loadOlder}>{older==='loading'?'Hämtar…':'Visa äldre meddelanden'}</button>}
        <ol className="feedback-messages">{messages.map(message=><li key={message.id} className={message.role===role?'own':''}><div><strong>{message.role===role?'Du':message.role==='superadmin'?'Simkolls utvecklare':'Simmaren'}</strong><time>{stamp(message.createdAt)}</time></div><p>{message.content}</p></li>)}</ol>
        {!messages.length&&<p>Här kan ni ställa följdfrågor och svara om förslaget.</p>}
        <div ref={messageEnd} aria-hidden="true"/>
      </>}
      {error&&<p className="form-error" role="alert">{error} {!data&&<button type="button" onClick={()=>void load().catch(reason=>setError(reason.message))}>Försök igen</button>}</p>}
    </div>
    {data&&<form onSubmit={send} className="feedback-composer"><label htmlFor="feedback-reply-text">{role==='superadmin'?'Svara till simmaren':'Svara till utvecklaren'}</label><textarea id="feedback-reply-text" rows={3} maxLength={1000} value={text} disabled={saving||uncertain||!data.canReply} onChange={event=>setText(event.target.value)} placeholder="Skriv ett svar eller en följdfråga…"/><div><small>{!data.canReply?'Simmarprofilen är inte aktiv.':`${text.length}/1000 · privat dialog`}</small><button className="primary-button" disabled={saving||!data.canReply||(!text.trim()&&!uncertain)}>{saving?'Skickar…':uncertain?'Kontrollera samma försök':'Skicka svar'}</button></div></form>}
  </dialog>
}

export function FeedbackThreadButton({id,code,request=apiRequest}) {
  const [open,setOpen]=useState(false)
  return <><button type="button" className="secondary-button" onClick={()=>setOpen(true)}>Öppna dialog / skicka följdsvar</button>{open&&<FeedbackDialog key={`${code}:${id}`} id={String(id)} code={code} role="superadmin" request={request} onClose={()=>setOpen(false)}/>}</>
}

export default function FeedbackInbox({code,role='swimmer',request=apiRequest}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[all,setAll]=useState(false),[selected,setSelected]=useState(null),[revision,setRevision]=useState(0),[older,setOlder]=useState([]),[next,setNext]=useState(null),[loadingMore,setLoadingMore]=useState(false)
  const paginated=useRef(false)
  useEffect(()=>{
    let active=true;paginated.current=false;setOlder([]);setData(null);setError('')
    const load=()=>request(`/api/community?feedbackDialog=true${all?'':'&unreadOnly=true'}`,code,{retry:false}).then(result=>{if(active){setData(result);if(!paginated.current)setNext(result.nextBefore);setError('')}}).catch(reason=>{if(active)setError(reason.message)})
    const stop=startVisiblePolling(load,30000)
    const refresh=()=>setRevision(value=>value+1)
    window.addEventListener('simkoll-feedback-changed',refresh)
    return()=>{active=false;stop();window.removeEventListener('simkoll-feedback-changed',refresh)}
  },[code,all,request,revision])
  const more=async()=>{
    setLoadingMore(true);paginated.current=true
    try{const result=await request(`/api/community?feedbackDialog=true${all?'':'&unreadOnly=true'}&before=${next}`,code);setOlder(rows=>[...rows,...result.items]);setNext(result.nextBefore)}catch(reason){setError(reason.message)}finally{setLoadingMore(false)}
  }
  const items=[...new Map([...(data?.items||[]),...older].map(row=>[row.id,row])).values()]
  if(role==='swimmer'&&!all&&data&&!items.length&&!error&&!selected) return <div className="feedback-inbox-quiet"><button type="button" className="text-button" onClick={()=>setAll(true)}>Mina appförslag och svar →</button></div>
  return <section className="feedback-inbox" aria-label="Appfeedback och svar">
    <div className="feedback-inbox-heading"><div><p className="eyebrow">{role==='superadmin'?'Förslagslådan':'Från Simkolls utvecklare'}</p><h2>{data?.unreadCount>0?data.unreadCount===1?'1 oläst feedbackdialog':`${data.unreadCount} olästa feedbackdialoger`:role==='superadmin'?'Feedbackdialoger':'Svar på din feedback'}</h2></div><button type="button" className="text-button" onClick={()=>setAll(value=>!value)}>{all?'Visa olästa':role==='superadmin'?'Alla dialoger':'Mina förslag och svar'}</button></div>
    {error?<p className="form-error" role="alert">{error} <button type="button" onClick={()=>setRevision(value=>value+1)}>Försök igen</button></p>:!data?<p role="status">Hämtar feedback…</p>:!items.length?<small>{all?'Inga feedbackdialoger ännu.':'Inga olästa svar just nu.'}</small>:<ul>{items.map(item=><li key={item.id}><button type="button" onClick={()=>setSelected(item.id)}><div><strong>{role==='superadmin'?`${item.profileEmoji||'💬'} ${item.profileName||'Simmare'}`:item.unread?'Nytt svar på ditt förslag':'Din feedback'}</strong>{item.unread&&<b>Oläst</b>}</div><p>{item.lastMessage?.content||item.comment||'Feedback utan fritext'}</p><small>{item.lastMessage ? item.lastMessage.role!==role ? 'Väntar på dig' : role==='superadmin' ? 'Väntar på simmaren' : 'Väntar på utvecklaren' : role==='superadmin' ? 'Ny feedback' : 'Skickad feedback'} · {stamp(item.lastMessage?.createdAt||item.createdAt)}{item.archived?' · arkiverat förslag':''}</small><span>Läs och svara →</span></button></li>)}</ul>}
    {next&&<button type="button" className="text-button" disabled={loadingMore} onClick={more}>{loadingMore?'Hämtar…':'Visa fler dialoger'}</button>}
    {selected&&<FeedbackDialog key={`${code}:${selected}`} id={selected} code={code} role={role} request={request} onClose={()=>setSelected(null)}/>}
  </section>
}
