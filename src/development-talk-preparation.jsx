import React, { useEffect, useRef, useState } from 'react'
import { TalkContextPreview, TalkHistoryPeriod } from './talk-ai-context.jsx'

const sourceLabels = { preparations: 'Simmarens förberedelser', history: 'Träning, mål, testlopp och tävlingsresultat', reflections: 'Dagboksreflektioner', sleep: 'Sömnkoll' }

export default function DevelopmentTalkPreparation({ talk, code, request, disabled, unsaved, onBusyChange, onSaved }) {
  const [period, setPeriod] = useState(talk.coachPreparation?.periodChoice || 'since-last')
  const [sources, setSources] = useState(talk.coachPreparation?.sources || { preparations: true, history: true, reflections: false, sleep: false })
  const [preview, setPreview] = useState(null), [working, setWorking] = useState(''), [message, setMessage] = useState('')
  const active = useRef(true), busy = useRef(false), controller = useRef(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  const saved = talk.coachPreparation, ready = ['prepared', 'completed'].includes(talk.status)
  const key = JSON.stringify({ talkId: talk.id, version: talk.updatedAt, period, sources })
  const stale = preview && preview.key !== key
  const run = async (generate) => {
    if (disabled || unsaved || busy.current || !ready || (generate && (!preview || stale))) return
    busy.current = true; setWorking(generate ? 'generate' : 'preview'); setMessage(''); onBusyChange(true)
    controller.current = new AbortController()
    try {
      const result = await request('/api/goals', code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: generate ? 'generate-talk-preparation' : 'talk-preparation-context', talkId: talk.id, period, sources, ...(generate ? { contextHash: preview.contextHash } : {}) }) })
      if (!active.current) return
      if (generate) { onSaved(result.talk); setPreview(null); setMessage('✓ Samtalsunderlaget är sparat och finns kvar nästa gång du öppnar samtalet.') }
      else { setPreview({ ...result, key }); setMessage('Granska källorna. Skapa och spara samtalsunderlag skickar dem till OpenAI.') }
    } catch (error) { if (active.current && error.name !== 'AbortError') setMessage(error.message) }
    finally { busy.current = false; if (active.current) { setWorking(''); onBusyChange(false) } }
  }
  return <section className="talk-preparation talk-ai-tools" aria-label="Samtalsunderlag för tränaren" aria-busy={Boolean(working)}>
    <h4>Inför samtalet</h4><p>Samla simmarens perspektiv, träningshistorik och utveckling inför mötet. Underlaget visas bara för tränare.</p>
    {saved && <div className="talk-preparation-saved"><div className="talk-preparation-meta"><strong>Sparat AI-underlag · granska inför mötet</strong><small>Skapat {new Date(saved.generatedAt).toLocaleString('sv-SE')} · {saved.period.start}–{saved.period.end}</small><small>Källor: {Object.entries(saved.sources).filter(([, selected]) => selected).map(([name]) => sourceLabels[name]).join(' · ')}. Tidigare överenskommelse om tillgänglig.</small></div>
      {Date.parse(saved.generatedAt) !== Date.parse(talk.updatedAt) && <p role="status">Samtalet har ändrats sedan underlaget skapades. Uppdatera vid behov.</p>}
      {saved.warnings?.length > 0 && <p>Begränsningar: {saved.warnings.join(' · ')}</p>}
      <p className="talk-preparation-text">{saved.summary}</p>{saved.questions.length > 0 && <div><strong>Frågor att ta med till samtalet</strong><ul>{saved.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
      <p>Detta är ett förberedande underlag. Skriv er granskade överenskommelse tillsammans längre ned.</p>
    </div>}
    {!ready ? <p>Underlaget kan skapas när simmaren har valt Redo för samtal.</p> : <details className="talk-preparation-settings" open={saved ? undefined : true}><summary>{saved ? 'Uppdatera underlaget' : 'Skapa samtalsunderlag'}</summary>
      <TalkHistoryPeriod value={period} onChange={setPeriod} disabled={disabled || Boolean(working)} />
      <p>Innehåller sparade förberedelser, träning och mål, testlopp/träningstider, registrerade tävlingsresultat och tidigare överenskommelse.</p>
      <fieldset className="talk-ai-source-choices" disabled={disabled || Boolean(working)}><legend>Frivilliga tillval</legend>{['reflections', 'sleep'].map((name) => <label key={name}><input type="checkbox" checked={sources[name]} onChange={(event) => setSources((current) => ({ ...current, [name]: event.target.checked }))} /><span><strong>{sourceLabels[name]}</strong><small>{name === 'reflections' ? 'De senaste tolv under perioden, med förkortade svar.' : 'Sammanfattning av registrerad sömn under perioden.'}</small></span></label>)}</fieldset>
      {unsaved && <p role="status">Spara ändringarna i samtalet innan du skapar eller uppdaterar underlaget.</p>}
      <button type="button" className="secondary-button talk-ai-button" disabled={disabled || unsaved || Boolean(working)} onClick={() => run(false)}>{working === 'preview' ? <><span className="talk-ai-spinner" aria-hidden="true" /> Hämtar underlag…</> : preview ? 'Uppdatera och granska källorna' : 'Hämta och granska källorna'}</button>
      {preview && <><TalkContextPreview preview={preview} stale={stale} /><p>De granskade källorna skickas till OpenAI när du skapar analysen. Analysen sparas i tränarvyn.</p><button type="button" className="primary-button talk-ai-button" disabled={disabled || unsaved || Boolean(working) || stale} onClick={() => run(true)}>{working === 'generate' ? <><span className="talk-ai-spinner" aria-hidden="true" /> Analyserar och sparar…</> : '✨ Skapa och spara samtalsunderlag'}</button></>}
    </details>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>
}
