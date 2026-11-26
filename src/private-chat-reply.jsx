import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { formatFeedDate } from './community-date.js'
import { useCommunityChannel } from './use-community-channel.js'
import PrivateReplyAi from './private-reply-ai.jsx'
import './private-chat-reply.css'

export { privateThreadKey } from './private-thread-preview.js'

export default function PrivateChatReply({ thread, name, coach = false, code, request, onClose, onSent, onViewed }) {
  const dialog = useRef(null), log = useRef(null), input = useRef(null), sending = useRef(false)
  const titleId = useId()
  const [deleting, setDeleting] = useState(null)
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const params = new URLSearchParams({ privateThread: thread.kind, threadId: thread.id })
  const channel = useCommunityChannel({ code, channel: params.toString(), request })
  const follow = useRef(true)
  const messages = channel.data?.messages
  const refresh = () => channel.refresh({ force: true }).catch(() => {})
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      element.close()
      previousFocus?.focus()
    }
  }, [])
  const viewedId = useRef(null)
  const latestMessageId = messages?.at(-1)?.id
  useEffect(() => {
    if (onViewed && latestMessageId && viewedId.current !== latestMessageId) {
      viewedId.current = latestMessageId
      onViewed(messages)
    }
  }, [latestMessageId, messages, onViewed])
  useLayoutEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [latestMessageId])

  const send = async event => {
    event.preventDefault()
    const text = content.trim()
    if (sending.current || !text || !channel.data) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await request('/api/community', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trainer-thread-message', kind: thread.kind, threadId: thread.id, content: text }),
      })
      follow.current = true
      channel.setData(current => ({ ...current, messages: [...current.messages.filter(item => item.id !== result.message.id), result.message] }))
      setContent('')
      onSent?.()
      window.dispatchEvent(new Event('simkoll-private-messages-changed'))
    } catch (reason) { setError(reason.message || 'Svaret kunde inte skickas. Försök igen.') }
    finally { sending.current = false; setBusy(false) }
  }
  const remove = async item => {
    if (busy || deleting || !window.confirm('Ta bort just det här privata meddelandet?')) return
    setDeleting(item.id)
    setError('')
    try {
      await request('/api/community', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-private-message', id: item.id }),
      })
      channel.setData(current => ({ ...current, messages: current.messages.filter(message => message.id !== item.id) }))
      onSent?.()
      window.dispatchEvent(new Event('simkoll-private-messages-changed'))
    } catch (reason) { setError(reason.message) }
    finally { setDeleting(null) }
  }
  const close = () => { if (!sending.current) onClose() }
  const conversation = channel.data?.question ? [channel.data.question, ...messages] : messages
  return <dialog className="trainer-thread-dialog" ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div className="trainer-thread">
      <header>
        <div><h2 id={titleId}>🔒 {coach ? `Privat dialog med ${name || 'simmaren'}` : 'Privat dialog med tränarna'}</h2>
          <p>{coach ? 'Synlig för simmaren och tränarna.' : 'Synlig för dig och tränarna.'}</p></div>
        <button type="button" className="secondary-button" autoFocus disabled={busy} onClick={close}>Stäng</button>
      </header>
      {channel.error && <div className="trainer-thread-error" role="status"><span>{channel.error}</span><button type="button" className="text-button" onClick={refresh}>Försök igen</button></div>}
      <div className="trainer-thread-log" ref={log} role="log" aria-label="Privata meddelanden" onScroll={event => {
        const el = event.currentTarget
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}>
        {conversation?.map(item => {
          const own = item.senderRole === (coach ? 'coach' : 'swimmer')
          return <article key={item.id} data-own={own}>
            <strong>{own ? 'Du' : coach ? name || 'Simmaren' : 'Tränare'}</strong>
            <p>{item.content}</p><time dateTime={item.createdAt}>{formatFeedDate(item.createdAt)}</time>
            {coach && item.id !== channel.data.question?.id && <button type="button" className="trainer-thread-remove"
              disabled={busy || Boolean(deleting)} onClick={() => remove(item)}>{deleting === item.id ? 'Tar bort…' : 'Ta bort'}</button>}
          </article>
        })}
        {channel.loading && !channel.data && <p role="status">Hämtar dialogen…</p>}
        {conversation?.length === 0 && <p>Skriv dialogens första meddelande.</p>}
      </div>
      {channel.data && <form onSubmit={send} aria-busy={busy}>
        <label>Privat meddelande<textarea ref={input} required maxLength={1000} rows={2} value={content} disabled={busy}
          onChange={event => { setContent(event.target.value); setError('') }} placeholder="Skriv ett svar…" /></label>
        {coach && channel.data.question && <PrivateReplyAi draft={content} disabled={busy}
          onUse={text => { setContent(text); setError(''); input.current?.focus() }}
          onGenerate={draft => request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'propose-private-reply', messageId: thread.id, draft }) })} />}
        <button className="primary-button" type="submit" disabled={busy || Boolean(deleting) || !content.trim()}>{busy ? 'Skickar…' : 'Skicka privat ↑'}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>}
    </div>
  </dialog>
}
