import React, { useEffect, useRef, useState } from 'react'

export function GoalAnalysisImage({ goal }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [goal.imageUrl])
  if (!goal.hasImage) return null
  return <figure className="goal-analysis-image">{goal.imageUrl && !failed ? <a href={goal.imageUrl} target="_blank" rel="noreferrer"><img src={goal.imageUrl} alt={`Analysunderlag för ${goal.title}`} onError={() => setFailed(true)} /></a> : <p>Bilden kunde inte visas. Öppna målvyn igen för att hämta en ny bildlänk.</p>}<figcaption>Analysunderlag från tränaren · klicka för större bild</figcaption></figure>
}

export default function GoalCreationTools({ code, request, form, onChange, aiEnabled, disabled = false, onBusyChange }) {
  const [busy, setBusy] = useState('')
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState('')
  const [transcript, setTranscript] = useState(null)
  const [draft, setDraft] = useState(null)
  const [notes, setNotes] = useState('')
  const recorderRef = useRef(null)
  const mounted = useRef(true)
  const timer = useRef(null)
  const controller = useRef(null)
  const working = !!busy || recording
  const blocked = working || disabled
  useEffect(() => { onBusyChange(working) }, [working, onBusyChange])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(timer.current); controller.current?.abort(); const recorder = recorderRef.current; if (recorder) { recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); recorder.stream.getTracks().forEach((track) => track.stop()) } onBusyChange(false) }
  }, [onBusyChange])
  const stop = () => { clearTimeout(timer.current); const recorder = recorderRef.current; if (recorder?.state === 'recording') { setBusy('transcribe'); recorder.stop() } setRecording(false) }
  const record = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setMessage('Inspelning stöds inte här. Använd en uppdaterad webbläsare eller skriv texten.')
    setBusy('permission'); setMessage('Väntar på mikrofontillstånd…')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      const chunks = []
      let size = 0
      recorder.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > 4_000_000) stop() } }
      recorder.onstop = async () => {
        clearTimeout(timer.current); stream.getTracks().forEach((track) => track.stop()); recorderRef.current = null
        if (!mounted.current) return
        setRecording(false); setBusy('transcribe')
        try {
          if (size > 4_000_000) throw new Error('Inspelningen blev för stor. Spela in en kortare text.')
          const dataUrl = await readDataUrl(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
          controller.current = new AbortController()
          const data = await request('/api/workouts', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl, mimeType: recorder.mimeType || 'audio/webm' }) })
          if (data.error) throw new Error(data.error)
          if (mounted.current) { setTranscript(data.text || ''); setMessage(data.text ? 'Kontrollera transkriberingen och lägg sedan till den i anteckningarna.' : 'Inget tal kunde urskiljas.') }
        } catch (error) { if (mounted.current) setMessage(error.message) } finally { if (mounted.current) setBusy('') }
      }
      recorder.start(1000); setRecording(true); setMessage('Spelar in. Stoppa när du är klar, senast efter två minuter.')
      timer.current = setTimeout(stop, 120000)
    } catch (error) { stream?.getTracks().forEach((track) => track.stop()); if (mounted.current) setMessage(error.name === 'NotAllowedError' ? 'Tillåt mikrofonen i webbläsaren för att spela in.' : 'Inspelningen kunde inte starta.') } finally { if (mounted.current) setBusy('') }
  }
  const chooseImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 3_000_000) return setMessage('Välj JPG, PNG eller WebP under 3 MB.')
    setBusy('image')
    try {
      const mime = /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg'
      const data = (await readDataUrl(file)).replace(/^data:[^;]*;/, `data:${mime};`)
      if (mounted.current) { onChange((current) => ({ ...current, imageData: data })); setDraft(null); setMessage('Bilden är vald. Den sparas först när du skapar målet.') }
    } catch (error) { if (mounted.current) setMessage(error.message) } finally { if (mounted.current) setBusy('') }
  }
  const improve = async () => {
    setBusy('polish'); setMessage('Skriver ett målförslag utifrån anteckningarna och granskar eventuellt bildunderlag…'); setDraft(null)
    try {
      controller.current = new AbortController()
      const result = await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-goal', notes, title: form.title, description: form.description, nextStep: form.nextStep, imageData: form.imageData || null }) })
      if (mounted.current) { setDraft(result.draft); setMessage('Granska förslaget. Originaltexten är oförändrad tills du väljer att använda det.') }
    } catch (error) { if (mounted.current) setMessage(error.message) } finally { if (mounted.current) setBusy('') }
  }
  return <section className="goal-creation-tools wide" aria-label="Underlag och skrivhjälp för utvecklingsmål">
    <h3>Från anteckningar till mål</h3><p>Skriv stödord från samtalet. AI kan formulera ett målförslag som tränaren granskar tillsammans med simmaren innan det sparas.</p>
    <label className="goal-notes-label">Tränarens anteckningar<textarea value={notes} onChange={(event) => { setNotes(event.target.value); setDraft(null) }} rows={5} maxLength={5000} disabled={blocked} placeholder="Exempel: tappar farten in mot väggen, vill öva tajming i vändningen, prova på teknikpassen och följ upp om fyra veckor" /><small>Utkastet skickas till AI när du väljer Skapa målförslag. Anteckningarna sparas inte med målet.</small></label>
