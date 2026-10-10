import React, {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {pepKey,pepDay,pepTime,pepTimeline} from './pep-chat.js'
import './pepp-channel.css'

export default function PeppChannelPanel({items,profileId,backgroundImage,customPepEnabled,onSend,onReact,reactionBusy,templates,EmojiPicker}) {
  const [content,setContent]=useState(''),[templateKey,setTemplateKey]=useState(''),[reply,setReply]=useState(null),[sending,setSending]=useState(false),[status,setStatus]=useState(''),[unread,setUnread]=useState(0),[burst,setBurst]=useState(0),[picker,setPicker]=useState(false)
  const panel=useRef(null),messages=useRef(null),composer=useRef(null),follow=useRef(true),seen=useRef(null),timer=useRef(null),mounted=useRef(true)
  const timeline=useMemo(()=>pepTimeline(items),[items])
  const latestKey=timeline.map(pepKey).join('|')
  const scrollLatest=()=>{follow.current=true;setUnread(0);if(messages.current)messages.current.scrollTop=messages.current.scrollHeight}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current)}},[])
  useLayoutEffect(()=>{
    const measure=()=>{const viewport=window.visualViewport;const available=(viewport?.height||window.innerHeight)-Math.max(0,panel.current.getBoundingClientRect().top-(viewport?.offsetTop||0))-(document.querySelector('.app-meta')?.offsetHeight||0)-12;panel.current.style.setProperty('--pep-height',`${Math.max(180,Math.min(760,available))}px`)}
    measure();window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure)
    return()=>{window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)}
  },[])
  useLayoutEffect(()=>{
    const keys=new Set(timeline.map(pepKey))
    if(seen.current){const fresh=timeline.filter(item=>!seen.current.has(pepKey(item)));if(!follow.current)setUnread(n=>n+fresh.length);if(fresh.some(item=>item.content?.trim()==='🙌')){setBurst(n=>n+1);clearTimeout(timer.current);timer.current=setTimeout(()=>setBurst(0),2200)}}
    seen.current=keys
    if(follow.current&&messages.current)messages.current.scrollTop=messages.current.scrollHeight
  },[latestKey])
  useEffect(()=>{if(!customPepEnabled&&!templateKey)setContent('')},[customPepEnabled])
  useLayoutEffect(()=>{if(composer.current){composer.current.style.height='43px';composer.current.style.height=`${Math.min(120,Math.max(43,composer.current.scrollHeight))}px`}if(follow.current&&messages.current)messages.current.scrollTop=messages.current.scrollHeight},[content,reply,picker,status])
  const send=async(event)=>{
    event.preventDefault();if(sending||!content.trim()||(!customPepEnabled&&!templateKey))return
    setSending(true);setStatus('')
    try{const result=await onSend({mode:'group',templateKey:templateKey||'custom',...(templateKey?{}:{content:content.trim()}),...(reply?{reply:{type:reply.type,id:reply.id}}:{})});if(!mounted.current)return;scrollLatest();setContent('');setTemplateKey('');setReply(null);setStatus(result?.awardedPoints?'Skickat · +1 poäng':'Skickat till gruppen.');composer.current?.focus({preventScroll:true})}catch(error){if(mounted.current)setStatus(error.message)}finally{if(mounted.current)setSending(false)}
  }
  const chooseReply=item=>{setReply(item);setStatus('');composer.current?.focus({preventScroll:true})}
  const dayLabel=day=>day===pepDay(new Date())?'Idag':new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE',{day:'numeric',month:'long',timeZone:'Europe/Stockholm'})
  return <section ref={panel} className="pep-modern" style={{backgroundImage:`linear-gradient(#eef9f5b8,#eef9f5d9),url(${backgroundImage||'/assets/open-chat-bg-teal.png'})`}}>
    <header className="pep-modern-heading"><span aria-hidden="true">🙌</span><div><strong>Öppen kanal</strong><small>Alla i klubben kan läsa och skriva</small></div></header>
    {burst>0&&<div className="high-five-burst" key={burst} aria-hidden="true">{Array.from({length:10},(_,i)=><span key={i} style={{left:`${7+i*9}%`,animationDelay:`${i%5*.07}s`,'--high-five-drift':`${(i%2?1:-1)*(14+i*3)}px`}}>🙌</span>)}</div>}
    <div className="pep-modern-messages" ref={messages} role="log" aria-label="Gruppens pepp och frågor" aria-live="polite" onScroll={event=>{const el=event.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(follow.current)setUnread(0)}}>
      {!timeline.length&&<div className="pep-modern-empty"><span>💬</span><strong>Börja samtalet</strong><p>Peppa en kompis eller fråga gruppen något.</p></div>}
      {timeline.map(item=>{const own=item.sender?.id===profileId,reaction=item.reactions?.find(r=>r.emoji==='👍')||{count:0,reacted:false};return <React.Fragment key={pepKey(item)}>{item.newDay&&<div className="pep-day"><span>{dayLabel(item.day)}</span></div>}<article data-message-key={pepKey(item)} className={`pep-bubble-row${own?' own':''}${item.grouped?' grouped':''}`}><span className="pep-avatar" aria-hidden="true">{!item.grouped&&(item.sender?.emoji||'🧑‍🏫')}</span><div className="pep-bubble">{!item.grouped&&<strong className="pep-author">{own?'Du':item.sender?.displayName||'Tränarna'}</strong>}{item.reply&&<button className="pep-quote" type="button" onClick={()=>{const target=[...messages.current.querySelectorAll('[data-message-key]')].find(el=>el.dataset.messageKey===pepKey(item.reply));if(target){follow.current=false;messages.current.scrollTo({top:messages.current.scrollTop+target.getBoundingClientRect().top-messages.current.getBoundingClientRect().top-(messages.current.clientHeight-target.offsetHeight)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target.classList.add('pep-highlight');setTimeout(()=>target.classList.remove('pep-highlight'),1500)}else setStatus('Det citerade meddelandet ligger utanför den hämtade historiken.')}}><strong>{item.reply.senderName||'Tidigare meddelande'}</strong><span>{item.reply.content||'Meddelandet är inte längre tillgängligt.'}</span></button>}<p>{item.content}</p><footer><time dateTime={item.createdAt}>{pepTime(item.createdAt)}</time><button type="button" className={reaction.reacted?'selected':''} disabled={reactionBusy===`${item.type}-${item.id}-👍`} aria-pressed={reaction.reacted} aria-label={`${reaction.reacted?'Ta bort':'Lägg till'} tumme upp${reaction.count?`, ${reaction.count}`:''}`} onClick={()=>onReact({messageType:item.type==='group'?'group_pep':'coach_post',messageId:item.id,emoji:'👍'})}>👍{reaction.count>0&&<span>{reaction.count}</span>}</button><button type="button" aria-label={`Svara på ${item.sender?.displayName||'tränarens'} meddelande`} onClick={()=>chooseReply(item)}>↩ <span>Svara</span></button></footer></div></article></React.Fragment>})}
    </div>
    {unread>0&&<div className="pep-unread-anchor"><button className="pep-new-messages" onClick={scrollLatest}>↓ {unread} nya meddelanden</button></div>}
    <form className="pep-modern-compose" onSubmit={send}>
      {reply&&<div className="pep-reply-preview"><div><strong>Svar till {reply.sender?.displayName||'Tränarna'}</strong><span>{reply.content}</span></div><button type="button" aria-label="Avbryt svar" onClick={()=>setReply(null)}>×</button></div>}
      {(picker||!customPepEnabled)&&<div className="pep-modern-templates">{templates.filter(([key])=>key!=='custom').map(([key,text])=><button type="button" key={key} disabled={sending} onClick={()=>{setTemplateKey(key);setContent(text);setPicker(false);composer.current?.focus({preventScroll:true})}}>{text}</button>)}</div>}
      <div className="pep-input-row"><button type="button" className="pep-template-toggle" aria-label="Välj färdig pepp" aria-expanded={picker} onClick={()=>setPicker(!picker)}>✨</button><div className="pep-input"><textarea ref={composer} rows={1} maxLength={300} disabled={sending} readOnly={!customPepEnabled} required aria-label="Meddelande till gruppen" placeholder={customPepEnabled?'Skriv till gruppen…':'Välj en färdig pepp…'} value={content} onChange={event=>{setContent(event.target.value);setTemplateKey('');setStatus('')}}/>{customPepEnabled&&<EmojiPicker onPick={emoji=>{setContent(value=>(value+emoji).slice(0,300));setTemplateKey('')}}/>}</div><button type="submit" className="pep-send" disabled={sending||!content.trim()} aria-label={sending?'Skickar':'Skicka till gruppen'}>{sending?'…':'↑'}</button></div>
      <div className="pep-compose-caption"><span>De första 4 peppen per dag ger poäng · fortsätt prata utan fler poäng.</span><details><summary>ⓘ</summary><p>Frågor här läses av hela klubben. Fråga tränarna i Tränarinfo. Skicka 🙌 för en high-five-animation.</p></details></div>{status&&<p className="pep-modern-status" role="status">{status}</p>}
    </form>
  </section>
}
