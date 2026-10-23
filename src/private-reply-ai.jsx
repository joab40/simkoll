import React, {useRef,useState} from 'react'

// Generation is supplied by the parent. This component only reviews drafts;
// applying a proposal changes the editor, never sends a message.
export default function PrivateReplyAi({draft,onUse,onGenerate,disabled=false}) {
  const [proposal,setProposal]=useState(null), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const working=useRef(false)
  const generate=async()=>{
    if(working.current || !onGenerate) return
    working.current=true;setBusy(true);setError('')
    try {
      const result=await onGenerate(draft)
      setProposal({...result,originalDraft:draft})
    } catch(reason) {setError(reason.message || 'Förslaget kunde inte skapas. Du kan skriva själv.')}
    finally {working.current=false;setBusy(false)}
  }
  return <div className="private-reply-ai">
    <button type="button" className="secondary-button private-reply-ai-button" disabled={disabled || busy || !onGenerate} aria-busy={busy} onClick={generate}>{busy && <span className="private-reply-ai-spinner" aria-hidden="true" />}{busy?'Tar fram svarsförslag…':'✦ Föreslå svar med AI'}</button>
    <small>Valfritt. AI använder det valda meddelandet, ditt utkast och relevant information från Simkoll via OpenAI. Du granskar och skickar själv.</small>
    {error && <p className="form-error" role="alert">{error}</p>}
    {proposal && <section className="private-reply-ai-preview" aria-label="Granska AI-förslag"><label>Förslag från AI<textarea maxLength={1000} rows={4} value={proposal.text} disabled={disabled} onChange={(event)=>setProposal(current=>({...current,text:event.target.value}))} /></label>
      {proposal.sources?.length>0 && <details><summary>Underlag i förslaget ({proposal.sources.length})</summary><ul>{proposal.sources.map(source=><li key={source.id}>{source.label}</li>)}</ul></details>}
      {proposal.checks?.length>0 && <div className="private-reply-ai-checks"><strong>Kontrollera innan du skickar</strong><ul>{proposal.checks.map((check,index)=><li key={index}>{check}</li>)}</ul></div>}
      {proposal.unavailable?.length>0 && <p>Underlag kunde inte hämtas: {proposal.unavailable.join(', ')}.</p>}
      {draft!==proposal.originalDraft && <p>Du har ändrat din egen text. ”Använd förslaget” ersätter texten i svarsfältet.</p>}
      <div className="private-reply-ai-actions"><button type="button" className="secondary-button" disabled={disabled || !proposal.text.trim()} onClick={()=>{onUse(proposal.text);setProposal(null)}}>Använd förslaget</button><button type="button" className="text-button" disabled={disabled} onClick={()=>setProposal(null)}>Kasta förslaget</button></div>
    </section>}
  </div>
}
