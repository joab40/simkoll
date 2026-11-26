import React, { Suspense, useEffect, useId, useRef, useState } from 'react'
import { lazyPanel } from './deferred-panel.jsx'
import { apiRequest } from './api-request.js'
import { buildTaperSummary, TAPER_PRIORITIES, TAPER_DIALOG_QUESTION } from '../shared/taper-kollen.js'
import { canUseSwimmerAssistant, SWIMMER_ASSISTANT_DEFAULTS } from '../shared/swimmer-assistant.js'
import { illnessLabel } from '../shared/illness.js'
import { heartDuration } from '../shared/training-heart-display.js'
import './taper-kollen.css'
const SwimmerAssistant = lazyPanel(() => import('./swimmer-assistant.jsx'))

const date = day => day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' }) : 'Inte angivet'
const value = number => number == null ? 'Saknas' : number.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
const empty = { competitionId: '', priority: 'A', targetDate: '', taperStart: '', events: '', note: '' }

export function TaperKollenView({ data, onSave, onRefresh, onDiscuss, busy = false }) {
  const [selected, setSelected] = useState(''), [draft, setDraft] = useState(empty), [editing, setEditing] = useState(false), [message, setMessage] = useState('')
  const editor = useRef(null), id = useId(), summary = buildTaperSummary(data, selected), form = data.form
  const competition = data.competitions.find(item => item.id === draft.competitionId)
  const edit = goal => { setDraft(goal ? { ...goal } : empty); setEditing(true); setMessage(''); requestAnimationFrame(() => editor.current?.scrollIntoView({ block: 'nearest' })) }
  const submit = async event => {
    event.preventDefault(); setMessage('')
    try { await onSave({ ...draft, enabled: true }); setEditing(false); setMessage('Målet är sparat som en ny version. Inga träningspass har ändrats.') }
    catch (error) { setMessage(error.message || 'Målet kunde inte sparas.') }
  }
  const archive = async goal => {
    if (!window.confirm(`Avaktivera ${goal.title} som måltävling? Tidigare målversioner behålls.`)) return
    setMessage('')
    try { await onSave({ ...goal, enabled: false }); setMessage('Målet är avaktiverat. Historiken behålls.') } catch (error) { setMessage(error.message) }
  }
  const goals = data.goals.filter(goal => goal.enabled)
  return <div className="taper-kollen-content">
    <p className="taper-intro">Individuell tävlingsplan och rapporterade signaler · till och med {date(data.asOf)}. Beslutsstöd, inte en validerad formprognos.</p>
    {data.formError && <p role="status" className="taper-warning">{data.formError}</p>}
    {summary.goal ? <>
      <div className="taper-target"><label htmlFor={`${id}-target`}>Tävling att resonera om</label><select id={`${id}-target`} value={summary.goal.competitionId} onChange={event => setSelected(event.target.value)}>{summary.upcoming.map(goal => <option key={goal.competitionId} value={goal.competitionId}>{goal.priority} · {goal.title} · {date(goal.targetDate)}</option>)}</select><div className="taper-target-meta"><span className="taper-priority">{summary.goal.priority} · {TAPER_PRIORITIES.find(([key]) => key === summary.goal.priority)[1].split(' · ')[1]}</span><strong>{summary.days === 0 ? 'Måldagen idag' : `${summary.days} dagar kvar`}</strong></div>{summary.goal.events && <p>Målgrenar: {summary.goal.events}</p>}</div>
      <div className="taper-stage"><small>Tränarens plan · inte uppmätt fas</small><strong>{summary.stage}</strong><p>Lättning från {date(summary.goal.taperStart)} · viktigaste tävlingsdag {date(summary.goal.targetDate)}</p></div>
      <div className={`taper-observed tone-${summary.tone}`}><small>Observerade signaler · underlag {summary.coverage}</small><h4>{summary.label}</h4><p>{summary.reason}</p></div>
      {summary.conflicts.length > 0 && <aside className="taper-warning"><strong>Flera tävlingsmål att balansera</strong>{summary.conflicts.map(text => <p key={text}>{text}</p>)}<small>21 dagar är en uppmärksamhetsregel i produkten, inte en fysiologisk gräns.</small></aside>}
      {form && <><div className="taper-metrics">{[['body', 'Kropp'], ['feeling', 'Dagskänsla'], ['speed', 'Fartkänsla']].map(([key, title]) => <div key={key}><small>{title} · senaste 3 dagar</small><strong>{value(form.current[key].value)}{form.current[key].value != null ? '/5' : ''}</strong><span>{form.current[key].days} svarsdagar · senaste {date(form.current[key].lastDay)}</span></div>)}</div><p className="taper-load"><strong>Känd belastning · senaste 7 dagar: </strong>{form.load.known ? `${form.load.estimated ? '≈ ' : ''}${value(form.load.value)} RPE × min` : 'Saknas'} · {form.load.known}/{form.load.total} rapportgrupper kompletta. Planerad tid är uppskattad; färre rapporter är inte bevis på lättning.</p>{form.flags.length > 0 && <aside className="taper-warning"><strong>Följ upp först</strong><ul>{form.flags.map(flag => <li key={flag}>{flag}</li>)}</ul></aside>}</>}
      {form && <p className="taper-health"><strong>Sömn · 3 dagar: </strong>{form.sleep?.nights ? `${heartDuration(form.sleep.minutes)} i snitt · ${form.sleep.nights} nätter` : 'Sömnsvar saknas'}. <strong>Senaste sjukdomskoll: </strong>{form.illnessAvailable === false ? 'Källan kunde inte hämtas' : form.illness ? `${illnessLabel(form.illness.status)} · ${date(form.illness.activity_date)}` : 'Svar saknas – betyder inte frisk'}. Äldre svar är inte dagens status.</p>}
      <section className="taper-next"><h4>Inför nästa tränarbeslut</h4><ul>{summary.prompts.map(text => <li key={text}>{text}</li>)}</ul><small>Samtalsfrågor, inte individuellt ordinerade pass. Kortet beräknar inte en optimal belastningsprocent.</small></section>
    </> : <div className="taper-empty"><h4>{summary.stage}</h4><p>{summary.reason}</p></div>}
    <div className="taper-actions"><button type="button" className="secondary-button" onClick={() => edit(null)} disabled={busy}>+ Lägg till måltävling</button>{onDiscuss && <button type="button" className="primary-button" onClick={() => onDiscuss(summary.goal)} disabled={busy || !summary.goal}>Diskutera toppningen →</button>}{onRefresh && <button type="button" className="text-button" onClick={onRefresh} disabled={busy}>Uppdatera underlag</button>}</div>
    {onDiscuss ? <small>Dialogen använder simmarassistentens dataval och bekräftelse före sändning till OpenAI. Sömn, sjukdom och privata anteckningar väljs separat.</small> : <small>AI-dialog kräver huvudtränare eller superadmin och aktiverat AI-stöd. Målen och den lokala överblicken fungerar utan AI.</small>}
    {goals.length > 0 && <details className="taper-goal-list"><summary>Hantera sparade mål ({goals.length})</summary>{goals.sort((a, b) => a.targetDate.localeCompare(b.targetDate)).map(goal => {
      const current = data.competitions.find(item => item.id === goal.competitionId)
      const changed = !current || current.startDate !== goal.competitionStart || current.endDate !== goal.competitionEnd || current.title !== goal.title
      return <article key={goal.competitionId}><div><strong>{goal.priority} · {goal.title}</strong><small>{date(goal.targetDate)}{goal.targetDate < data.asOf ? ' · passerat mål' : ''}</small>{goal.note && <p>{goal.note}</p>}{changed && <p className="taper-calendar-changed">Kalendern har ändrats eller tävlingen ligger utanför kalenderurvalet. Målet visar sparade uppgifter – kontrollera datumen.</p>}</div><div><button type="button" className="text-button" onClick={() => edit(goal)} disabled={busy || !current}>Ändra</button><button type="button" className="text-button" onClick={() => archive(goal)} disabled={busy}>Avaktivera</button></div></article>
    })}</details>}
    {editing && <form className="taper-editor" ref={editor} onSubmit={submit}><h4>Individuellt tävlingsmål</h4><fieldset disabled={busy}><label>Tävling<select required value={draft.competitionId} onChange={event => {
      const found = data.competitions.find(item => item.id === event.target.value), saved = data.goals.find(item => item.competitionId === event.target.value)
      setDraft(saved ? { ...saved } : { ...empty, competitionId: found?.id || '', targetDate: found?.startDate || '' })
    }}><option value="">Välj från tävlingskalendern…</option>{data.competitions.map(item => <option key={item.id} value={item.id}>{item.title} · {date(item.startDate)}</option>)}</select></label><label>Prioritet för denna simmare<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value }))}>{TAPER_PRIORITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Viktigaste tävlingsdag<input type="date" required min={competition?.startDate} max={competition?.endDate} value={draft.targetDate} onChange={event => setDraft(current => ({ ...current, targetDate: event.target.value }))} /></label><label>Planerad start för lättning (valfritt)<input type="date" max={draft.targetDate || undefined} value={draft.taperStart || ''} onChange={event => setDraft(current => ({ ...current, taperStart: event.target.value }))} /></label><label className="taper-wide">Målgrenar (valfritt)<input maxLength={200} placeholder="Exempel: 100 och 200 frisim, 25 m bassäng" value={draft.events || ''} onChange={event => setDraft(current => ({ ...current, events: event.target.value }))} /></label><label className="taper-wide">Tränarens notering (valfritt)<textarea rows={2} maxLength={600} value={draft.note || ''} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} /></label><div className="taper-actions taper-wide"><button className="primary-button" type="submit">{busy ? 'Sparar…' : 'Spara mål'}</button><button className="text-button" type="button" onClick={() => setEditing(false)}>Avbryt</button></div></fieldset><small>Flera A-mål tillåts. Sparande skapar en ny målversion, utan att ändra tävlingsanmälan eller träningsplanen.</small></form>}
    {message && <p role="status" className="taper-message">{message}</p>}
    <details className="taper-method"><summary>Så fungerar Toppningskollen</summary><p>Nuläget använder Formkollens aktuella tre kalenderdagar, inte en gissad formkurva. Saknade uppgifter är inte noll eller vila. Lättningens datum är tränarens plan; kortet intygar inte att den genomförts. A/B/C är individuella prioriteringar.</p><p>Forskningsstöd gäller principer för toppning, inte dessa produktregler eller en validerad prognos för denna simmare. Generella procentsatser kopieras inte till ungdomars träningsplaner.</p><a href="https://pubmed.ncbi.nlm.nih.gov/17762369/" target="_blank" rel="noreferrer">Metaanalys om toppning</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10915210/" target="_blank" rel="noreferrer">Studie om trötthet inför toppning</a></details>
  </div>
}

