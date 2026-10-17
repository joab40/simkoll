import React, { useMemo, useRef, useState } from 'react'
import { strengthExercises, strengthPasses } from '../shared/strength-program.js'
import { ExerciseImageControl } from './strength-exercise-images.jsx'

const emptyPass = (number) => ({ title: number === 1 ? 'Styrkepass' : `Styrkepass ${number}`, exercises: [] })
const emptyCustom = () => ({ name: '', prescription: '', instructions: '', imageId: '', imageUrl: '', imageSource: '', imageInstructions: '' })

function exerciseLibrary(programs) {
  const choices = new Map()
  for (const program of programs) {
    for (const pass of strengthPasses(program)) {
      strengthExercises(pass.content).forEach((exercise, exerciseIndex) => {
        if (!exercise.name) return
        const image = program.exerciseImages?.find((item) => item.passNumber === pass.passNumber && item.exerciseIndex === exerciseIndex && item.exerciseName === exercise.name)
        const item = { key: `${program.id}:${pass.passNumber}:${exerciseIndex}`, sourceProgramId: program.id, passNumber: pass.passNumber, exerciseIndex, name: exercise.name, prescription: exercise.dosage, instructions: exercise.instructions, imageUrl: image?.imageUrl || '', sourceTitle: program.title }
        const nameKey = exercise.name.toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ').trim()
        const score = Number(Boolean(item.imageUrl)) * 2 + Number(Boolean(item.instructions))
        const previous = choices.get(nameKey)
        if (!previous || score > previous.score) choices.set(nameKey, { ...item, score })
      })
    }
  }
  return [...choices.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'))
}

export default function StrengthProgramBuilder({ programs, profiles, code, request, onSaved, aiEnabled = true }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [profileId, setProfileId] = useState('')
  const [passes, setPasses] = useState([emptyPass(1)])
  const [selectedPass, setSelectedPass] = useState(0)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [custom, setCustom] = useState(emptyCustom)
  const [customError, setCustomError] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const nextKey = useRef(0)
  const library = useMemo(() => exerciseLibrary(programs), [programs])
  const query = search.trim().toLocaleLowerCase('sv-SE')
  const visible = library.filter((item) => !query || `${item.name} ${item.sourceTitle}`.toLocaleLowerCase('sv-SE').includes(query)).slice(0, 40)
  const exerciseCount = passes.reduce((sum, pass) => sum + pass.exercises.length, 0)
  const editPass = (index, update) => setPasses((current) => current.map((pass, at) => at === index ? update(pass) : pass))
  const addExercise = (exercise) => {
    if (passes[selectedPass].exercises.length >= 30 || passes[selectedPass].exercises.some((item) => item.key === exercise.key)) return
    nextKey.current += 1
    editPass(selectedPass, (pass) => ({ ...pass, exercises: [...pass.exercises, { ...exercise, instanceKey: nextKey.current }] }))
    setStatus('')
  }
  const addCustom = () => {
    if (!custom.name.trim() || /[\r\n]/.test(custom.name)) return setCustomError('Ange ett övningsnamn på en rad.')
    if (/[\r\n]/.test(custom.prescription)) return setCustomError('Doseringen ska stå på en rad.')
    if (passes[selectedPass].exercises.length >= 30) return setCustomError('Ett pass kan ha högst 30 övningar.')
    nextKey.current += 1
    editPass(selectedPass, (pass) => ({ ...pass, exercises: [...pass.exercises, { ...custom, kind: 'custom', name: custom.name.trim(), prescription: custom.prescription.trim(), instructions: custom.instructions.trim(), key: `custom:${nextKey.current}`, instanceKey: nextKey.current }] }))
    setCustom(emptyCustom()); setCustomError(''); setShowCustom(false); setStatus('Ny övning tillagd i passet. Spara programmet för att få med den i biblioteket.')
  }
  const moveExercise = (passIndex, exerciseIndex, direction) => editPass(passIndex, (pass) => {
    const next = [...pass.exercises]
    const destination = exerciseIndex + direction
    if (destination < 0 || destination >= next.length) return pass
    ;[next[exerciseIndex], next[destination]] = [next[destination], next[exerciseIndex]]
    return { ...pass, exercises: next }
  })
  const save = async (event) => {
    event.preventDefault()
    setSaving(true); setStatus('Sparar programmet…')
    try {
      const result = await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-strength-from-library', title, description, passes: passes.map((pass) => ({ title: pass.title, exercises: pass.exercises.map((exercise) => exercise.kind === 'custom' ? { kind: 'custom', name: exercise.name, prescription: exercise.prescription, instructions: exercise.instructions, imageId: exercise.imageId, imageInstructions: exercise.imageInstructions } : { sourceProgramId: exercise.sourceProgramId, passNumber: exercise.passNumber, exerciseIndex: exercise.exerciseIndex, exerciseName: exercise.name, prescription: exercise.prescription }) })) }) })
      let message = 'Programmet är sparat i biblioteket.'
      if (profileId) {
        try {
          await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign', profileId, programId: result.program.id }) })
          message = 'Programmet är sparat och tilldelat simmaren ✓'
        } catch (error) {
          message = `Programmet sparades, men kunde inte tilldelas: ${error.message}. Välj det i tilldelningslistan nedan.`
        }
      }
      setTitle(''); setDescription(''); setProfileId(''); setPasses([emptyPass(1)]); setSelectedPass(0); setSearch(''); setCustom(emptyCustom()); setShowCustom(false)
      setOpen(false)
      setStatus(message)
      await onSaved?.()
    } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  return <section className="coach-card strength-builder">
    <div className="period-heading"><div><p className="eyebrow">Bygg av sparade övningar</p><h3>Eget styrkeprogram</h3><small>Välj övningar från biblioteket eller lägg till en ny. Anpassa doseringen och tilldela en simmare.</small></div><button type="button" className="secondary-button" aria-expanded={open} disabled={imageBusy || saving} onClick={() => setOpen((current) => !current)}>{open ? 'Stäng' : 'Skapa program +'}</button></div>
    {open && <form onSubmit={save} className="strength-builder-form">
      <div className="strength-builder-fields"><label>Programnamn<input required maxLength={100} value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)} placeholder="t.ex. Basstyrka 2 pass" /></label><label>Beskrivning<textarea required maxLength={1000} rows={2} value={description} disabled={saving} onChange={(event) => setDescription(event.target.value)} placeholder="Kort om programmets syfte" /></label><label>Välj simmare (valfritt)<select value={profileId} disabled={saving} onChange={(event) => setProfileId(event.target.value)}><option value="">Spara bara i biblioteket</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.emoji || '🏊'} {profile.displayName}</option>)}</select></label></div>
      {profileId && <small className="strength-builder-assignment-note">Tilldelningen ersätter simmarens nuvarande styrkeprogram. Tidigare registrerade pass sparas.</small>}
      <div className="strength-builder-workspace">
        <div className="strength-builder-catalog">
          <div className="strength-builder-column-heading"><strong>Övningsbibliotek</strong><small>{library.length} sparade övningar</small></div>
          <label className="strength-builder-search">Sök övning<input type="search" value={search} disabled={saving} onChange={(event) => setSearch(event.target.value)} placeholder="Sök till exempel bänkpress" /></label>
          <small>Övningen läggs i {passes[selectedPass].title || `pass ${selectedPass + 1}`}.</small>
          <button type="button" className="secondary-button strength-builder-new-trigger" aria-expanded={showCustom} disabled={saving || imageBusy || passes[selectedPass].exercises.length >= 30} onClick={() => { setShowCustom((current) => !current); setCustomError('') }}>{showCustom ? 'Stäng ny övning' : '＋ Lägg till ny övning'}</button>
          {showCustom && <div className="strength-builder-new-exercise">
            <strong>Ny övning i {passes[selectedPass].title}</strong>
            <label>Övningsnamn<input maxLength={150} value={custom.name} disabled={saving || imageBusy} onChange={(event) => setCustom((current) => ({ ...current, name: event.target.value }))} placeholder="t.ex. Enbensknäböj" /></label>
            <label>Set, repetitioner, vikt och vila<input maxLength={160} value={custom.prescription} disabled={saving || imageBusy} onChange={(event) => setCustom((current) => ({ ...current, prescription: event.target.value }))} placeholder="t.ex. 3 × 8 per ben" /></label>
            <label>Instruktion<textarea rows={3} maxLength={1000} value={custom.instructions} disabled={saving || imageBusy} onChange={(event) => setCustom((current) => ({ ...current, instructions: event.target.value }))} placeholder="Beskriv utförande och teknik" /></label>
            <details className="strength-builder-new-image"><summary>Instruktionsbild (valfritt)</summary><ExerciseImageControl code={code} request={request} name={custom.name} instructions={custom.instructions} image={custom} onChange={(image) => setCustom((current) => ({ ...current, ...image }))} aiEnabled={aiEnabled} disabled={saving || imageBusy} onBusyChange={setImageBusy} /></details>
            {customError && <small className="strength-builder-error" role="alert">{customError}</small>}
            <button type="button" className="primary-button" disabled={saving || imageBusy || !custom.name.trim()} onClick={addCustom}>Lägg till i passet</button>
            <small>Övningen blir valbar i framtida program när du sparar programmet.</small>
          </div>}
          <div className="strength-builder-catalog-list">{visible.map((exercise) => <article key={exercise.key} className="strength-builder-catalog-item">{exercise.imageUrl ? <img src={exercise.imageUrl} alt={`Instruktionsbild för ${exercise.name}`} /> : <span className="strength-builder-no-image" aria-hidden="true">🏋️</span>}<div><strong>{exercise.name}</strong><small>{exercise.prescription || 'Dosering anges i programmet'} · {exercise.sourceTitle}</small>{exercise.instructions && <p>{exercise.instructions}</p>}</div><button type="button" className="secondary-button" disabled={saving || passes[selectedPass].exercises.length >= 30 || passes[selectedPass].exercises.some((item) => item.key === exercise.key)} onClick={() => addExercise(exercise)} aria-label={`Lägg till ${exercise.name} i ${passes[selectedPass].title}`}>＋</button></article>)}{!library.length && <p className="empty">Inga sparade övningar ännu. Lägg till en ny ovan eller importera ett styrkeprogram.</p>}{library.length > 0 && !visible.length && <p className="empty">Ingen övning matchar sökningen.</p>}</div>
        </div>
        <div className="strength-builder-selection"><div className="strength-builder-column-heading"><strong>Ditt program</strong><small>{exerciseCount} {exerciseCount === 1 ? 'övning' : 'övningar'} · {passes.length} pass</small></div><div className="strength-builder-pass-tabs" aria-label="Välj styrkepass">{passes.map((pass, index) => <button type="button" aria-pressed={selectedPass === index} key={index} className={selectedPass === index ? 'active' : ''} disabled={saving} onClick={() => setSelectedPass(index)}>Pass {index + 1}<small>{pass.exercises.length} övningar</small></button>)}{passes.length < 3 && <button type="button" className="strength-builder-add-pass" disabled={saving} onClick={() => { setPasses((current) => [...current, emptyPass(current.length + 1)]); setSelectedPass(passes.length) }}>＋ Pass</button>}</div><label>Passrubrik<input required maxLength={100} value={passes[selectedPass].title} disabled={saving} onChange={(event) => editPass(selectedPass, (pass) => ({ ...pass, title: event.target.value }))} /></label><div className="strength-builder-selected-list">{passes[selectedPass].exercises.map((exercise, index) => <article key={exercise.instanceKey}><div className="strength-builder-selected-heading"><strong>{index + 1}. {exercise.name}</strong><div><button type="button" disabled={saving || index === 0} onClick={() => moveExercise(selectedPass, index, -1)} aria-label={`Flytta ${exercise.name} upp`}>↑</button><button type="button" disabled={saving || index === passes[selectedPass].exercises.length - 1} onClick={() => moveExercise(selectedPass, index, 1)} aria-label={`Flytta ${exercise.name} ner`}>↓</button><button type="button" disabled={saving} onClick={() => editPass(selectedPass, (pass) => ({ ...pass, exercises: pass.exercises.filter((item) => item.instanceKey !== exercise.instanceKey) }))} aria-label={`Ta bort ${exercise.name}`}>×</button></div></div><label>Set, repetitioner, vikt och vila<input maxLength={160} value={exercise.prescription} disabled={saving} onChange={(event) => editPass(selectedPass, (pass) => ({ ...pass, exercises: pass.exercises.map((item) => item.instanceKey === exercise.instanceKey ? { ...item, prescription: event.target.value } : item) }))} placeholder="t.ex. 3 × 8 · 60 sek vila" /></label>{exercise.instructions && <small>Instruktion: {exercise.instructions}</small>}{exercise.imageUrl && <small>✓ Instruktionsbild följer med</small>}</article>)}{!passes[selectedPass].exercises.length && <p className="empty">Välj övningar från biblioteket till vänster.</p>}</div>{passes.length > 1 && <button type="button" className="text-button danger-text" disabled={saving} onClick={() => { setPasses((current) => current.filter((_, index) => index !== selectedPass)); setSelectedPass(0) }}>Ta bort detta pass</button>}</div>
      </div>
      <div className="strength-builder-actions"><small>Sparade övningar behåller sina instruktioner och bilder. Nya övningar blir valbara från biblioteket när programmet sparats.</small><button type="submit" className="primary-button" disabled={saving || imageBusy || showCustom || !exerciseCount || passes.some((pass) => !pass.exercises.length)}>{saving ? 'Sparar…' : profileId ? 'Spara och tilldela' : 'Spara i biblioteket'}</button></div>
    </form>}
    {status && <p className="strength-import-status" role="status">{status}</p>}
  </section>
}
