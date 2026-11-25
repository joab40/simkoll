import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import { chatBackgroundUrl } from './chat-background.js'
import { markCoachMessageRead } from './coach-info.js'
import PrivateChatReply, { privateThreadKey } from './private-chat-reply.jsx'
import OpenChatReadDetails from './open-chat-read-details.jsx'
import ChatEmojiPicker from './chat-emoji-picker.jsx'
import { formatFeedDate } from './community-date.js'
import { useCommunityChannel } from './use-community-channel.js'
import { useOpenChatEngagement } from './use-open-chat-engagement.js'
import './open-chat-engagement.css'

const emptyChat = { enabled: false, messages: [] }

function MessageEngagement({ item, coach, engagement, onShowReaders }) {
  const { seenCount, recipientCount, likeCount, liked } = item.engagement
  return <span className="info-message-engagement">
    {coach && Number.isInteger(recipientCount)
      ? <button type="button" className="info-seen-button" aria-haspopup="dialog" onClick={onShowReaders}
          aria-label={`Sett av ${seenCount} av ${recipientCount} simmare. Visa vilka som saknar en visning.`}>Sett av {seenCount} / {recipientCount} <span aria-hidden="true">›</span></button>
      : <small className="info-seen" aria-label={`Sett av ${seenCount} simmare`}>Sett av {seenCount}</small>}
    {coach
      ? <span className="info-like-count" aria-label={`${likeCount} tummar upp`}>👍 {likeCount}</span>
      : <button type="button" className="info-like-button" aria-pressed={liked} disabled={engagement.likingId !== null}
          aria-label={`${liked ? 'Ta bort gilla' : 'Gilla meddelandet'}. ${likeCount} tummar upp`}
          onClick={() => engagement.toggleLike(item)}><span aria-hidden="true">👍</span>{likeCount > 0 && likeCount}</button>}
  </span>
}

const mergeChat = (current, data) => {
  const next = data.openChat || emptyChat
  const visible = next.messages || []
  const pending = (current?.openChat?.messages || []).filter(item => item.pending && !visible.some(loaded => loaded.id === item.id))
  return { ...data, openChat: { ...next, messages: [...visible, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) } }
}

export default function OpenChatPanel(props) {
  return <InfoChannelPanel key={`${props.code}:${props.coach ? 'coach' : props.profileId || 'no-profile'}`} {...props} />
}

