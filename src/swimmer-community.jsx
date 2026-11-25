import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import OpenChatPanel from './open-chat-panel.jsx'
import PrivateChatReply, { privateThreadKey } from './private-chat-reply.jsx'
import PeppChannelPanel from './pepp-channel.jsx'
import ChatEmojiPicker from './chat-emoji-picker.jsx'
import { formatFeedDate } from './community-date.js'
import { applyPepReaction, pepKey } from './pep-chat.js'
import { useCommunityChannel } from './use-community-channel.js'

const KUDOS_OPTIONS = [
  ['great_job', 'Grymt jobbat idag! 💪'], ['great_energy', 'Bra energi! ⚡'],
  ['nice_technique', 'Snygg teknik! 🌊'], ['thanks', 'Tack för peppen! 🙌'],
  ['fun_together', 'Kul att träna med dig! 😊'], ['strong_effort', 'Stark insats! 🔥'], ['custom', 'Skriv eget peppmeddelande…'],
]
const GROUP_PEP_OPTIONS = [
  ['group_start', 'Nu kör vi! 🔥'], ['group_energy', 'Bra energi i gruppen idag ⚡'],
  ['group_great_job', 'Det blir ett grymt pass idag 💪'], ['group_build', 'Idag bygger vi vidare 🌊'],
  ['group_focus', 'Håll ihop hela vägen 🎯'], ['group_next', 'Ser fram emot nästa pass 🙌'],
  ['group_fun', 'Kul att simma med er! 😊'], ['custom', 'Skriv eget gruppmeddelande…'],
]

