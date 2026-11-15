import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from './api-request.js'
import { SWIMMER_ASSISTANT_CATEGORIES as CATEGORIES, SWIMMER_ASSISTANT_DEFAULTS, SWIMMER_ASSISTANT_PERIODS, SWIMMER_ASSISTANT_MODELS, swimmerAssistantRequestBytes } from '../shared/swimmer-assistant.js'
import { AssistantDataSize, AssistantUsage } from './assistant-usage.jsx'
import './swimmer-assistant.css'

const labels = { feeling: 'Dagskänsla', body: 'Kroppskänsla', energy: 'Energi', rpe: 'RPE', sRpe: 'sRPE, belastningspoäng', activity: 'Aktivitet', slot: 'Passval', submittedAt: 'Inskickat', status: 'Status', value: 'Värde', scale: 'Skala', text: 'Text', reportedMinutes: 'Rapporterade minuter', estimatedMinutes: 'Uppskattade minuter', reportedMeters: 'Rapporterade meter', estimatedMeters: 'Uppskattade meter', basis: 'Underlag och begränsning', timeSource: 'Tidskälla', event: 'Gren', pool: 'Bassäng', swim_time: 'Tid', date_precision: 'Datumnoggrannhet', result_year: 'Årtal', result_time: 'Tid i hundradelar', source: 'Källa', competition_name: 'Tävling', note: 'Anteckning', notes: 'Anteckningar' }
function Evidence({ source }) {
  return <article className="swimmer-assistant-evidence"><strong>{source.id} · {source.label}</strong><small>{source.date || 'Exakt datum saknas'}</small><dl>{Object.entries(source.data).map(([key, value]) => <div key={key}><dt>{labels[key] || key}</dt><dd>{value == null ? 'Saknas' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</dd></div>)}</dl></article>
}
function EvidenceGroup({ category, sources }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{category.label} <span>{category.records} källposter</span></summary>{open && sources.filter(source => source.category === category.key).map(source => <Evidence key={source.id} source={source} />)}</details>
}
function Finding({ finding, sources }) {
  if (!finding?.text) return null
  const refs = (finding.sourceIds || []).map(id => sources.find(source => source.id === id)).filter(Boolean)
  return <div className="swimmer-assistant-finding"><p>{finding.text}</p>{refs.length > 0 && <details><summary>Visa underlag · {refs.map(source => source.id).join(', ')}</summary>{refs.map(source => <Evidence key={source.id} source={source} />)}</details>}</div>
}

export default function SwimmerAssistant({ profile, code, onClose, request = apiRequest }) {
  const [categories, setCategories] = useState([...SWIMMER_ASSISTANT_DEFAULTS]), [period, setPeriod] = useState('90')
  const [model, setModel] = useState('default')
  const [preview, setPreview] = useState(null), [confirmed, setConfirmed] = useState(false), [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([]), [history, setHistory] = useState([]), [historySignature, setHistorySignature] = useState('')
  const [busy, setBusy] = useState(''), [error, setError] = useState('')
  const [selectionOpen, setSelectionOpen] = useState(true)
  const dialog = useRef(null), pending = useRef(false), alive = useRef(true), abort = useRef(null), lastMessage = useRef(null), previewHeading = useRef(null)
  useEffect(() => {
    alive.current = true
    const focused = document.activeElement, previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.showModal()
    return () => { alive.current = false; abort.current?.abort(); document.body.style.overflow = previousOverflow; if (focused?.isConnected) focused.focus() }
  }, [])
  useEffect(() => { if (messages.length) lastMessage.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }) }, [messages.length])
  useEffect(() => { if (preview) previewHeading.current?.focus() }, [preview])
  const reset = () => { setPreview(null); setConfirmed(false); setMessages([]); setHistory([]); setHistorySignature(''); setError('') }
  const change = (nextCategories, nextPeriod = period) => { if (pending.current) return; reset(); setSelectionOpen(true); setCategories(nextCategories); setPeriod(nextPeriod) }
  const execute = async (action, more = {}) => {
    abort.current = new AbortController()
    return request('/api/workouts', code, { method: 'POST', signal: abort.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, profileId: profile.id, categories, period, model, ...more }) })
  }
  const prepare = async () => {
    if (pending.current || !categories.length) return
    pending.current = true; setBusy('preview'); reset()
    try { const result = await execute('swimmer-assistant-preview'); if (alive.current) { setPreview(result); setSelectionOpen(false) } }
    catch (failure) { if (alive.current) setError(failure.message) }
    finally { pending.current = false; if (alive.current) setBusy('') }
  }
  const ask = async event => {
    event.preventDefault()
    if (pending.current || !confirmed || !preview || !question.trim()) return
    const text = question.trim()
    pending.current = true; setBusy('chat'); setError('')
    try {
      const result = await execute('swimmer-assistant-chat', { question: text, confirmed: true, token: preview.token, history, historySignature })
      if (!alive.current) return
      setMessages(current => [...current, { question: text, reply: result.reply, telemetry: result.telemetry, model: result.model }]); setHistory(result.history); setHistorySignature(result.historySignature); setQuestion(''); if (result.logWarning) setError(result.logWarning)
    } catch (failure) {
      if (alive.current) { setError(failure.message); setConfirmed(false); if (/på nytt|hör inte|starta en ny/i.test(failure.message)) { setPreview(null); setMessages([]); setHistory([]); setHistorySignature('') } }
    } finally { pending.current = false; if (alive.current) setBusy('') }
  }
  const requestBytes = preview && swimmerAssistantRequestBytes(preview.context, history, question, preview.requestEnvelopeBytes)
  return createPortal(<dialog className="swimmer-assistant-dialog" ref={dialog} aria-labelledby="swimmer-assistant-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div className="swimmer-assistant-identity"><span aria-hidden="true">{profile.emoji || '🏊'}</span><div><p>Huvudtränare & superadmin · skrivskyddat</p><h2 id="swimmer-assistant-title">Prata om {profile.displayName}</h2></div></div><button type="button" className="swimmer-assistant-close" onClick={onClose} aria-label="Stäng simmarassistenten">×</button></header>
    <div className="swimmer-assistant-body"><p className="swimmer-assistant-intro">Utforska träning, upplevelser och resultat tillsammans. Välj underlag och granska det först. Inget skickas till OpenAI när du bara öppnar rutan eller hämtar underlaget.</p>
      {profile.aiAnalysisStatus !== 'approved' ? <p className="swimmer-assistant-warning" role="status">Personlig AI-analys saknar registrerat godkännande. Inhämta och registrera godkännandet enligt klubbens rutin innan funktionen används.</p> : <>
      <details className="swimmer-assistant-selection-disclosure" open={selectionOpen} onToggle={event => setSelectionOpen(event.currentTarget.open)}><summary>Dataval · {categories.length} kategorier · {SWIMMER_ASSISTANT_PERIODS.find(([key]) => key === period)?.[1]}{preview ? ' · ändra / ny dialog' : ''}</summary><section className="swimmer-assistant-selection" aria-label="Välj underlag"><div className="swimmer-assistant-selection-heading"><label>Historikperiod<select value={period} disabled={!!busy} onChange={event => change(categories, event.target.value)}>{SWIMMER_ASSISTANT_PERIODS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Språkmodell<select value={model} disabled={!!busy} onChange={event => { if (!pending.current) { reset(); setModel(event.target.value) } }}><option value="default">Serverns standard{preview?.model ? ` · ${preview.model}` : ""}</option>{SWIMMER_ASSISTANT_MODELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div><button type="button" disabled={!!busy} onClick={() => change(CATEGORIES.map(item => item.key))}>Välj allt relevant</button><button type="button" disabled={!!busy} onClick={() => change([...SWIMMER_ASSISTANT_DEFAULTS])}>Grundurval</button></div></div>
        <fieldset disabled={!!busy}><legend>Vilka uppgifter vill du arbeta med?</legend><div className="swimmer-assistant-category-grid">{CATEGORIES.map(item => <label key={item.key} className={categories.includes(item.key) ? 'selected' : ''}><input type="checkbox" checked={categories.includes(item.key)} onChange={() => change(categories.includes(item.key) ? categories.filter(key => key !== item.key) : [...categories, item.key])} /><span><strong>{item.label}{item.sensitive && <small className="swimmer-assistant-sensitive">Granska extra noga</small>}</strong><small>{item.description}</small></span></label>)}</div></fieldset>
        <p className="swimmer-assistant-exclusions">”Allt relevant” gäller kategorierna ovan. Anonyma svar, privata meddelanden, bilagor, spelhistorik samt kontakt- och inloggningsfält ingår inte. Fritext kan ändå innehålla personuppgifter. Ändrade val rensar dialogen.</p>
        <button type="button" className="primary-button" disabled={!!busy || !categories.length} onClick={prepare}>{busy === 'preview' ? 'Hämtar underlag…' : preview ? 'Granska på nytt / ny dialog' : 'Hämta & granska underlag'}</button>
      </section></details>
      {preview && <section className="swimmer-assistant-preview" aria-label="Granska underlaget"><h3 ref={previewHeading} tabIndex={-1}>Det här underlaget kan skickas</h3><p>{preview.context.selection.start}–{preview.context.selection.end} · {preview.context.sources.length} källposter · giltigt i {preview.expiresInMinutes} minuter</p><div className="swimmer-assistant-preview-categories">{preview.context.categories.map(category => <span key={category.key}>{category.label} · {category.records}</span>)}</div>{preview.context.warnings.map(warning => <p className="swimmer-assistant-warning" key={warning}>{warning}</p>)}<details><summary>Granska källposter per kategori</summary><div className="swimmer-assistant-evidence-groups">{preview.context.categories.map(category => <EvidenceGroup key={`${preview.token}-${category.key}`} category={category} sources={preview.context.sources} />)}<details><summary>Beräknade dagsvärden & begränsningar</summary><ul>{preview.context.limitations.map(text => <li key={text}>{text}</li>)}</ul><pre>{JSON.stringify(preview.context.daily, null, 2)}</pre></details></div></details>
        <p>Vald modell: <strong>{preview.model}</strong>. Tillgänglighet beror på klubbens OpenAI-konto. Modellbyte kräver ny granskning.</p><AssistantDataSize sizes={preview.sizes} requestBytes={requestBytes} /><label className="swimmer-assistant-consent"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={event => setConfirmed(event.target.checked)} /><span>Jag har granskat underlaget och bekräftar att valda uppgifter, frågan och denna dialog får skickas till OpenAI:s API för analys, även känslig fritext eller hälsodata om jag valt det. Klubbens godkännanden och rutiner ska vara uppfyllda.</span></label>
        <small>Dialogen sparas inte av Simkoll och försvinner när du stänger rutan. OpenAI:s lagringsvillkor gäller fortfarande; ”spara inte modellsvar” innebär inte garanterad nollagring hos leverantören.</small>
      </section>}
      {messages.length > 0 && <section className="swimmer-assistant-conversation" aria-label="Dialog om simmaren">{messages.map((message, index) => <article key={index}><p className="swimmer-assistant-question"><strong>Din fråga</strong>{message.question}</p><div className="swimmer-assistant-answer"><span className="eyebrow">Analysstöd · kontrollera underlaget</span><Finding finding={message.reply.answer} sources={preview.context.sources} />{message.reply.observations.length > 0 && <h4>Observerat i uppgifterna</h4>}{message.reply.observations.map((finding, i) => <Finding key={i} finding={finding} sources={preview.context.sources} />)}{message.reply.interpretations.length > 0 && <h4>Möjliga tolkningar – inte säkra orsaker</h4>}{message.reply.interpretations.map((finding, i) => <Finding key={i} finding={finding} sources={preview.context.sources} />)}<ul>{message.reply.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul><AssistantUsage telemetry={message.telemetry} model={message.model} /></div></article>)}<div ref={lastMessage} /></section>}
      {error && <p className="swimmer-assistant-warning" role="alert">{error}</p>}
      {preview && <form className="swimmer-assistant-compose" onSubmit={ask}><div className="swimmer-assistant-suggestions">{['Vad har förändrats under perioden?', 'Hur såg träningen ut före senaste tävlingen?', 'Stämmer fartkänslan med resultaten?'].map(text => <button type="button" key={text} disabled={!!busy} onClick={() => setQuestion(text)}>{text}</button>)}</div><label>Fråga om {profile.displayName}<textarea maxLength={2000} rows={3} value={question} disabled={!!busy} onChange={event => setQuestion(event.target.value)} placeholder="Exempel: Vilka mönster ser du mellan träningen och resultaten?" /></label><div><small>Rådgivande underlag, inte diagnos eller säker formbedömning. Högst sex frågor per dialog.</small><button type="submit" className="primary-button" disabled={!!busy || !confirmed || !question.trim() || !preview.context.sources.length}>{busy === 'chat' ? 'Analyserar valt underlag…' : 'Skicka fråga till OpenAI'}</button></div>{busy === 'chat' && <p role="status">Assistenten arbetar med det granskade underlaget…</p>}</form>}
      </>}
    </div>
  </dialog>, document.body)
}