<div className="goal-tool-actions"><button type="button" className={recording ? 'recording-button' : 'secondary-button'} disabled={!aiEnabled || !!busy || disabled} onClick={recording ? stop : record}>{recording ? '⏹ Stoppa inspelning' : busy === 'transcribe' ? 'Transkriberar…' : '🎙️ Prata in anteckningar'}</button><label className="exercise-image-upload">📷 Bifoga analysbild<input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={blocked} onChange={chooseImage} /></label><button type="button" className="secondary-button" disabled={!aiEnabled || blocked || (!notes.trim() && !form.title.trim() && !form.description.trim() && !form.nextStep.trim() && !form.imageData)} onClick={improve}>{busy === 'polish' ? 'Skriver förslag…' : '✨ Skapa målförslag med AI'}</button></div>
    {!aiEnabled && <small>AI-stöd är avstängt. Du kan skriva målet och bifoga en bild utan AI.</small>}
    <small>Ljud skickas för transkribering men sparas inte i Simkoll. AI får anteckningar, eventuell måltext och bifogad bild och använder klubbens AI-kvot. Bifoga bara underlag som hör till denna simmare, utan andra personers uppgifter.</small>
    {form.imageData && <figure className="goal-analysis-image"><img src={form.imageData} alt="Valt analysunderlag för målet" /><figcaption>Syns för tränaren och simmaren när målet sparas.</figcaption><button type="button" className="text-button" disabled={blocked} onClick={() => { onChange((current) => ({ ...current, imageData: null })); setDraft(null) }}>Ta bort vald bild</button></figure>}
    {transcript !== null && <div className="goal-ai-proposal"><h4>Transkriberade anteckningar</h4><textarea aria-label="Transkriberade anteckningar" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={4} maxLength={5000} disabled={blocked} /><div className="goal-tool-actions"><button type="button" className="secondary-button" disabled={blocked || !transcript.trim()} onClick={() => { const text = [notes.trim(), transcript.trim()].filter(Boolean).join('\n\n'); if (text.length > 5000) return setMessage('Anteckningarna får vara högst 5 000 tecken. Korta texten innan du lägger till den.'); setNotes(text); setTranscript(null); setDraft(null) }}>Lägg till i anteckningarna</button><button type="button" className="text-button" disabled={blocked} onClick={() => setTranscript(null)}>Avvisa transkriberingen</button></div></div>}
    {draft && <div className="goal-ai-proposal"><h4>AI-förslag · inte sparat</h4><strong>{draft.title}</strong><p>{draft.description}</p>{draft.nextStep && <p><b>Nästa steg:</b> {draft.nextStep}</p>}{draft.imageObservations?.length > 0 && <div><b>Avläst i bilden</b><ul>{draft.imageObservations.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}{draft.uncertainties?.length > 0 && <div><b>Att kontrollera / förtydliga</b><ul>{draft.uncertainties.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}<div className="goal-tool-actions"><button type="button" className="secondary-button" disabled={blocked} onClick={() => { onChange((current) => ({ ...current, title: draft.title, description: draft.description, nextStep: draft.nextStep })); setDraft(null); setMessage('Förslaget ligger nu i formuläret. Redigera vid behov och skapa målet när ni är överens.') }}>Använd förslaget</button><button type="button" className="text-button" disabled={blocked} onClick={() => setDraft(null)}>Behåll originaltexten</button></div></div>}
    {message && <p role="status">{message}</p>}
  </section>
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Filen kunde inte läsas.')); reader.readAsDataURL(file) })
}
