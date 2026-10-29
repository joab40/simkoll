import React, { useEffect, useState } from 'react'
import './workout-occasion-choice.css'

export default function WorkoutOccasionChoice({ form, loadChoices, onChange, disabled = false }) {
  const mode = form.occasionMode || (form.id ? 'keep' : 'new')
  const [choices, setChoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (mode !== 'existing') return
    const controller = new AbortController()
    setLoading(true); setChoices([]); setError('')
    loadChoices(controller.signal).then((data) => { if (!controller.signal.aborted) setChoices(data.occasions || []) }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mode, loadChoices, retry])
  const changeMode = (value) => { if (value !== mode) onChange({ occasionMode: value, alternativeToWorkoutId: '' }) }
  const choose = (id) => {
    const selected = choices.find((item) => item.targetWorkoutId === id)
    onChange({ alternativeToWorkoutId: id, ...(selected ? { timeOfDay: selected.timeOfDay || form.timeOfDay || '', targetGroups: selected.targetGroups.length ? selected.targetGroups : form.targetGroups } : {}) })
  }
  const slotLabel = (item) => item.time || (item.timeOfDay === 'morning' ? 'Morgon' : item.timeOfDay === 'afternoon' ? 'Eftermiddag / kväll' : 'Tid ej angiven')
  return <fieldset className="workout-occasion-choice" disabled={disabled}><legend>Träningstillfälle</legend>
    <div className="workout-occasion-modes" role="group" aria-label="Hur hör passet till planeringen?">
      {form.id && <button type="button" aria-pressed={mode === 'keep'} onClick={() => changeMode('keep')}><strong>Behåll nuvarande tillfälle</strong><small>Spara ändringar i passet med samma koppling.</small></button>}
      <button type="button" aria-pressed={mode === 'new'} onClick={() => changeMode('new')}><strong>Nytt träningstillfälle</strong><small>Passet räknas som en egen träning.</small></button>
      <button type="button" aria-pressed={mode === 'existing'} onClick={() => changeMode('existing')}><strong>Alternativ till befintlig träning</strong><small>Annat upplägg för samma tillfälle. Mängderna räknas en gång.</small></button>
    </div>
    {mode === 'existing' && <div className="workout-occasion-target">
      {loading ? <p role="status">Hämtar dagens träningstillfällen…</p> : error ? <p role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Försök igen</button></p> : <>
        <label>Vilken träning hör upplägget till?<select required value={form.alternativeToWorkoutId || ''} onChange={(event) => choose(event.target.value)}><option value="">Välj ett befintligt träningstillfälle…</option>{choices.map((item) => <option key={item.targetWorkoutId} value={item.targetWorkoutId}>{slotLabel(item)} · {item.titles.join(' / ')}{item.location ? ` · ${item.location}` : ''}</option>)}</select></label>
        {!choices.length && <p>Inga andra publicerade pass finns på det valda datumet. Publicera först ett pass som nytt träningstillfälle.</p>}
      </>}
      <p>Samma datum och morgon/eftermiddag gäller för alternativen. Veckoplaneringen visar ett mängdintervall och simmaren väljer sitt upplägg efter träningen.</p>
    </div>}
  </fieldset>
}
