import React, { useEffect, useId, useRef, useState } from 'react'
import './private-chat-reply.css'
import PrivateReplyAi from './private-reply-ai.jsx'

export default function PrivateChatReply({ message, code, request, onClose, onSent }) {
  const input = useRef(null), sending = useRef(false)
  const titleId = useId(), hintId = useId()
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('')
  const name = message.sender?.displayName || 'simmaren'
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      input.current?.focus({preventScroll:true})
      const scroller = input.current?.closest('.open-chat-messages')
      const actions = input.current?.closest('section')?.querySelector('.private-reply-actions')
      if (scroller && actions) {
        const overflow = actions.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 12
        if (overflow > 0) scroller.scrollTop += overflow
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])
  const send = async (event) => {
    event.preventDefault()
    const text = content.trim()
    if (sending.current || sent || !text || !message.senderProfileId) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', recipientId: message.senderProfileId, replyToMessageId: message.id, content: text }) })
      setSent(true)
      onSent?.(result.privateReply)
    } catch (reason) { setError(reason.message || 'Svaret kunde inte skickas. Försök igen.') }
    finally { sending.current = false; setBusy(false) }
  }
  return <section className="private-chat-reply" aria-labelledby={titleId} aria-describedby={hintId} onKeyDown={(event) => { if (event.key === 'Escape' && !sending.current) { event.stopPropagation(); onClose() } }}>
    <header><h3 id={titleId}>🔒 Svara privat till {name}</h3><button type="button" className="private-reply-close" aria-label="Stäng privat svar" disabled={busy} onClick={onClose}>×</button></header>
    <p id={hintId}>Bara {name} och tränarna kan läsa svaret.</p>
    {sent ? <div className="private-reply-success" role="status"><strong>✓ Privat svar skickat till {name}</strong><button type="button" className="primary-button" onClick={onClose}>Klart</button></div> : <form onSubmit={send} aria-busy={busy}>
      <label>Ditt privata svar<textarea ref={input} required maxLength={1000} rows={2} value={content} disabled={busy} onChange={(event) => { setContent(event.target.value); setError('') }} placeholder={`Skriv privat till ${name}…`} /></label>
      <PrivateReplyAi draft={content} disabled={busy} onUse={(text)=>{setContent(text);setError('');input.current?.focus()}} onGenerate={(draft)=>request('/api/community',code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'propose-private-reply',messageId:message.id,draft})})} />
      <div className="private-reply-actions"><small>{content.length}/1000</small><button type="submit" className="primary-button" disabled={busy || !content.trim()}>{busy ? 'Skickar privat…' : 'Skicka privat →'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
  </section>
}
