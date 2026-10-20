import React, { useEffect, useRef, useState } from 'react'
import { startTalkRecording } from './talk-dictation.js'

export default function DevelopmentTalkDictation({ code, request, disabled, onBusyChange, onPendingChange, onAppend }) {
  const [consent, setConsent] = useState(false), [phase, setPhase] = useState(''), [text, setText] = useState(null), [message, setMessage] = useState('')
  const mounted = useRef(true), session = useRef(null), controller = useRef(null), working = useRef(false), generation = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.cancel(); controller.current?.abort() } }, [])
  const finish = (run = generation.current) => { if (run !== generation.current) return; working.current = false; if (mounted.current) { setPhase(''); onBusyChange(false) } }
  const fail = (error) => { if (mounted.current) setMessage(error.name === 'NotAllowedError' ? 'Tillåt mikrofonen i webbläsaren för att spela in.' : error.message); finish() }
  const cancel = () => { generation.current++; session.current?.cancel(); controller.current?.abort(); finish(); setMessage('Avbrutet. Ingen text har lagts till. En redan skickad begäran kan inte tas tillbaka från OpenAI.') }
  const transcribe = async (blob, run) => {
    if (!mounted.current) return
    setPhase('transcribing'); setMessage('Transkriberar med OpenAI…')
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Ljudet kunde inte läsas.')); reader.readAsDataURL(blob) })
      if (!mounted.current || !working.current || run !== generation.current) return
      controller.current = new AbortController()
      const data = await request('/api/workouts', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl, mimeType: blob.type }) })
      if (!mounted.current || !working.current || run !== generation.current) return
      if (data.error) throw new Error(data.error)
      const transcript = String(data.text || '').trim()
      if (!transcript) throw new Error('Inget tal kunde urskiljas. Försök igen eller skriv texten.')
      setText(transcript); onPendingChange(true); setMessage('Granska och rätta texten innan du lägger till den. Ingenting har sparats.')
    } catch (error) { if (mounted.current && run === generation.current && error.name !== 'AbortError') setMessage(error.message) } finally { finish(run) }
  }
  const record = async () => {
    if (working.current || disabled || !consent) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setMessage('Röstinspelning stöds inte här. Skriv anteckningarna eller använd en uppdaterad webbläsare.')
    const run = ++generation.current
    working.current = true; onBusyChange(true); setPhase('permission'); setMessage('Väntar på mikrofontillstånd…')
    session.current = await startTalkRecording({ onResult: (blob) => transcribe(blob, run), onError: (error) => { if (run === generation.current) fail(error) }, onStarted: () => { if (mounted.current && run === generation.current) { setPhase('recording'); setMessage('Spelar in · högst två minuter. Stoppa när du är klar.') } } })
    if (!mounted.current || !working.current) session.current.cancel()
  }
  const discard = () => { setText(null); onPendingChange(false); setMessage('Textförslaget har kastats.') }
  return <section className="talk-dictation" aria-label="Valfria röstanteckningar"><details><summary>🎙️ Röstanteckning (valfritt){phase === 'recording' ? ' · Spelar in' : phase === 'transcribing' ? ' · Transkriberar…' : text !== null ? ' · Text att granska' : ''}</summary><p>Valfritt, högst två minuter. Ljudet skickas till OpenAI för transkribering och sparas inte i Simkoll. Använder klubbens befintliga AI-kvot.</p><p>Informera alla som hörs och be om deras godkännande. Undvik namn, kontaktuppgifter och känsliga personuppgifter. Spela inte in hela samtalet.</p>
    <label className="talk-dictation-consent"><input type="checkbox" checked={consent} disabled={Boolean(phase) || disabled} onChange={(event) => setConsent(event.target.checked)} /><span>Jag har informerat och fått godkännande från alla som hörs till att ljudet skickas till OpenAI.</span></label>
    <div className="talk-editor-actions">{!phase && <button type="button" className="secondary-button" disabled={disabled || !consent || text !== null} onClick={record}>🎙️ Spela in anteckning</button>}{phase === 'recording' && <button type="button" className="primary-button" onClick={() => { setPhase('transcribing'); session.current?.stop() }}>⏹ Stoppa och transkribera</button>}{phase && <button type="button" className="secondary-button" onClick={cancel}>Avbryt</button>}</div>
    {text !== null && <div className="talk-transcript-review"><label>Granska transkriberad text<textarea value={text} maxLength={10000} rows={5} disabled={disabled} onChange={(event) => setText(event.target.value)} /></label><div className="talk-editor-actions"><button type="button" className="secondary-button" disabled={disabled || !text.trim()} onClick={() => { try { onAppend(text); setText(null); onPendingChange(false); setMessage('Texten har lagts till i interna anteckningar. Spara när du har granskat den.') } catch (error) { setMessage(error.message) } }}>Lägg till i interna anteckningar</button><button type="button" className="secondary-button" disabled={disabled} onClick={discard}>Kasta textförslaget</button></div></div>}{message && <p role="status" aria-live="polite">{message}</p>}
  </details></section>
}
