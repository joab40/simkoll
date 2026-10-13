import React, { useState } from 'react'
import { STRENGTH_FILE_TYPES, STRENGTH_FILE_MAX_BYTES, normalizeStrengthDraft, validateStrengthDraft } from '../shared/strength-import.js'
import { ExerciseImageControl } from './strength-exercise-images.jsx'

export default function StrengthProgramImport({ code, request, onSaved, aiEnabled }) {
  const [file, setFile] = useState(null)
  const [draft, setDraft] = useState(null)
  const [generateInstructions, setGenerateInstructions] = useState(true)
  const [generatedInstructions, setGeneratedInstructions] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const update = (change) => { setDraft((current) => change(current)); setReviewed(false) }
  const editPass = (index, change) => update((current) => ({ ...current, passes: current.passes.map((pass, i) => i === index ? change(pass) : pass) }))
  const editExercise = (passIndex, index, field, value) => editPass(passIndex, (pass) => ({ ...pass, exercises: pass.exercises.map((exercise, i) => i === index ? { ...exercise, [field]: value } : exercise) }))
  const analyze = async () => {
    if (!file) return
    const mime = STRENGTH_FILE_TYPES[file.name.split('.').pop().toLowerCase()]
    if (!mime || file.size > STRENGTH_FILE_MAX_BYTES) return setStatus('Välj XLS, XLSX, PDF eller en PNG/JPG/WebP-bild under 3 MB.')
    setBusy('analyze'); setStatus('Läser alla pass och övningar…')
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`)); reader.onerror = () => reject(new Error('Filen kunde inte läsas.')); reader.readAsDataURL(file) })
      const result = await request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-strength-program', fileData: data, fileName: file.name, generateInstructions }) })
      setDraft(normalizeStrengthDraft(result.draft)); setGeneratedInstructions(result.generatedInstructions === true); setReviewed(false)
      setStatus('Utkastet är klart. Kontrollera passindelning, övningar och dosering mot filen.')
    } catch (error) { setStatus(error.message) } finally { setBusy('') }
  }
  const save = async () => {
    setBusy('save'); setStatus('Sparar programmet…')
    try {
      await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-strength-import', draft, reviewed }) })
      setDraft(null); setFile(null); setStatus('Programmet är sparat i styrkeprogrambiblioteket. Tilldela det på simmarens kort → Styrkeprogram.')
      onSaved?.()
    } catch (error) { setStatus(error.message) } finally { setBusy('') }
  }
  const issues = draft ? validateStrengthDraft(draft) : []
  return <section className="coach-card strength-import">
    <div className="period-heading"><div><p className="eyebrow">Från fil till program</p><h3>Importera styrkeprogram</h3></div><span className="strength-import-model">GPT-6.1 Sol som standard</span></div>
    <p>Ladda upp Excel, PDF eller en bild. Granska och redigera tolkningen innan den sparas. Ett program kan innehålla 1–3 separata pass.</p>
    {!draft ? <div className="strength-import-upload">
      <label>Programfil<input type="file" accept=".xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp" disabled={!!busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setStatus('') }} /></label>
      <label className="strength-import-check"><input type="checkbox" checked={generateInstructions} disabled={!!busy} onChange={(event) => setGenerateInstructions(event.target.checked)} /><span>Skapa korta teknik-instruktioner till övningarna</span></label>
      <small>Filens innehåll skickas till OpenAI när du klickar Tolka. Anropet loggas med modell, tokens och kostnad. Kalkylblad bör ha högst 1 000 rader per blad; inbäddade bilder bör skickas som bild eller PDF.</small>
      <button type="button" className="primary-button" disabled={!file || !!busy || !aiEnabled} onClick={analyze}>{busy === 'analyze' ? 'Tolkar filen…' : 'Tolka fil med AI'}</button>
      {!aiEnabled && <small>AI-stöd är avstängt i klubbens inställningar.</small>}
    </div> : <div className="strength-import-review">
      <label>Programnamn<input maxLength={100} value={draft.title} disabled={!!busy} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} /></label>
      <label>Beskrivning<textarea maxLength={1000} value={draft.description} disabled={!!busy} onChange={(event) => update((current) => ({ ...current, description: event.target.value }))} /></label>
      <label>Gemensamma instruktioner<textarea value={draft.instructions} disabled={!!busy} onChange={(event) => update((current) => ({ ...current, instructions: event.target.value }))} /></label>
      {draft.warnings.length > 0 && <div className="strength-import-warnings"><strong>Kontrollera mot originalet</strong><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      {generatedInstructions && <p className="strength-import-generated">Övningsinstruktionerna innehåller AI-genererade förslag. Kontrollera teknik och anpassning innan simmaren får programmet.</p>}
      <p className="strength-import-generated">Du kan lägga till en övningsbild i taget. AI-bilder kostar ett separat anrop. Egna bilder laddas upp till Simkoll utan AI-tolkning.</p>
      {draft.passes.map((pass, passIndex) => <fieldset key={passIndex} className="strength-import-pass" disabled={!!busy}>
        <legend>Pass {passIndex + 1} · {pass.exercises.length} övningar</legend>
        <label>Passrubrik<input value={pass.title} onChange={(event) => editPass(passIndex, (current) => ({ ...current, title: event.target.value }))} /></label>
        <label>Passinstruktioner<textarea value={pass.instructions} onChange={(event) => editPass(passIndex, (current) => ({ ...current, instructions: event.target.value }))} /></label>
        {pass.exercises.map((exercise, index) => <div key={index} className={`strength-import-exercise${exercise.uncertain ? ' uncertain' : ''}`}>
          <div className="strength-import-exercise-row"><label>Övning {index + 1}<input value={exercise.name} onChange={(event) => editExercise(passIndex, index, 'name', event.target.value)} /></label><label>Set / reps / vikt / vila<input value={exercise.prescription} onChange={(event) => editExercise(passIndex, index, 'prescription', event.target.value)} /></label></div>
          <label>Instruktion till simmaren<textarea rows={2} value={exercise.instructions} onChange={(event) => editExercise(passIndex, index, 'instructions', event.target.value)} /></label>
          <ExerciseImageControl code={code} request={request} name={exercise.name} instructions={exercise.instructions} image={exercise} aiEnabled={aiEnabled} uncertain={exercise.uncertain} disabled={!!busy} onBusyChange={(active) => setBusy(active ? 'image' : '')} onChange={(image) => editPass(passIndex, (current) => ({ ...current, exercises: current.exercises.map((item, i) => i === index ? { ...item, ...image } : item) }))} />
          {exercise.uncertain && <label className="strength-import-check"><input type="checkbox" onChange={(event) => event.target.checked && editExercise(passIndex, index, 'uncertain', false)} />Övningsnamnet är kontrollerat mot originalet.</label>}
          {exercise.source && <small>Källrad: {exercise.source}</small>}
          {exercise.uncertain && <small>Otydlig tolkning – kontrollera källraden.</small>}
          <button type="button" className="text-button danger-text" onClick={() => editPass(passIndex, (current) => ({ ...current, exercises: current.exercises.filter((_, i) => i !== index) }))}>Ta bort övning</button>
        </div>)}
        <div className="strength-import-actions"><button type="button" className="secondary-button" onClick={() => editPass(passIndex, (current) => ({ ...current, exercises: [...current.exercises, { name: '', prescription: '', instructions: '', source: '', uncertain: false }] }))}>Lägg till övning</button><button type="button" className="text-button danger-text" onClick={() => update((current) => ({ ...current, passes: current.passes.filter((_, i) => i !== passIndex) }))}>Ta bort pass</button></div>
      </fieldset>)}
      {draft.passes.length < 3 && <button type="button" className="secondary-button" disabled={!!busy} onClick={() => update((current) => ({ ...current, passes: [...current.passes, { title: '', instructions: '', exercises: [] }] }))}>Lägg till pass</button>}
      {issues.length > 0 && <ul className="strength-import-warnings">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      <label className="strength-import-check"><input type="checkbox" checked={reviewed} disabled={!!busy} onChange={(event) => setReviewed(event.target.checked)} /><span>Jag har granskat alla pass, övningar och instruktioner.</span></label>
      <div className="strength-import-actions"><button type="button" className="primary-button" disabled={!reviewed || !!issues.length || !!busy} onClick={save}>{busy === 'save' ? 'Sparar…' : 'Spara i programbiblioteket'}</button><button type="button" className="secondary-button" disabled={!!busy} onClick={() => { setDraft(null); setStatus('') }}>Välj en annan fil</button></div>
    </div>}
    {status && <p className="strength-import-status" role="status">{status}</p>}
  </section>
}
