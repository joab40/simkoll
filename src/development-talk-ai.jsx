import React, { useEffect, useRef, useState } from 'react'
import { detectGoalPersonalData } from '../shared/goal-privacy.js'

export default function DevelopmentTalkAi({ notes, agreement, swimmerName, code, request, disabled, onBusyChange, onPendingChange, onUse }) {
  const [working, setWorking] = useState(false), [proposal, setProposal] = useState(null), [message, setMessage] = useState('')
  const active = useRef(true), busy = useRef(false), controller = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  const generate = async () => {
    if (disabled || busy.current || proposal || !notes.trim()) return
    const personalData = detectGoalPersonalData(notes, swimmerName)
    if (personalData) return setMessage(personalData.message)
    busy.current = true; setWorking(true); onBusyChange(true); setMessage('Analyserar anteckningarna och formulerar ett förslag…')
    controller.current = new AbortController()
    try {
      const result = await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'propose-talk-agreement', notes }) })
      if (!active.current) return
      if (!result.draft || typeof result.draft.agreement !== 'string' || !Array.isArray(result.draft.questions)) throw new Error('Förslaget kunde inte läsas. Dina texter är oförändrade.')
      setProposal({ ...result.draft, sourceNotes: notes }); onPendingChange(true)
      setMessage('Granska tillsammans med simmaren. Inget har ändrats eller sparats.')
    } catch (error) { if (active.current && error.name !== 'AbortError') setMessage(error.message) }
    finally { busy.current = false; if (active.current) { setWorking(false); onBusyChange(false) } }
  }
  const discard = () => { setProposal(null); onPendingChange(false); setMessage('Förslaget har kastats. Dina texter är oförändrade.') }
  const stale = proposal && proposal.sourceNotes !== notes
  const useProposal = () => {
    if (disabled || working || stale || !proposal?.agreement.trim()) return
    if (agreement.trim() && !window.confirm('Ersätta texten i Gemensam överenskommelse med det granskade förslaget? Den befintliga texten ersätts först i formuläret.')) return
    onUse(proposal.agreement); setProposal(null); onPendingChange(false)
    setMessage('Förslaget har lagts i Gemensam överenskommelse. Du kan redigera texten; klicka sedan Spara ändringar.')
  }
  return <section className="talk-ai-tools" aria-label="AI-stöd för gemensam överenskommelse" aria-busy={working}>
    <button type="button" className="secondary-button talk-ai-button" disabled={disabled || working || Boolean(proposal) || !notes.trim()} onClick={generate}>{working ? <><span className="talk-ai-spinner" aria-hidden="true" /> Skapar förslag…</> : '✨ Föreslå gemensam överenskommelse'}</button>
    <p className="talk-ai-privacy">Vid klick skickas bara anteckningstexten till OpenAI. Ta bort namn, kontaktuppgifter och känsliga personuppgifter först. Kontrollen kan inte upptäcka allt. Inga profilsvar eller profiluppgifter bifogas automatiskt.</p>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {proposal && <div className="talk-ai-review"><strong>AI-förslag · inte sparat</strong><label>Granska och redigera förslaget<textarea value={proposal.agreement} maxLength={5000} rows={5} disabled={disabled} onChange={(event) => setProposal((current) => ({ ...current, agreement: event.target.value }))} /></label>
      {proposal.questions.length > 0 && <div><strong>Att klargöra tillsammans</strong><ul>{proposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
      {stale && <p role="alert">Anteckningarna har ändrats. Kasta förslaget och skapa ett nytt utifrån den aktuella texten.</p>}
      <div className="talk-editor-actions"><button type="button" className="primary-button" disabled={disabled || stale || !proposal.agreement.trim()} onClick={useProposal}>Använd förslaget</button><button type="button" className="secondary-button" disabled={disabled} onClick={discard}>Kasta förslaget</button></div>
    </div>}
  </section>
}
