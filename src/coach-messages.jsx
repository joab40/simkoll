import React, { useEffect, useRef, useState } from 'react'
import { apiRequest } from './api-request.js'
import OpenChatPanel from './open-chat-panel.jsx'
import PeppChannelPanel from './pepp-channel.jsx'
import ChatEmojiPicker from './chat-emoji-picker.jsx'
import { useCommunityChannel } from './use-community-channel.js'
import { formatFeedDate } from './community-date.js'
import { applyPepReaction } from './pep-chat.js'
import './coach-messages.css'

const TABS = [['info', 'Tränarinfo', 'Information & frågor'], ['club', 'Klubbflödet', 'Alla i klubben'], ['private', 'Privat', 'Tränare & simmare']]
const TEMPLATES = [['group_start', 'Nu kör vi! 🔥'], ['group_energy', 'Bra energi i gruppen idag ⚡'], ['group_fun', 'Kul att simma med er! 😊']]
const post = (request, code, body) => request('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function ChannelLoading({ title, channel }) {
  return <section className="message-channel-loading" aria-busy={channel.loading}><span aria-hidden="true">💬</span><h2>{title}</h2><p role="status">{channel.error || 'Hämtar meddelanden…'}</p>{channel.error && <button type="button" onClick={() => channel.refresh().catch(() => {})}>Försök igen</button>}<div className="message-loading-lines" aria-hidden="true"><i /><i /><i /></div></section>
}
function ClubChannel({ code, active, request }) {
  const channel = useCommunityChannel({ code, channel: 'channel=club', active, request })
  const [reactionBusy, setReactionBusy] = useState(false), [status, setStatus] = useState('')
  const removing = useRef(false), reacting = useRef(false)
  const send = async body => {
    const content = body.content || TEMPLATES.find(([key]) => key === body.templateKey)?.[1]
    const result = await post(request, code, { content })
    if (result.message) channel.setData(current => ({ ...current, items: [...(current?.items || []).filter(item => item.id !== result.message.id || item.type !== 'coach'), result.message] }))
    return result
  }
  const react = async body => {
    if (reacting.current) return
    reacting.current = true
    setReactionBusy(true)
    setStatus('')
    try {
      const result = await post(request, code, { action: 'toggle-reaction', ...body })
      channel.setData(current => ({ ...current, items: applyPepReaction(current.items, body, result.reacted) }))
    } catch (error) { setStatus(error.message) }
    finally { reacting.current = false; setReactionBusy(false) }
  }
  const remove = async item => {
    if (removing.current || window.prompt('Meddelandet tas bort från alla simmares flöde.\n\nSkriv RADERA för att bekräfta.') !== 'RADERA') return
    removing.current = true
    try {
      await request(`/api/community?id=${encodeURIComponent(item.id)}`, code, { method: 'DELETE' })
      channel.setData(current => ({ ...current, items: current.items.filter(row => row.type !== 'coach' || row.id !== item.id) }))
    } catch (error) { setStatus(error.message) } finally { removing.current = false }
  }
  if (!channel.data) return <ChannelLoading title="Klubbflödet" channel={channel} />
  return <>{(status || channel.error) && <p className="message-channel-error" role="status">{status || 'Kunde inte uppdatera flödet. Senast hämtade inlägg visas.'}</p>}<PeppChannelPanel coach items={channel.data.items || []} active={active} backgroundImage={channel.data.openChat?.backgroundImage} customPepEnabled templates={TEMPLATES} EmojiPicker={ChatEmojiPicker} onSend={send} onReact={react} reactionBusy={reactionBusy} onRemove={remove} /></>
}

