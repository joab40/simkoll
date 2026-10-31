import React, { useMemo, useState } from 'react'
import WorkoutOccasionChoice from './workout-occasion-choice.jsx'
import WorkoutPreview from './workout-preview.jsx'
import { workbookPreviewWorkouts } from '../shared/workout-preview.js'
import './workout-workbook-review.css'

export default function WorkoutWorkbookReview({ workbook, date: initialDate, timeOfDay: initialTime, groups: initialGroups, initialOccasion, loadChoices, availableGroups, focuses, onPublish, onClose }) {
  const [sheets, setSheets] = useState(workbook.sheets)
  const [activeKey, setActiveKey] = useState(workbook.sheets.find((sheet) => sheet.selected)?.key || workbook.sheets[0].key)
  const [date, setDate] = useState(workbook.sheets.find((sheet) => sheet.draft.date)?.draft.date || initialDate)
  const [timeOfDay, setTimeOfDay] = useState(initialTime || workbook.sheets.find((sheet) => sheet.draft.timeOfDay)?.draft.timeOfDay || '')
  const [groups, setGroups] = useState(initialGroups)
  const [occasion, setOccasion] = useState({ occasionMode: initialOccasion?.occasionMode === 'existing' ? 'existing' : 'new', alternativeToWorkoutId: date === initialDate ? initialOccasion?.alternativeToWorkoutId || '' : '' })
  const loadOccasions = useMemo(() => (signal) => loadChoices(date, '', signal), [loadChoices, date])
  const [reviewed, setReviewed] = useState(false)
  const [publicationId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState('')
  const active = sheets.find((sheet) => sheet.key === activeKey)
  const selected = sheets.filter((sheet) => sheet.selected)
  const change = (key, update) => { setSheets((current) => current.map((sheet) => sheet.key === key ? { ...sheet, ...update } : sheet)); setReviewed(false); setError('') }
  const edit = (field, value) => change(active.key, { draft: { ...active.draft, [field]: value } })
  const submit = async (event) => {
    event.preventDefault()
    if (!selected.length || !groups.length || !reviewed) { setError('Välj minst ett helt pass, berörda grupper och bekräfta granskningen.'); return }
    if (occasion.occasionMode === 'existing' && !occasion.alternativeToWorkoutId) { setError('Välj ett befintligt träningstillfälle för de nya passalternativen.'); return }
    const invalid = selected.find(({ draft }) => !draft.title.trim() || !draft.content.trim() || draft.title.length > 80 || draft.content.length > 5000 || draft.note.length > 500 || (draft.distanceMeters !== '' && (!Number.isInteger(Number(draft.distanceMeters)) || Number(draft.distanceMeters) < 1 || Number(draft.distanceMeters) > 50000)) || (draft.durationMinutes !== '' && (!Number.isInteger(Number(draft.durationMinutes)) || Number(draft.durationMinutes) < 1 || Number(draft.durationMinutes) > 600)))
    if (invalid) { setActiveKey(invalid.key); setError(`Kontrollera rubrik, text, meter och minuter på fliken ${invalid.sheetName}.`); return }
    setBusy(true); setError('')
    try { await onPublish({ publicationId, date, timeOfDay, targetGroups: groups, ...occasion, workouts: selected.map((sheet) => ({ ...sheet.draft, key: sheet.key })) }) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <section className="workbook-review" aria-label="Granska kalkylbladets pass">
    <header><div><p className="eyebrow">Granska flikarna före publicering</p><h2>{workbook.fileName}</h2><p>{selected.length} av {sheets.length} flikar valda som passalternativ. Välj vilka hela pass som hör till samma träning.</p></div><button type="button" className="text-button" disabled={busy} onClick={onClose}>Avbryt import</button></header>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="workbook-common"><legend>Gemensam träning</legend>
        <div className="workbook-common-fields"><label>Datum<input required type="date" value={date} onChange={(event) => { setDate(event.target.value); setOccasion((current) => ({ ...current, alternativeToWorkoutId: '' })); setReviewed(false) }} /></label><label>Tid på dagen<select required value={timeOfDay} onChange={(event) => { setTimeOfDay(event.target.value); setReviewed(false) }}><option value="">Välj morgon eller eftermiddag…</option><option value="morning">Förmiddag / morgon</option><option value="afternoon">Eftermiddag / kväll</option></select></label></div>
        <div className="workbook-groups" role="group" aria-label="Berörda grupper">{availableGroups.map(([value, label]) => <label key={value}><input type="checkbox" checked={groups.includes(value)} onChange={(event) => { setGroups((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value)); setReviewed(false) }} />{label}</label>)}</div>
        <p>Flikarna blir alternativ för ett träningstillfälle. Simmaren väljer vilket upplägg hen genomförde. Mängderna adderas inte.</p>
      </fieldset>
      <WorkoutOccasionChoice form={{ ...occasion, timeOfDay, targetGroups: groups }} loadChoices={loadOccasions} disabled={busy} onChange={(update) => { setOccasion((current) => ({ ...current, ...update })); if (update.timeOfDay !== undefined) setTimeOfDay(update.timeOfDay); if (update.targetGroups) setGroups(update.targetGroups); setReviewed(false); setError('') }} />
      <div className="workbook-review-layout"><div className="workbook-sheet-list" role="group" aria-label="Dokumentets flikar">{sheets.map((sheet) => <div key={sheet.key} className={`workbook-sheet${activeKey === sheet.key ? ' active' : ''}`}>
        <label className="workbook-sheet-check"><input type="checkbox" aria-label={`Publicera ${sheet.sheetName} som ett helt pass`} checked={sheet.selected} disabled={busy} onChange={(event) => change(sheet.key, { selected: event.target.checked })} /></label>
        <button type="button" disabled={busy} aria-pressed={activeKey === sheet.key} onClick={() => setActiveKey(sheet.key)}><strong>{sheet.sheetName}</strong><small>{sheet.kind === 'warmup' ? 'Insimsvarianter · inte förvalt' : sheet.kind === 'review' ? 'Behöver granskas · inte förvalt' : [sheet.draft.distanceMeters ? `${Number(sheet.draft.distanceMeters).toLocaleString('sv-SE')} m` : 'Meter saknas', sheet.draft.durationMinutes ? `${sheet.draft.durationMinutes} min` : 'Tid saknas'].join(' · ')}</small><span>{activeKey === sheet.key ? 'Visas för granskning' : 'Granska och redigera →'}</span></button>
      </div>)}{workbook.skippedSheets?.length > 0 && <p className="workbook-skipped">Tomma flikar hoppas över: {workbook.skippedSheets.map((sheet) => sheet.sheetName).join(', ')}.</p>}</div>
      <fieldset disabled={busy} className="workbook-sheet-editor"><legend>{active.sheetName}</legend>
        {!active.selected && <p className="workbook-notice">Den här fliken är inte vald för publicering.</p>}
        {active.warnings.length > 0 && <ul className="workbook-warnings">{active.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <label>Rubrik<input maxLength={80} value={active.draft.title} onChange={(event) => edit('title', event.target.value)} /></label>
        <div className="workbook-amounts"><label>Huvudinriktning<select value={active.draft.focus} onChange={(event) => edit('focus', event.target.value)}><option value="">Ingen angiven</option>{focuses.filter(([value]) => value).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Meter<input type="number" min={1} max={50000} value={active.draft.distanceMeters} onChange={(event) => edit('distanceMeters', event.target.value)} /></label><label>Minuter<input type="number" min={1} max={600} value={active.draft.durationMinutes} onChange={(event) => edit('durationMinutes', event.target.value)} /></label></div>
        <label>Passbeskrivning<textarea rows={15} value={active.draft.content} onChange={(event) => edit('content', event.target.value)} /><small>{active.draft.content.length.toLocaleString('sv-SE')} / 5 000 tecken. Kontrollera serier, blockupprepningar och starttider.</small></label>
        <label>Meddelande till simmarna<textarea rows={2} maxLength={500} value={active.draft.note} onChange={(event) => edit('note', event.target.value)} /></label>
      </fieldset></div>
      <div className="workbook-publish"><label><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />Jag har granskat de valda flikarna som hela pass och kontrollerat deras meter och minuter.</label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="workbook-publish-actions"><button type="button" className="secondary-button" disabled={busy || !selected.length} onClick={() => setPreviewOpen(true)}>Förhandsgranska som simmare</button><button className="primary-button" type="submit" disabled={busy || !selected.length || !groups.length || !reviewed}>{busy ? 'Publicerar passalternativen…' : `Publicera ${selected.length} ${selected.length === 1 ? 'pass' : 'passalternativ'} →`}</button></div><small>Berörda simmare får en gemensam pushnotis om nya simpass är aktiverat.</small>
      </div>
    </form>
    {previewOpen && <WorkoutPreview workouts={workbookPreviewWorkouts(sheets, { date, timeOfDay, targetGroups: groups })} date={date} timeOfDay={timeOfDay} onClose={() => setPreviewOpen(false)} />}
  </section>
}
