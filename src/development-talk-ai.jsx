import React, { useEffect, useRef, useState } from 'react'
import { detectGoalPersonalData } from '../shared/goal-privacy.js'
import { TalkHistoryPeriod, TalkContextPreview } from './talk-ai-context.jsx'

export default function DevelopmentTalkAi({ talkId, swimmerAnswers, notes, agreement, swimmerName, code, request, disabled, onBusyChange, onPendingChange, onUse }) {
  const [working, setWorking] = useState(''), [proposal, setProposal] = useState(null), [message, setMessage] = useState('')
  const [sources, setSources] = useState({ preparations: true, history: true, reflections: false, sleep: false })
  const [preview, setPreview] = useState(null)
  const [period, setPeriod] = useState('since-last')
  const input = { talkId, notes, swimmerAnswers, sources, period }, sourceKey = JSON.stringify(input)
  const previewStale = preview && preview.sourceKey !== sourceKey
  const active = useRef(true), busy = useRef(false), controller = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  const prepare = async () => {
    if (disabled || busy.current || proposal || !notes.trim()) return
    const personalData = detectGoalPersonalData(notes, swimmerName)
    if (personalData) return setMessage(personalData.message)
    busy.current = true; setWorking('preview'); onBusyChange(true); setPreview(null); setMessage('Hämtar underlaget för den här simmaren…')
    controller.current = new AbortController()
    try {
      const result = await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'talk-agreement-context', ...input }) })
      if (!active.current) return
      setPreview({ ...result, sourceKey }); setMessage('Granska underlaget nedan. Inget har skickats till OpenAI ännu.')
    } catch (error) { if (active.current && error.name !== 'AbortError') setMessage(error.message) }
    finally { busy.current = false; if (active.current) { setWorking(''); onBusyChange(false) } }
  }
  const generate = async () => {
    if (disabled || busy.current || proposal || !preview || previewStale) return
    busy.current = true; setWorking('generate'); onBusyChange(true); setMessage('Väger samman det granskade underlaget och formulerar ett förslag…')
    controller.current = new AbortController()
    try {
      const result = await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'propose-talk-agreement', ...input, contextHash: preview.contextHash }) })
      if (!active.current) return
      if (!result.draft || typeof result.draft.agreement !== 'string' || !Array.isArray(result.draft.questions)) throw new Error('Förslaget kunde inte läsas. Dina texter är oförändrade.')
      setProposal({ ...result.draft, sourceKey }); onPendingChange(true)
      setMessage('Granska tillsammans med simmaren. Inget har ändrats eller sparats.')
    } catch (error) { if (active.current && error.name !== 'AbortError') setMessage(error.message) }
    finally { busy.current = false; if (active.current) { setWorking(''); onBusyChange(false) } }
  }
  const discard = () => { setProposal(null); onPendingChange(false); setMessage('Förslaget har kastats. Dina texter är oförändrade.') }
  const stale = proposal && proposal.sourceKey !== sourceKey
  const useProposal = () => {
    if (disabled || working || stale || !proposal?.agreement.trim()) return
    if (agreement.trim() && !window.confirm('Ersätta texten i Gemensam överenskommelse med det granskade förslaget? Den befintliga texten ersätts först i formuläret.')) return
    onUse(proposal.agreement); setProposal(null); onPendingChange(false)
    setMessage('Förslaget har lagts i Gemensam överenskommelse. Du kan redigera texten; klicka sedan Spara ändringar.')
  }
  return <section className="talk-ai-tools" aria-label="AI-stöd för gemensam överenskommelse" aria-busy={Boolean(working)}>
    <h5>Underlag för AI-förslaget</h5><p>Tränarens aktuella anteckningar ingår alltid. Välj vad mer du vill väga in och granska underlaget innan du skapar förslaget.</p>
    <TalkHistoryPeriod value={period} onChange={setPeriod} disabled={disabled || Boolean(working) || Boolean(proposal)} />
    <fieldset className="talk-ai-source-choices" disabled={disabled || Boolean(working) || Boolean(proposal)}><legend>Välj underlag</legend>{[['preparations', 'Simmarens förberedelser', 'Svaren i formuläret, inklusive osparade ändringar från mötet.'], ['history', 'Träningshistorik och utveckling', 'Registrerade pass, simning och styrka, kontinuitet, mängd, RPE, mål, testlopp, träningstider och registrerade tävlingsresultat.'], ['reflections', 'Ta med dagboksreflektioner', 'Frivilligt: de senaste tolv reflektionerna under perioden, med förkortade svar.'], ['sleep', 'Ta med sömnkoll', 'Frivilligt: sammanfattning av registrerad sovtid och upplevd sömn under perioden.']].map(([key, title, hint]) => <label key={key}><input type="checkbox" checked={sources[key]} onChange={(event) => { setSources((current) => ({ ...current, [key]: event.target.checked })); setMessage('') }} /><span><strong>{title}</strong><small>{hint}</small></span></label>)}</fieldset>
    {!notes.trim() && <p>Skriv tränarens anteckningar innan du hämtar underlaget.</p>}
    <button type="button" className="secondary-button talk-ai-button" disabled={disabled || Boolean(working) || Boolean(proposal) || !notes.trim()} onClick={prepare}>{working === 'preview' ? <><span className="talk-ai-spinner" aria-hidden="true" /> Hämtar underlag…</> : preview ? 'Uppdatera underlag' : 'Visa underlag'}</button>
    {preview && <TalkContextPreview preview={preview} stale={previewStale} />}
    <p className="talk-ai-privacy">När du väljer Föreslå gemensam överenskommelse skickas det granskade underlaget till OpenAI. Granska och ta bort namn, kontaktuppgifter och känslig information som inte behövs. Textkontrollen kan inte upptäcka allt. Förslaget sparas först när du själv använder det och sparar samtalet.</p>
    {preview && <button type="button" className="secondary-button talk-ai-button" disabled={disabled || Boolean(working) || Boolean(proposal) || previewStale} onClick={generate}>{working === 'generate' ? <><span className="talk-ai-spinner" aria-hidden="true" /> Skapar förslag…</> : '✨ Föreslå gemensam överenskommelse'}</button>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {proposal && <div className="talk-ai-review"><strong>AI-förslag · inte sparat</strong><label>Granska och redigera förslaget<textarea value={proposal.agreement} maxLength={5000} rows={5} disabled={disabled} onChange={(event) => setProposal((current) => ({ ...current, agreement: event.target.value }))} /></label>
      {proposal.questions.length > 0 && <div><strong>Att klargöra tillsammans</strong><ul>{proposal.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
      {stale && <p role="alert">Underlaget har ändrats. Kasta förslaget och skapa ett nytt utifrån den aktuella texten.</p>}
      <div className="talk-editor-actions"><button type="button" className="primary-button" disabled={disabled || stale || !proposal.agreement.trim()} onClick={useProposal}>Använd förslaget</button><button type="button" className="secondary-button" disabled={disabled} onClick={discard}>Kasta förslaget</button></div>
    </div>}
  </section>
}