function InfoChannelPanel({ code, coach = false, profileId = '', fitViewport = false, active = true, request = apiRequest, onOpenThread }) {
  const [privateReply, setPrivateReply] = useState(null)
  const [readDetailsMessage, setReadDetailsMessage] = useState(null)
  const channel = useCommunityChannel({ code, channel: 'openChat=true', active, request, merge: mergeChat })
  const chat = channel.data?.openChat || emptyChat
  const setChat = updater => channel.setData(current => ({ ...current, openChat: updater(current?.openChat || emptyChat) }))
  const [content, setContent] = useState(''), [status, setStatus] = useState(''), [unread, setUnread] = useState(0)
  const deletingMessage = useRef(false)
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const chatPanelRef = useRef(null)
  const scroller = useRef(null), follow = useRef(true), seen = useRef(new Set())
  const engagement = useOpenChatEngagement({
    active: !coach && !!profileId && active && chat.enabled,
    messages: chat.messages, scroller, code, request, setData: channel.setData,
  })
  const load = () => channel.refresh({ force: true }).catch(() => {})
  const latestCoachId = chat.messages.findLast(item => item.senderRole === 'coach' && !item.pending)?.id
  useEffect(() => {
    if (!coach && profileId && chat.enabled && active && latestCoachId) {
      markCoachMessageRead(window.localStorage, profileId, latestCoachId)
    }
  }, [coach, profileId, chat.enabled, active, latestCoachId])
  useLayoutEffect(() => {
    if (!active || channel.loading) return
    const ids = new Set(chat.messages.map(item => item.id))
    if (follow.current && !privateReply && !readDetailsMessage && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
    else if (!follow.current) setUnread(value => value + chat.messages.filter(item => !seen.current.has(item.id)).length)
    seen.current = ids
  }, [chat.messages, active, channel.loading])
  useLayoutEffect(() => {
    if (!coach || !active || !fitViewport || (!chat.enabled && !channel.loading) || !chatPanelRef.current) return
    const panel = chatPanelRef.current
    const footer = document.querySelector('.app-meta')
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
      if (coach) void load()
      setStatus('')
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
      setChat(current => ({ ...current, messages: current.messages.filter(message => message.id !== item.id) }))
    } catch (error) {
      window.alert(error.message)
    } finally {
      deletingMessage.current = false
      setDeletingMessageId(null)
    }
  }
  const clear = async () => { if (!window.confirm('Rensa alla meddelanden i den öppna chatten?')) return; try { await request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-open-chat' }) }); setChat(current => ({ ...current, messages: [] })) } catch (error) { setStatus(error.message) } }
  if (!channel.data) return <section ref={chatPanelRef} className={coach ? 'message-channel-loading' : 'swimmer-message-channel channel-placeholder'} aria-busy={channel.loading}>{coach && <><span aria-hidden="true">💬</span><h2>Info från tränarna</h2></>}<p role="status">{channel.error || 'Hämtar tränarinfon…'}</p>{channel.error && <button type="button" onClick={load}>Försök igen</button>}{coach && <div aria-hidden="true" className="message-loading-lines"><i /><i /><i /></div>}</section>
  if (!chat.enabled) return coach ? <section className="message-channel-loading"><h2>Tränarinfo är avstängd</h2><p>Klubbflödet och privata meddelanden finns i flikarna ovan.</p></section> : <section className="swimmer-message-channel channel-placeholder"><p>Gruppinformationen är avstängd.</p></section>
  const chatBackground = coach ? chatBackgroundUrl(chat.backgroundImage || '/assets/open-chat-bg-teal.png') : null
  return <section ref={chatPanelRef} className={`open-chat-panel coach-open-chat${coach ? '' : ' swimmer-info-chat swimmer-message-channel'}`}
    style={chatBackground ? { backgroundImage: `linear-gradient(rgba(4,16,65,.48),rgba(4,16,65,.48)),url(${chatBackground})` } : undefined}>

    <div className="open-chat-heading">
      {coach ? <div><p className="eyebrow">Tränarinfo</p><h2>Info från tränarna 💬</h2></div> : <span className="channel-heading-icon" aria-hidden="true">{chat.swimmerPrivate !== false && !chat.coachOnly ? '🔒' : '💬'}</span>}
      <small>{coach ? 'Tränarinfo till gruppen · privata svar märks med 🔒' : chat.coachOnly ? 'Meddelanden från tränarna' : chat.swimmerPrivate !== false ? 'Dina frågor och svaren från tränarna är privata.' : 'Frågor i gruppchatten kan läsas av alla. Privata svar märks med 🔒.'}</small>
      {coach && <details className="chat-management"><summary>Hantera</summary><button type="button" className="text-button danger-text" onClick={clear}>Rensa chatten</button></details>}
    </div>
    <div className="open-chat-messages" ref={scroller} role="log" aria-label="Tränarinfo och frågor" aria-live="polite" onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; if (follow.current) setUnread(0) }}>{chat.messages?.length ? chat.messages.map((item) => {
      const own = Boolean(!coach && profileId && item.senderProfileId === profileId)
      const canReply = (coach || own) && item.senderRole === 'swimmer' && item.senderProfileId && !item.pending
      const openReply = () => {
        const thread = { kind: 'question', id: item.id }
        if (coach) setPrivateReply({ ...thread, name: item.sender?.displayName })
        else onOpenThread?.(thread)
      }
      const latestReply = item.privateReplies?.at(-1)
      const removeButton = !item.pending && (coach || own) && <button type="button" className="text-button danger-text"
        disabled={deletingMessageId !== null} onClick={() => remove(item)}>
        {deletingMessageId === item.id ? 'Tar bort…' : 'Ta bort'}
      </button>
      const timestamp = <small>{item.pending ? 'Skickar…' : formatFeedDate(item.createdAt)}</small>
      const original = <>
        <strong>{own ? 'Du' : item.sender?.displayName || 'Simmare'}</strong>
        <span className="private-question-content">{item.content}</span>
        {coach && !item.engagement ? timestamp : <span className="info-message-meta">
          {timestamp}
          {item.engagement && <MessageEngagement item={item} coach={coach} engagement={engagement} onShowReaders={() => setReadDetailsMessage(item)} />}
          {!coach && removeButton}
        </span>}
        {coach && canReply && !latestReply && <small className="private-reply-hint">↩ Svara privat till {item.sender?.displayName || 'simmaren'}</small>}
      </>
      return <article className={`${item.senderRole === 'swimmer' ? 'swimmer-message' : 'coach-message'}${item.pending ? ' pending-message' : ''}`} key={item.id} data-own={own}>
        <span aria-hidden="true">{item.senderRole === 'coach' ? '🧑‍🏫' : (item.sender?.emoji || '🏊')}</span>
        <div data-open-chat-view={item.engagement && !coach ? item.id : undefined}>{
          coach && canReply && !latestReply
            ? <button type="button" className="private-reply-message" onClick={openReply} aria-haspopup="dialog">{original}</button>
            : original}
          {latestReply && canReply ? <button type="button" className="private-thread-reply" onClick={openReply} aria-haspopup="dialog">
            <strong>🔒 {coach ? `Privat svar till ${item.sender?.displayName || 'simmaren'}` : 'Privat till dig'}</strong>
            <span className="private-question-content">{latestReply.content}</span>
            <small>Öppna dialog →</small>
          </button> : !coach && canReply && <button type="button" className="text-button" onClick={openReply} aria-haspopup="dialog">🔒 Fortsätt privat →</button>}
        </div>
        {coach && removeButton}
      </article>
    }) : <p className="empty">Inga meddelanden ännu.</p>}</div>
    {unread > 0 && <button type="button" className="info-new-messages" onClick={() => { follow.current = true; setUnread(0); if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight }}>↓ {unread} nya meddelanden</button>}
    {(!chat.coachOnly || coach) && <form className="open-chat-compose" onSubmit={send}><div className="chat-compose-input"><textarea required rows={2} aria-label={coach ? 'Tränarinfo till gruppen' : 'Fråga till tränarna'} maxLength={1000} value={content} placeholder={coach ? 'Skriv tränarinfo till gruppen…' : 'Ställ en fråga…'} onChange={(event) => setContent(event.target.value)} /><ChatEmojiPicker onPick={emoji => setContent(value => `${value}${emoji}`.slice(0, 1000))} /></div><button className="primary-button" disabled={!content.trim()}>Skicka ↑</button>{status && <small role="status">{status}</small>}</form>}
    {channel.error && <p className="private-replies-warning" role="status">Uppdateringen misslyckades. Senast hämtade meddelanden visas. <button type="button" onClick={load}>Försök igen</button></p>}
    {engagement.error && <p className="private-replies-warning" role="status">{engagement.error}</p>}
    {chat.privateRepliesWarning && <p className="private-replies-warning" role="status">{chat.privateRepliesWarning}</p>}
    {coach && active && privateReply && <PrivateChatReply key={privateThreadKey(privateReply)} thread={privateReply}
      name={privateReply.name} coach code={code} request={request} onClose={() => setPrivateReply(null)} onSent={load} />}
    {coach && active && readDetailsMessage && <OpenChatReadDetails message={readDetailsMessage} code={code} request={request} onClose={() => setReadDetailsMessage(null)} />}
  </section>
}