function PrivateInbox({ code, profiles, initialRecipientId, active, request }) {
  const channel = useCommunityChannel({ code, channel: 'channel=private', active, request })
  const [recipientId, setRecipientId] = useState(initialRecipientId || ''), [content, setContent] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const sending = useRef(false)
  useEffect(() => { if (initialRecipientId) setRecipientId(initialRecipientId) }, [initialRecipientId])
  const send = async event => {
    event.preventDefault()
    if (sending.current || !content.trim() || !recipientId) return
    sending.current = true; setBusy(true); setStatus('')
    try {
      await post(request, code, { action: 'message', recipientId, content: content.trim() })
      setContent(''); setStatus('Det privata meddelandet är skickat.')
      void channel.refresh({ force: true }).catch(() => {})
    } catch (error) { setStatus(error.message) } finally { sending.current = false; setBusy(false) }
  }
  const remove = async id => {
    if (!window.confirm('Ta bort det privata meddelandet?')) return
    try { await post(request, code, { action: 'delete-private-message', id }); channel.setData(current => ({ ...current, messages: current.messages.filter(item => item.id !== id) })); void channel.refresh({ force: true }).catch(() => {}) }
    catch (error) { setStatus(error.message) }
  }
  const messages = (channel.data?.messages || []).filter(item => !recipientId || item.sender?.id === recipientId || item.recipient?.id === recipientId)
  return <section className="coach-private-inbox"><header><h2>Privata meddelanden</h2><p>Bara mottagaren och tränarna kan läsa meddelandet.</p></header><form onSubmit={send}><label>Simmare<select required value={recipientId} disabled={busy} onChange={event => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.filter(profile => !profile.isTestProfile).map(profile => <option key={profile.id} value={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select></label><label>Meddelande<textarea required maxLength={1000} rows={3} disabled={busy} value={content} onChange={event => setContent(event.target.value)} placeholder="Skriv ett privat meddelande…" /></label><div><small>🔒 Privat · {content.length}/1000</small><button type="submit" className="primary-button" disabled={busy || !content.trim() || !recipientId}>{busy ? 'Skickar…' : 'Skicka privat ↑'}</button></div></form>{status && <p role="status" className="message-channel-error">{status}</p>}{!channel.data ? <ChannelLoading title="Inkorg" channel={channel} /> : <div className="coach-private-history"><div className="private-history-heading"><h3>{recipientId ? 'Tidigare meddelanden med simmaren' : 'Senaste privata meddelanden'}</h3>{recipientId && <button type="button" className="text-button" onClick={() => setRecipientId('')}>Visa alla</button>}</div>{channel.error && <p role="status">Uppdateringen misslyckades. Senast hämtade meddelanden visas.</p>}{messages.length ? messages.map(item => <article key={item.id}><span aria-hidden="true">{item.fromCoach ? '📣' : item.sender?.emoji || '🏊'}</span><div><strong>{item.fromCoach ? `Tränarna → ${item.recipient?.displayName || 'simmare'}` : `${item.sender?.displayName || 'Simmare'} → tränarna`}</strong><p>{item.content}</p><time dateTime={item.createdAt}>{formatFeedDate(item.createdAt)}</time></div><button type="button" className="text-button" onClick={() => remove(item.id)}>Ta bort</button></article>) : <p className="empty">Inga privata meddelanden i det här urvalet.</p>}</div>}</section>
}

export default function CoachMessages({ code, profiles = [], initialRecipientId = '', request = apiRequest }) {
  const first = initialRecipientId ? 'private' : 'info'
  const [tab, setTab] = useState(first), [visited, setVisited] = useState([first])
  const open = key => { setTab(key); setVisited(current => current.includes(key) ? current : [...current, key]) }
  useEffect(() => { if (initialRecipientId) open('private') }, [initialRecipientId])
  return <section className="coach-messages-workspace"><header className="coach-messages-title"><div><p className="eyebrow">Samtal & gemenskap</p><h1>Meddelanden</h1><p>Tränarinfo, klubbens samtal och privata meddelanden – var för sig.</p></div></header><nav className="coach-channel-tabs" aria-label="Meddelandekanaler">{TABS.map(([key, title, description]) => <button type="button" key={key} aria-pressed={tab === key} aria-controls={`coach-channel-${key}`} className={tab === key ? 'active' : ''} onClick={() => open(key)}><strong>{title}</strong><small>{description}</small></button>)}</nav>{visited.includes('info') && <section id="coach-channel-info" className="coach-channel-pane" hidden={tab !== 'info'} aria-label="Tränarinfo"><OpenChatPanel code={code} coach fitViewport active={tab === 'info'} request={request} /></section>}{visited.includes('club') && <section id="coach-channel-club" className="coach-channel-pane" hidden={tab !== 'club'} aria-label="Klubbflödet"><ClubChannel code={code} active={tab === 'club'} request={request} /></section>}{visited.includes('private') && <section id="coach-channel-private" className="coach-channel-pane" hidden={tab !== 'private'} aria-label="Privata meddelanden"><PrivateInbox code={code} profiles={profiles} initialRecipientId={initialRecipientId} active={tab === 'private'} request={request} /></section>}</section>
}
