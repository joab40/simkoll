import React, { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CoachMessages from './coach-messages.jsx'
import './styles.css'

const demo = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Demo-simmare', emoji: '🐬' }
const date = '2026-11-15T13:00:00Z'
function Preview() {
  const [delay, setDelay] = useState(800), [calls, setCalls] = useState([]), [initialRecipientId, setRecipient] = useState('')
  const fail = useRef(false), store = useRef({
    info: [
      { id: 'info-1', senderRole: 'coach', sender: { displayName: 'Tränarna', emoji: '🧑‍🏫' }, content: 'Kom ihåg att välja dina grenar inför helgens tävling.\nVi går igenom önskemålen tillsammans efter träningen.', createdAt: '2026-11-14T16:00:00Z' },
      { id: '22222222-2222-4222-8222-222222222222', senderRole: 'swimmer', senderProfileId: demo.id, sender: demo, content: 'Jag har lagt in mina grenar nu. Kan vi kika på ordningen tillsammans?', createdAt: date, privateReplies: [{ id: 'reply-1', content: 'Absolut, vi tittar på det efter passet.', createdAt: date }] },
      { id: 'info-3', senderRole: 'coach', sender: { displayName: 'Tränarna', emoji: '🧑‍🏫' }, content: 'Tack för ett bra pass idag! Nästa samling är 15 minuter före träningen. 🏊', createdAt: date },
    ],
    items: [
      { id: 'club-1', type: 'coach', content: 'Fint fokus i gruppen idag. Kul att se hur ni hjälper varandra! 💪', createdAt: '2026-11-14T17:00:00Z', reactions: [{ emoji: '👍', count: 4, reacted: false }] },
      { id: 'club-2', type: 'group', sender: demo, content: 'Tack för peppen! Vändningarna kändes mycket bättre idag 🌊', createdAt: date, reactions: [{ emoji: '👍', count: 2, reacted: false }] },
      { id: 'club-3', type: 'group', sender: { id: 'other-demo', displayName: 'Simkompis (demo)', emoji: '🐢' }, content: 'Bra jobbat allihop! 🙌', createdAt: date, reactions: [] },
    ],
    messages: [{ id: 'private-1', fromCoach: true, recipient: demo, content: 'Vi tittar på ditt grenval tillsammans efter passet.', createdAt: date }],
  })
  const request = useCallback(async (url, _code, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    setCalls(current => [...current, `${options.method || 'GET'} ${body?.action || url}`])
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay)
      options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
    if (fail.current && !options.method) throw new Error('Fiktivt anslutningsfel – försök igen.')
    if (!options.method) {
      if (url.includes('openChat=')) return { openChat: { enabled: true, coachOnly: false, swimmerPrivate: true, backgroundImage: '/assets/open-chat-bg-teal.png', messages: [...store.current.info] } }
      if (url.includes('channel=club')) return { items: [...store.current.items], openChat: { backgroundImage: '/assets/open-chat-bg-teal.png' } }
      return { messages: [...store.current.messages] }
    }
    const id = `demo-${Date.now()}`, createdAt = new Date().toISOString()
    if (body?.action === 'open-chat-message') { const message = { id, createdAt, content: body.content, senderRole: 'coach', sender: { displayName: 'Tränarna', emoji: '🧑‍🏫' } }; store.current.info.push(message); return { message } }
    if (body?.action === 'message') { store.current.messages.unshift({ id, createdAt, content: body.content, fromCoach: true, recipient: demo }); return { ok: true } }
    if (body?.action === 'toggle-reaction') return { ok: true }
    if (body?.content) { const message = { id, createdAt, content: body.content, type: 'coach', reactions: [] }; store.current.items.push(message); return { message } }
    return { ok: true }
  }, [delay])
  return <main style={{ maxWidth: 1120, margin: '20px auto', padding: '0 16px' }}><details style={{ marginBottom: 24 }}><summary>Fiktiv UI-demo · inga riktiga meddelanden, API-anrop eller databasändringar</summary><label>Fördröjning <select value={delay} onChange={event => setDelay(Number(event.target.value))}><option value={0}>Ingen</option><option value={800}>800 ms</option><option value={2500}>2,5 s</option></select></label><label style={{ marginLeft: 16 }}><input type="checkbox" onChange={event => { fail.current = event.target.checked }} /> Simulera läsfel</label><button type="button" onClick={() => setRecipient(demo.id)}>Öppna privat för simmare</button><p>{calls.length} simulerade anrop</p><pre>{calls.join('\n')}</pre></details><CoachMessages code="demo-only" profiles={[demo]} initialRecipientId={initialRecipientId} request={request} /></main>
}
createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile' ? <iframe title="Tränarmeddelanden i mobilbredd, fiktivt demo" src="/coach-messages-qa.html" style={{ width: 390, maxWidth: '100%', height: 1050, border: 0 }} /> : <Preview />)
