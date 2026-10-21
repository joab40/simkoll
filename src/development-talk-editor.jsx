import React, { useEffect, useRef, useState } from 'react'
import './development-talk-editor.css'
import DevelopmentTalkDictation from './development-talk-dictation.jsx'
import DevelopmentTalkAi from './development-talk-ai.jsx'
import { appendTalkTranscript } from './talk-dictation.js'
import { developmentTalkQuestions } from '../shared/development-talk-form.js'

const summary = (value = {}) => typeof value.summary === 'string' ? value.summary : Object.values(value).filter((item) => typeof item === 'string').join('\n')
const initial = (talk) => ({ notes: summary(talk.coachNotes), agreement: summary(talk.agreement), meetingDate: talk.meetingDate, followUpDate: talk.followUpDate || '', answers: { ...(talk.swimmerAnswers || {}) } })

export default function DevelopmentTalkEditor({ talk, swimmerName, code, request, onBack, onSaved, onRemove }) {
  const [draft, setDraft] = useState(() => initial(talk)), [baseline, setBaseline] = useState(() => initial(talk)), [saving, setSaving] = useState(''), [status, setStatus] = useState('')
  const busy = useRef(false), root = useRef(null)
  const version = useRef(talk.updatedAt)
  const [editingAnswers, setEditingAnswers] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false), [audioPending, setAudioPending] = useState(false)
  const [aiBusy, setAiBusy] = useState(false), [aiPending, setAiPending] = useState(false)
  const blocked = Boolean(saving) || audioBusy || audioPending || aiBusy || aiPending
  const dirty = audioPending || audioBusy || aiBusy || aiPending || JSON.stringify(draft) !== JSON.stringify(baseline)
  useEffect(() => { root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  useEffect(() => { if (!dirty) return; const warn = (event) => { event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  const update = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); setStatus('') }
  const updateAnswer = (key, value) => { setDraft((current) => ({ ...current, answers: { ...current.answers, [key]: value } })); setStatus('') }
  const answersChanged = JSON.stringify(draft.answers) !== JSON.stringify(baseline.answers)
  const { sections, legacy } = developmentTalkQuestions(draft.answers)
  const renderAnswer = ({ key, label, value }) => <div className="talk-question" key={key}><strong>{label}</strong>{editingAnswers ? <textarea aria-label={label} value={value} placeholder="Fyll i svaret tillsammans under samtalet…" maxLength={1000} rows={3} disabled={blocked} onChange={(event) => updateAnswer(key, event.target.value)} /> : <p className={value.trim() ? '' : 'talk-answer-missing'}>{value.trim() ? value : 'Ej besvarad'}</p>}</div>
  const save = async (complete) => {
    if (busy.current || audioBusy || audioPending || aiBusy || aiPending) return
    if (!draft.meetingDate || (draft.followUpDate && draft.followUpDate < draft.meetingDate)) return setStatus('Välj ett giltigt samtalsdatum och ett uppföljningsdatum tidigast samma dag.')
    busy.current = true; setSaving(complete ? 'complete' : 'notes'); setStatus('')
    try {
      const result = await request('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-talk', id: talk.id, profileId: talk.swimmerId, expectedUpdatedAt: version.current, meetingDate: draft.meetingDate, followUpDate: draft.followUpDate || null, status: complete ? 'completed' : talk.status, coachNotes: { ...talk.coachNotes, summary: draft.notes }, agreement: { ...talk.agreement, summary: draft.agreement }, ...(answersChanged ? { swimmerAnswers: draft.answers } : {}) }) })
      const saved = initial(result.talk)
      version.current = result.talk.updatedAt
      setDraft(saved); setBaseline(saved); setEditingAnswers(false); onSaved(result.talk)
      setStatus(complete ? '✓ Samtalet är markerat som genomfört. Överenskommelsen finns i simmarens historik.' : '✓ Ändringarna är sparade. Markera som genomfört när ni har haft samtalet.')
    } catch (error) { setStatus(error.message) } finally { busy.current = false; setSaving('') }
  }
  return <div className="talk-editor" ref={root}><button type="button" className="back-button" disabled={Boolean(saving) || audioBusy || aiBusy} onClick={() => { if (!dirty || window.confirm('Du har osparade svar, anteckningar eller ett ogranskat textförslag. Lämna utan att spara?')) onBack() }}>← Alla samtal</button>
    <div className="talk-editor-heading"><div><p className="eyebrow">Utvecklingssamtal</p><h3>{swimmerName}</h3></div><span className="talk-status-pill ready">{talk.status === 'completed' ? 'Genomfört' : talk.status === 'prepared' ? 'Redo för samtal' : 'Förberedelser pågår'}</span></div>
    <div className="talk-next-step"><strong>{talk.status === 'completed' ? 'Samtalet är genomfört' : 'Nästa steg: håll samtalet tillsammans'}</strong><p>{talk.status === 'completed' ? 'Du kan fortfarande rätta anteckningar och överenskommelsen nedan.' : 'Läs simmarens svar, skriv anteckningar och kom överens om nästa steg. Spara under tiden och markera som genomfört när ni är klara.'}</p></div>
    <section className="talk-read-answers">
      <div className="talk-answers-heading"><h4>Simmarens förberedelser</h4>{talk.status !== 'completed' && <button type="button" className="secondary-button" disabled={blocked} onClick={() => setEditingAnswers((current) => !current)}>{editingAnswers ? 'Dölj redigering' : 'Redigera svar tillsammans'}</button>}</div>
      <p className="talk-answer-explanation">Alla frågor visas i samma ordning som i simmarens formulär, även de obesvarade.</p>
      {editingAnswers && <p className="talk-answer-explanation">Gå igenom och komplettera svaren tillsammans. Sparade svar visas också i simmarens samtalshistorik.</p>}
      {answersChanged && <p className="talk-answer-explanation" role="status">Ändrade svar är inte sparade ännu.</p>}
      {sections.map(({ icon, title, questions }) => <section className="talk-question-section" key={title}><h5><span aria-hidden="true">{icon}</span> {title}<small>{questions.filter((question) => question.answered).length}/{questions.length} besvarade</small></h5>{questions.map(renderAnswer)}</section>)}
      {legacy.length > 0 && <section className="talk-question-section"><h5>Tidigare frågor</h5>{legacy.map(renderAnswer)}</section>}
    </section>
    <fieldset disabled={Boolean(saving) || aiBusy}><div className="talk-editor-dates"><label>Datum för samtalet<input type="date" value={draft.meetingDate} onChange={(event) => update('meetingDate', event.target.value)} required /></label><label>Uppföljning (valfritt)<input type="date" min={draft.meetingDate} value={draft.followUpDate} onChange={(event) => update('followUpDate', event.target.value)} /></label></div>
      <label>Tränarens interna anteckningar<textarea value={draft.notes} maxLength={10000} rows={5} onChange={(event) => update('notes', event.target.value)} placeholder="Det här vill vi följa upp…" /></label><small>Anteckningarna visas bara för tränare.</small>
      <DevelopmentTalkAi notes={draft.notes} agreement={draft.agreement} swimmerName={swimmerName} code={code} request={request} disabled={Boolean(saving) || audioBusy || audioPending} onBusyChange={(value) => { setAiBusy(value); if (value) setStatus('') }} onPendingChange={setAiPending} onUse={(text) => update('agreement', text)} />
      <DevelopmentTalkDictation code={code} request={request} disabled={Boolean(saving) || aiBusy || aiPending} onBusyChange={setAudioBusy} onPendingChange={setAudioPending} onAppend={(text) => update('notes', appendTalkTranscript(draft.notes, text))} />
      <label>Gemensam överenskommelse<textarea value={draft.agreement} maxLength={5000} rows={4} onChange={(event) => update('agreement', event.target.value)} placeholder="Vad har ni kommit överens om?" /></label><small>Den gemensamma överenskommelsen kan läsas av simmaren i samtalshistoriken.</small>
      <div className="talk-editor-actions"><button type="button" className="secondary-button" disabled={blocked} onClick={() => save(false)}>{saving === 'notes' ? 'Sparar…' : 'Spara ändringar'}</button>{talk.status !== 'completed' && <button type="button" className="primary-button" disabled={blocked} onClick={() => save(true)}>{saving === 'complete' ? 'Sparar och markerar…' : '✓ Markera som genomfört'}</button>}</div>{audioPending && <small>Granska och lägg till eller kasta transkriberingen innan du sparar.</small>}
      {aiPending && <small>Välj Använd förslaget eller Kasta förslaget innan du sparar samtalet.</small>}
    </fieldset>
    {status && <p className="talk-editor-status" role="status">{status}</p>}<details className="talk-editor-delete"><summary>Fler alternativ</summary><button type="button" className="talk-delete-button" disabled={blocked} onClick={() => onRemove(talk)}>Radera samtal</button></details>
  </div>
}