export default function TaperKollenCard({ profile, code, accountRole, aiEnabled, excluded = false, request = apiRequest }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dialogGoal, setDialogGoal] = useState(null)
  const alive = useRef(true), pending = useRef(false), controller = useRef(null), id = useId()
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  const load = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); controller.current = new AbortController()
    try { const result = await request(`/api/training?taperKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { signal: controller.current.signal }); if (result.profileId !== profile.id) throw new Error('Fel simmarunderlag returnerades.'); if (alive.current) setData(result) }
    catch (failure) { if (alive.current) setError(failure.message || 'Toppningskollen kunde inte hämtas.') }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  const save = async goal => {
    if (pending.current) throw new Error('Vänta tills underlaget har hämtats.')
    pending.current = true; setBusy(true); controller.current = new AbortController()
    try {
      const result = await request(`/api/training?taperKollen=true&profileId=${encodeURIComponent(profile.id)}`, code, { method: 'POST', signal: controller.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-taper-goal', goal }) })
      if (alive.current) setData(current => ({ ...current, goals: [...current.goals.filter(item => item.competitionId !== result.goal.competitionId), result.goal] }))
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  if (excluded) return null
  return <section className="taper-kollen">
    <button type="button" className="taper-toggle" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(value => !value); if (!open && !data && !busy) load() }}><span className="taper-mark" aria-hidden="true">⚑</span><span><strong>Toppningskollen <small>Testversion</small></strong><small>Måltävlingar, nuläge och tränardialog</small></span><span aria-hidden="true">{open ? '⌃' : '⌄'}</span></button>
    {open && <div id={id}>
      {busy && <p role="status" className="taper-loading">{data ? 'Uppdaterar eller sparar…' : 'Hämtar tävlingsmål och rapporterade signaler…'}</p>}
      {error && <p role="alert" className="taper-warning">{error} {data && 'Senast hämtade uppgifter visas.'} <button type="button" onClick={load} disabled={busy}>Försök igen</button></p>}
      {data && <TaperKollenView data={data} onSave={save} onRefresh={load} busy={busy} onDiscuss={aiEnabled && canUseSwimmerAssistant(accountRole) ? setDialogGoal : undefined} />}
    </div>}
    {dialogGoal && aiEnabled && canUseSwimmerAssistant(accountRole) && <Suspense fallback={<p role="status">Öppnar tränardialogen…</p>}><SwimmerAssistant profile={profile} code={code} request={request} onClose={() => setDialogGoal(null)} initialCategories={[...SWIMMER_ASSISTANT_DEFAULTS, 'times', 'taper']} initialQuestion={`${TAPER_DIALOG_QUESTION}\nValt mål: ${dialogGoal.title}, prioritet ${dialogGoal.priority}, ${dialogGoal.targetDate}.`} taperDialogue /></Suspense>}
  </section>
}
