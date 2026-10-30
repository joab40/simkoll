import React, { useEffect, useState } from 'react'
import { strengthPasses, strengthExercises } from '../shared/strength-program.js'

export function ExerciseImageControl({ code, request, name, instructions, image, onChange, aiEnabled, disabled, uncertain, onBusyChange }) {
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [imageInstructions, setImageInstructions] = useState(image?.imageInstructions ?? instructions ?? '')
  const [candidate, setCandidate] = useState(null)
  const run = async (action, imageData) => {
    const generationInstructions = imageInstructions.trim()
    setBusy(action); setStatus(action === 'generate-strength-image' ? 'Skapar start- och slutläge…' : 'Laddar upp bilden…'); onBusyChange?.(true)
    try {
      const result = await request('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, name, instructions, imageInstructions: generationInstructions, imageData }) })
      setCandidate({ ...result.image, imageInstructions: generationInstructions })
      setStatus('Bilden är klar för granskning. Kontrollera att den visar rätt övning och teknik.')
    } catch (error) { setStatus(error.message) } finally { setBusy(''); onBusyChange?.(false) }
  }
  const upload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[file.name.split('.').pop().toLowerCase()]
    if (!mime || file.size > 3_000_000) return setStatus('Välj JPG, PNG eller WebP under 3 MB.')
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`)); reader.onerror = () => reject(new Error('Bilden kunde inte läsas.')); reader.readAsDataURL(file) })
      await run('upload-strength-image', data)
    } catch (error) { setStatus(error.message) }
  }
  return <div className="exercise-image-control">
    <label className="exercise-image-instructions">Bildinstruktion<textarea rows={4} maxLength={2000} value={imageInstructions} disabled={disabled || !!busy} onChange={(event) => setImageInstructions(event.target.value)} placeholder="Beskriv startläge, slutläge, utrustning och kameravinkel…" /></label>
    <small>Ändrar inte simmarens övningsbeskrivning. Bildinstruktionen sparas med den bild du godkänner. Varje generering gör ett nytt AI-anrop med kostnad.</small>
    <button type="button" className="text-button" disabled={disabled || !!busy} onClick={() => setImageInstructions(instructions || '')}>Återställ från övningsbeskrivningen</button>
    {image?.imageUrl && <figure><a href={image.imageUrl} target="_blank" rel="noreferrer"><img src={image.imageUrl} alt={`Övningsbild för ${name}`} /></a><figcaption>{image.imageSource === 'ai' ? 'AI-genererat förslag · granska tekniken' : 'Egen övningsbild'} · klicka för större bild</figcaption></figure>}
    {image?.imageId && !image.imageUrl && <small>Bilden kunde inte hämtas. Öppna programmet igen för att hämta en ny bildlänk.</small>}
    {candidate && <div className="exercise-image-candidate"><strong>Nytt bildförslag · inte sparat</strong>{candidate.imageUrl ? <figure><a href={candidate.imageUrl} target="_blank" rel="noreferrer"><img src={candidate.imageUrl} alt={`Nytt bildförslag för ${name}`} /></a></figure> : <p>Förhandsvisningen kunde inte hämtas. Generera igen eller ladda upp en egen bild.</p>}<small>Nuvarande bild behålls tills du godkänner förslaget och sparar programmet.</small><div className="exercise-image-actions"><button type="button" className="primary-button" disabled={disabled || !!busy || !candidate.imageUrl} onClick={() => { onChange(candidate); setCandidate(null); setStatus('Bildförslaget är valt. Spara programmet för att använda det.') }}>Använd den här bilden</button><button type="button" className="secondary-button" disabled={disabled || !!busy} onClick={() => { setCandidate(null); setStatus('Förslaget har avvisats. Nuvarande bild behålls.') }}>Behåll tidigare bild</button></div></div>}
    <div className="exercise-image-actions">
      <button type="button" className="secondary-button" disabled={disabled || !!busy || !aiEnabled || !name?.trim() || uncertain} onClick={() => run('generate-strength-image')}>{busy === 'generate-strength-image' ? 'Genererar…' : image?.imageId ? 'Generera ny bild' : 'Generera bild'}</button>
      <label className="exercise-image-upload"><span>Ladda upp egen bild</span><input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={disabled || !!busy} onChange={upload} /></label>
      {image?.imageId && <button type="button" className="text-button danger-text" disabled={disabled || !!busy} onClick={() => { onChange({ imageId: '', imageUrl: '', imageSource: '' }); setStatus('Bilden tas bort från övningen när du sparar.') }}>Ta bort bild</button>}
    </div>
    {uncertain && <small>Kontrollera den otydliga övningen innan du genererar en bild, eller ladda upp en egen.</small>}
    {status && <small role="status">{status}</small>}
  </div>
}

export function StrengthProgramImagesEditor({ program, code, request, aiEnabled, onSaved, onClose }) {
  const passes = strengthPasses(program)
  const [images, setImages] = useState(program.exerciseImages || [])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [status, setStatus] = useState('')
  const imageFor = (passNumber, exerciseIndex, name) => images.find((image) => image.passNumber === passNumber && image.exerciseIndex === exerciseIndex && image.exerciseName === name)
  const update = (passNumber, exerciseIndex, exerciseName, image) => {
    setReviewed(false)
    setImages((current) => [...current.filter((item) => item.passNumber !== passNumber || item.exerciseIndex !== exerciseIndex), ...(image.imageId ? [{ ...image, passNumber, exerciseIndex, exerciseName }] : [])])
  }
  const save = async () => {
    setSaving(true); setStatus('Sparar övningsbilder…')
    try {
      const applicable = images.filter((image) => {
        const pass = passes.find((pass) => pass.passNumber === image.passNumber)
        return pass && strengthExercises(pass.content)[image.exerciseIndex]?.name === image.exerciseName
      })
      await request('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-strength-images', type: program.type || 'strength', programId: program.id, images: applicable, reviewed }) })
      await onSaved()
    } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  return <div className="strength-program-images-editor">
    <div className="period-heading"><div><p className="eyebrow">Övningsbilder</p><h3>{program.title}</h3></div><button type="button" className="secondary-button" disabled={busy || saving} onClick={onClose}>Stäng</button></div>
    <p>Generera en bild i taget eller välj en egen bild. AI-generering kostar ett separat anrop; egna bilder skickas bara till Simkolls bildlagring. Kontrollera övning och teknik före sparandet.</p>
    {passes.map((pass) => <section className="strength-images-pass" key={pass.passNumber}><h4>Pass {pass.passNumber} · {pass.title}</h4>{strengthExercises(pass.content).map((exercise, index) => <article className="strength-images-exercise" key={exercise.resultKey}>
      <strong>{index + 1}. {exercise.name}</strong><small>{exercise.dosage}</small>{exercise.instructions && <p>{exercise.instructions}</p>}
      <ExerciseImageControl code={code} request={request} name={exercise.name} instructions={exercise.instructions} image={imageFor(pass.passNumber, index, exercise.name)} onChange={(image) => update(pass.passNumber, index, exercise.name, image)} aiEnabled={aiEnabled} disabled={busy || saving} onBusyChange={setBusy} />
    </article>)}</section>)}
    <label className="strength-image-review"><input type="checkbox" checked={reviewed} disabled={busy || saving} onChange={(event) => setReviewed(event.target.checked)} />Jag har granskat bilderna och kontrollerat att de hör till rätt övningar.</label>
    <button type="button" className="primary-button" disabled={!reviewed || busy || saving} onClick={save}>{saving ? 'Sparar…' : 'Spara övningsbilder'}</button>
    {status && <p role="status">{status}</p>}
  </div>
}

export function SwimmerExerciseImage({ image, name }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [image?.imageUrl])
  if (!image?.imageId) return null
  if (!image.imageUrl || failed) return <small>Övningsbilden kunde inte visas. Öppna programmet igen.</small>
  return <span className="swimmer-exercise-image"><a href={image.imageUrl} target="_blank" rel="noreferrer" aria-label={`Öppna större bild för ${name}`}><img src={image.imageUrl} alt={`Instruktionsbild för ${name}`} onError={() => setFailed(true)} /></a><small>{image.imageSource === 'ai' ? 'AI-illustration · granskad av tränaren' : 'Övningsbild från tränaren'}</small></span>
}