const noItems = []
const post = (request, code, body) => request('/api/community', code, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const notifyPoints = () => window.dispatchEvent(new Event('simkoll-points-changed'))

function ChannelPlaceholder({ label, channel }) {
  return <section className="swimmer-message-channel channel-placeholder" aria-busy={channel.loading}>
    <p role="status">{channel.error || label}</p>
    {channel.error && <button type="button" className="secondary-button" onClick={() => channel.refresh().catch(() => {})}>Försök igen</button>}
  </section>
}

function ChatPageHeading({ title, onBack, points }) {
  return <header className="coach-info-header">
    <button type="button" className="back-button" onClick={onBack} aria-label="Tillbaka">←</button>
    <h1>{title}</h1>
    {points?.current && <small className="pep-points">{points.current.emoji} {points.total} p</small>}
  </header>
}

export function CoachInfoPage({ code, profile, initialThread, onBack, request = apiRequest }) {
  const [thread, setThread] = useState(initialThread)
  const privateChannel = useCommunityChannel({ code, request, active: Boolean(profile), channel: 'channel=trainer-private' })
  const messages = privateChannel.data?.messages || noItems
  return <main className="page-content coach-info-page swimmer-chat-page">
    <ChatPageHeading title="Info från tränarna" onBack={onBack} />
    {(messages.length > 0 || privateChannel.error) && <section className="trainer-thread-list" aria-label="Privata dialoger">
      <h2>🔒 Privata meddelanden till dig</h2>
      {messages.slice(0, 1).map(item => <TrainerPrivateCard key={item.id} item={item} onOpen={setThread} />)}
      {messages.length > 1 && <details><summary>Fler privata dialoger</summary>
        {messages.slice(1).map(item => <TrainerPrivateCard key={item.id} item={item} onOpen={setThread} />)}
      </details>}
      {privateChannel.error && <p role="status">Kunde inte uppdatera privata meddelanden. <button type="button" className="text-button" onClick={() => privateChannel.refresh({ force: true }).catch(() => {})}>Försök igen</button></p>}
    </section>}
    <OpenChatPanel code={code} profileId={profile?.id} fitViewport request={request} onOpenThread={setThread} />
    {thread && <PrivateChatReply key={privateThreadKey(thread)} thread={thread} code={code} request={request} onClose={() => setThread(null)} />}
  </main>
}

function TrainerPrivateCard({ item, onOpen }) {
  return <button type="button" className="trainer-thread-open" aria-haspopup="dialog" onClick={() => onOpen(item.thread)}>
    <span>{item.content}</span><small>{formatFeedDate(item.createdAt)} · Öppna dialog →</small>
  </button>
}

export function Community({ profile, code, points, customPepEnabled = true, initialView = 'group', onBack, request = apiRequest }) {
  const [feedView, setFeedView] = useState(initialView)
  useEffect(() => { setFeedView(initialView) }, [initialView])
  return <main className="community-page pep-channel-page swimmer-chat-page">
    <ChatPageHeading title="Peppflödet" points={points} onBack={onBack} />
    <nav className="feed-tabs" aria-label="Peppkanaler">
      <button type="button" aria-pressed={feedView === 'group'} className={feedView === 'group' ? 'active' : ''} onClick={() => setFeedView('group')}>Öppen kanal</button>
      <button type="button" aria-pressed={feedView === 'private'} className={feedView === 'private' ? 'active' : ''} onClick={() => setFeedView('private')}>Min privata pepp</button>
    </nav>
    <div hidden={feedView !== 'group'}>
      <SwimmerClubFeed active={feedView === 'group'} code={code} profileId={profile.id} request={request} customPepEnabled={customPepEnabled} />
    </div>
    <div hidden={feedView !== 'private'}>
      <SwimmerPrivatePep active={feedView === 'private'} code={code} profileId={profile.id} request={request} customPepEnabled={customPepEnabled} />
    </div>
  </main>
}

function SwimmerClubFeed({ active, code, profileId, request, customPepEnabled }) {
  const channel = useCommunityChannel({ code, request, active, channel: 'channel=club' })
  const { setData } = channel
  const items = channel.data?.items || noItems
  const [reactionBusy, setReactionBusy] = useState(false)
  const [error, setError] = useState('')
  const reacting = useRef(false)
  const pendingPoints = useRef(new Set())
  const pendingId = items.find(item => item.sender?.id === profileId && item.moderationStatus === 'pending')?.id

  useEffect(() => {
    if (!active || !pendingId) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const state = await request(`/api/community?pepStatus=${encodeURIComponent(pendingId)}`, code, { retry: false, signal: controller.signal })
        if (controller.signal.aborted || state.status === 'pending') return
        setData(current => ({ ...current, items: current.items.map(item =>
          item.type === 'group' && item.id === pendingId && item.moderationStatus === 'pending' ? {
            ...item, moderationStatus: state.status, pointEligible: state.pointEligible,
            content: state.status === 'rejected' ? '' : item.content,
            moderationMessage: state.status === 'rejected' ? state.message : null,
          } : item,
        ) }))
      } catch { /* The next visible poll retrieves the final status. */ }
    }, 2200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [active, code, pendingId, request, setData])

  useEffect(() => {
    let pointsChanged = false
    for (const item of items) {
      if (item.type !== 'group' || !pendingPoints.current.has(item.id)) continue
      const approved = item.moderationStatus === 'approved' && item.pointEligible === false
      if (approved || item.moderationStatus === 'rejected') pendingPoints.current.delete(item.id)
      if (approved) pointsChanged = true
    }
    if (pointsChanged) notifyPoints()
  }, [items])

  const send = async body => {
    const result = await post(request, code, body)
    if (result.message) {
      const saved = { ...result.message, pointEligible: result.pointEligible === true }
      if (result.moderationPending && result.pointEligible) pendingPoints.current.add(saved.id)
      setData(current => {
        const quoted = saved.reply && current.items.find(item => pepKey(item) === pepKey(saved.reply))
        const message = quoted ? {
          ...saved, reply: { ...saved.reply, senderName: quoted.sender?.displayName || 'Tränarna', content: quoted.content?.slice(0, 160) },
        } : saved
        return { ...current, items: [...current.items.filter(item => pepKey(item) !== pepKey(message)), message] }
      })
    }
    if (result.awardedPoints) notifyPoints()
    return result
  }

  const react = async body => {
    if (reacting.current) return
    reacting.current = true
    setReactionBusy(true)
    setError('')
    try {
      const result = await post(request, code, { action: 'toggle-reaction', ...body })
      setData(current => ({ ...current, items: applyPepReaction(current.items, body, result.reacted) }))
    } catch (failure) { setError(failure.message) }
    finally { reacting.current = false; setReactionBusy(false) }
  }

  if (!channel.data) return <ChannelPlaceholder label="Hämtar peppflödet…" channel={channel} />
  return <>
    {(error || channel.error) && <p className="form-error" role="status">{error || 'Kunde inte uppdatera peppflödet. Senast hämtade inlägg visas.'}</p>}
    <PeppChannelPanel items={items} profileId={profileId} active={active}
      customPepEnabled={customPepEnabled} templates={GROUP_PEP_OPTIONS} EmojiPicker={ChatEmojiPicker}
      onSend={send} onReact={react} reactionBusy={reactionBusy} />
  </>
}

