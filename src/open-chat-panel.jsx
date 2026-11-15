import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { chatBackgroundUrl } from './chat-background.js'
import { latestCoachMessageId, markCoachMessageRead } from './coach-info.js'
import PrivateChatReply from './private-chat-reply.jsx'
import ChatEmojiPicker from './chat-emoji-picker.jsx'
import { formatFeedDate } from './community-date.js'
import { useCommunityChannel } from './use-community-channel.js'

const mergeChat = (current, data) => {
  const next = data.openChat || { enabled: false, messages: [] }
  const visible = next.messages || []
  const pending = (current?.openChat?.messages || []).filter(item => item.pending && !visible.some(loaded => loaded.id === item.id))
  return { ...data, openChat: { ...next, messages: [...visible, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) } }
}

export default function OpenChatPanel(props) {
  return <InfoChannelPanel key={`${props.code}:${props.coach ? 'coach' : props.profileId || 'no-profile'}`} {...props} />
}

function InfoChannelPanel({ code, coach = false, profileId = '', fitViewport = false, active = true, request = apiRequest }) {
  const [privateReply, setPrivateReply] = useState(null)
  const privateReplyTrigger = useRef(null)
  const closePrivateReply = () => { setPrivateReply(null); privateReplyTrigger.current?.focus() }
  const channel = useCommunityChannel({ code, channel: 'openChat=true', active, request, merge: mergeChat })
  const chat = channel.data?.openChat || { enabled: false, messages: [] }
  const setChat = updater => channel.setData(current => ({ ...current, openChat: updater(current?.openChat || { enabled: false, messages: [] }) }))
  const [content, setContent] = useState(''), [status, setStatus] = useState(''), [unread, setUnread] = useState(0)
  const deletingMessage = useRef(false)
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const chatPanelRef = useRef(null)
  const scroller = useRef(null), follow = useRef(true), seen = useRef(new Set())
  const load = () => channel.refresh({ force: true }).catch(() => {})
  useEffect(() => {
    if (!coach && profileId && chat.enabled && active) {
      const latest = latestCoachMessageId(chat.messages)
      if (latest) markCoachMessageRead(window.localStorage, profileId, latest)
    }
  }, [coach, profileId, chat, active])
  useLayoutEffect(() => {
    if (!active || channel.loading) return
    const ids = new Set(chat.messages.map(item => item.id))
    if (follow.current && !privateReply && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
    else if (!follow.current) setUnread(value => value + chat.messages.filter(item => !seen.current.has(item.id)).length)
    seen.current = ids
  }, [chat.messages, active, channel.loading])
  useLayoutEffect(() => {
    if (!active || !fitViewport || (!chat.enabled && !channel.loading) || !chatPanelRef.current) return
    const panel = chatPanelRef.current
    const footer = document.querySelector(coach ? '.app-meta' : '.swimmer-app-meta')
    const viewport = window.visualViewport
    const measure = () => {
      const viewportHeight = viewport?.height || window.innerHeight
      const viewportTop = viewport?.offsetTop || 0
      const panelTop = panel.getBoundingClientRect().top - viewportTop
      const footerHeight = footer?.getBoundingClientRect().height || 0
      const footerGap = 12
      const available = Math.min(768, viewportHeight - panelTop - footerHeight - footerGap)
      panel.style.setProperty('--coach-info-chat-height', `${Math.max(180, available)}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
    }
  }, [active, fitViewport, chat.enabled, channel.loading, coach])
  const send = async (event) => {
    event.preventDefault()
    const messageContent = content.trim()
    if (!messageContent) return
    follow.current = true; setUnread(0)
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const pendingMessage = { id: pendingId, content: messageContent, createdAt: new Date().toISOString(), senderRole: coach ? 'coach' : 'swimmer', senderProfileId: profileId || null, sender: coach ? { displayName: 'Tränare', emoji: '🧑‍🏫' } : { displayName: 'Du', emoji: '🏊' }, pending: true }
    setChat((current) => ({ ...current, messages: [...(current.messages || []), pendingMessage] }))
    setContent('')
    setStatus('Skickar…')
    try {
      const result = await request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open-chat-message', content: messageContent }) })
      const savedMessage = result.message || { ...pendingMessage, pending: false }
      setChat((current) => ({ ...current, messages: [...(current.messages || []).filter((item) => item.id !== pendingId && item.id !== savedMessage.id), savedMessage].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }))
      setStatus('')
      // Uppdatera övriga meddelanden i bakgrunden; sändningen väntar inte på en full omladdning.
      load()
    } catch (error) {
      setChat((current) => ({ ...current, messages: (current.messages || []).filter((item) => item.id !== pendingId) }))
      setContent((current) => current || messageContent)
      setStatus(error.message)
    }
  }
  const remove = async (item) => {
    if (deletingMessage.current) return
    deletingMessage.current = true
    const label = item.sender?.displayName || (item.senderRole === 'coach' ? 'Tränaren' : 'Simmaren')
    const excerpt = item.content.length > 100 ? `${item.content.slice(0, 100)}…` : item.content
    if (!window.confirm(`Ta bort just ${label}s inlägg?\n\n”${excerpt}”`)) { deletingMessage.current = false; return }
    setDeletingMessageId(item.id)
    try {
      await request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-open-chat-message', id: item.id }) })
      await load()
    } catch (error) {
      window.alert(error.message)
    } finally {
      deletingMessage.current = false
      setDeletingMessageId(null)
    }
  }
  const clear = async () => { if (!window.confirm('Rensa alla meddelanden i den öppna chatten?')) return; try { await request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-open-chat' }) }); await load() } catch (error) { setStatus(error.message) } }
  if (!channel.data) return <section ref={chatPanelRef} className="message-channel-loading" aria-busy={channel.loading}><span aria-hidden="true">💬</span><h2>Info från tränarna</h2><p role="status">{channel.error || 'Hämtar tränarinfon…'}</p>{channel.error && <button type="button" onClick={load}>Försök igen</button>}<div aria-hidden="true" className="message-loading-lines"><i /><i /><i /></div></section>
  if (!chat.enabled) return coach ? <section className="message-channel-loading"><h2>Tränarinfo är avstängd</h2><p>Klubbflödet och privata meddelanden finns i flikarna ovan.</p></section> : null
  const chatBackground = chatBackgroundUrl(chat.backgroundImage || '/assets/open-chat-bg-teal.png')
  return <section ref={chatPanelRef} className={`open-chat-panel coach-open-chat${fitViewport ? ' swimmer-info-chat' : ''}`} style={{ backgroundImage: `linear-gradient(rgba(4,16,65,.48),rgba(4,16,65,.48)),url(${chatBackground})` }}>
    <div className="open-chat-heading">
      {coach && <div><p className="eyebrow">Tränarinfo</p><h2>Info från tränarna 💬</h2></div>}
      <small>{coach ? 'Tränarinfo till gruppen · privata svar märks med 🔒' : chat.coachOnly ? 'Meddelanden från tränarna' : chat.swimmerPrivate !== false ? 'Dina frågor och privata svar syns bara för dig och tränarna' : 'Gruppchatt · svar märkta 🔒 är privata'}</small>
      {coach && <details className="chat-management"><summary>Hantera</summary><button type="button" className="text-button danger-text" onClick={clear}>Rensa chatten</button></details>}
    </div>
    <div className="open-chat-messages" ref={scroller} role="log" aria-label="Tränarinfo och frågor" aria-live="polite" onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; if (follow.current) setUnread(0) }}>{chat.messages?.length ? chat.messages.map((item) => {
      const canReply = coach && item.senderRole === 'swimmer' && item.senderProfileId && !item.pending
      const openReply = (event) => { privateReplyTrigger.current = event.currentTarget; setPrivateReply(item) }
      const original = <><strong>{item.sender?.displayName || 'Simmare'}</strong><span className="private-question-content">{item.content}</span><small>{item.pending ? 'Skickar…' : formatFeedDate(item.createdAt)}</small>{canReply && <small className="private-reply-hint">↩ Svara privat till {item.sender?.displayName || 'simmaren'}</small>}</>
      return <article className={`${item.senderRole === 'swimmer' ? 'swimmer-message' : 'coach-message'}${item.pending ? ' pending-message' : ''}`} key={item.id}>
        <span>{item.senderRole === 'coach' ? '🧑‍🏫' : (item.sender?.emoji || '🏊')}</span>
        <div>{canReply ? <button type="button" className="private-reply-message" onClick={openReply} aria-expanded={privateReply?.id === item.id}>{original}</button> : original}
          {item.privateReplies?.map((reply) => <section className="private-thread-reply" key={reply.id}><strong>🔒 {coach ? `Privat svar till ${item.sender?.displayName || 'simmaren'}` : 'Tränarnas privata svar till dig'}</strong><p>{reply.content}</p><small>{formatFeedDate(reply.createdAt)}</small></section>)}
          {privateReply?.id === item.id && <PrivateChatReply key={item.id} message={item} code={code} request={request} onClose={closePrivateReply} onSent={(reply) => {
            if (reply) setChat((current) => ({...current,messages:current.messages.map((message) => message.id === item.id ? {...message,privateReplies:[...(message.privateReplies || []).filter((row) => row.id !== reply.id),reply]} : message)}))
            window.dispatchEvent(new Event('simkoll-private-message-sent'))
            load()
          }} />}
        </div>
        {!item.pending && (coach || item.senderProfileId === profileId) && <button type="button" className="text-button danger-text" disabled={deletingMessageId !== null} onClick={() => remove(item)}>{deletingMessageId === item.id ? 'Tar bort…' : 'Ta bort'}</button>}
      </article>
    }) : <p className="empty">Chatten är tom – skriv den första hälsningen!</p>}</div>
    {unread > 0 && <button type="button" className="info-new-messages" onClick={() => { follow.current = true; setUnread(0); if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight }}>↓ {unread} nya meddelanden</button>}
    {(!chat.coachOnly || coach) && !privateReply && <form className="open-chat-compose" onSubmit={send}><div className="chat-compose-input"><textarea required aria-label={coach ? 'Tränarinfo till gruppen' : 'Fråga till tränarna'} maxLength={1000} value={content} placeholder={coach ? 'Skriv tränarinfo till gruppen…' : 'Ställ en fråga…'} onChange={(event) => setContent(event.target.value)} /><ChatEmojiPicker onPick={(emoji) => setContent((value) => `${value}${emoji}`)} /></div><button className="primary-button" disabled={!content.trim()}>Skicka ↑</button>{status && <small role="status">{status}</small>}</form>}
    {channel.error && <p className="private-replies-warning" role="status">Uppdateringen misslyckades. Senast hämtade meddelanden visas. <button type="button" onClick={load}>Försök igen</button></p>}
    {chat.privateRepliesWarning && <p className="private-replies-warning" role="status">{chat.privateRepliesWarning}</p>}
  </section>
}