function SwimmerPrivatePep({ active, code, profileId, request, customPepEnabled }) {
  const channel = useCommunityChannel({ code, request, active, channel: 'channel=swimmer-private' })
  const [recipientId, setRecipientId] = useState('')
  const [content, setContent] = useState('')
  const [templateKey, setTemplateKey] = useState('great_job')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const selectedTemplate = !customPepEnabled && templateKey === 'custom' ? 'great_job' : templateKey

  const send = async event => {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setStatus('')
    try {
      await post(request, code, { mode: 'private', recipientId, templateKey: selectedTemplate, content: selectedTemplate === 'custom' ? content : undefined })
      setStatus('Peppen är skickad! +1 poäng')
      setRecipientId('')
      setContent('')
      notifyPoints()
      void channel.refresh({ force: true }).catch(() => {})
    } catch (failure) { setStatus(failure.message) }
    finally { sending.current = false; setBusy(false) }
  }

  const remove = async id => {
    if (!window.confirm('Ta bort ditt privata meddelande?')) return
    try {
      await post(request, code, { action: 'delete-private-message', id })
      channel.setData(current => ({ ...current, messages: current.messages.filter(item => item.id !== id) }))
    } catch (failure) { setStatus(failure.message) }
  }

  if (!channel.data) return active ? <ChannelPlaceholder label="Hämtar din privata pepp…" channel={channel} /> : null
  const { privateKudos, messages, recipients } = channel.data
  return <div className="community-layout">
    <section className="feed-column" aria-label="Din privata historik">
      {channel.error && <p role="status">Kunde inte uppdatera. Senast hämtade meddelanden visas.</p>}
      {privateKudos.length ? <div className="feed-list">
        {privateKudos.map(item => <article className="feed-item private-post" key={item.id}>
          <span aria-hidden="true">{item.sender.emoji}</span>
          <div>
            <strong>{item.sender.id === profileId ? `Du → ${item.recipient.emoji} ${item.recipient.displayName}` : `${item.sender.displayName} → dig`}</strong>
            <p>{item.content}</p>
            <small>🔒 Privat · {formatFeedDate(item.createdAt)}</small>
          </div>
        </article>)}
      </div> : <p className="empty">Du har ingen privat pepp ännu.</p>}
      {messages.length > 0 && <section className="private-messages">
        <h2>Privata meddelanden</h2>
        {messages.map(item => <article key={item.id}>
          <span aria-hidden="true">✉️</span>
          <div><strong>{item.fromCoach ? 'Tränarna → dig' : 'Du → tränarna'}</strong>
            <p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small>
          </div>
          {item.toCoach && !item.fromCoach && <button type="button" className="text-button danger-text" onClick={() => remove(item.id)}>Ta bort</button>}
        </article>)}
      </section>}
    </section>
    <aside className="kudos-panel">
      <h2>Skicka privat pepp</h2>
      <p>Skicka en hälsning till en simmarkompis. De första fyra peppen per dag ger poäng, inklusive den öppna kanalen.</p>
      <form onSubmit={send}>
        <label>Till
          <select required value={recipientId} onChange={event => setRecipientId(event.target.value)}>
            <option value="">Välj simmare…</option>
            {recipients.map(item => <option key={item.id} value={item.id}>{item.emoji} {item.displayName}</option>)}
          </select>
        </label>
        <label>Hälsning
          <select value={selectedTemplate} onChange={event => setTemplateKey(event.target.value)}>
            {KUDOS_OPTIONS.filter(([key]) => customPepEnabled || key !== 'custom').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {selectedTemplate === 'custom' && <label>Eget peppmeddelande
          <textarea required maxLength={300} placeholder="Skriv något schysst till din kompis…" value={content} onChange={event => setContent(event.target.value)} />
          <small>Texten kontrolleras innan den skickas.</small>
        </label>}
        <button type="submit" className="primary-button" disabled={busy || !recipientId}>{busy ? 'Skickar…' : 'Skicka pepp →'}</button>
        {status && <small className="kudos-status" role="status">{status}</small>}
      </form>
    </aside>
  </div>
}
