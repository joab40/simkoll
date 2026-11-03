import React, { useEffect, useRef, useState } from 'react'
import { clearOccasionTarget, defaultOccasionUpdate, occasionChoiceKey, occasionChoiceUpdate, occasionSelectionKey } from '../shared/workout-occasion-selection.js'
import './workout-occasion-choice.css'

export default function WorkoutOccasionChoice({ form, loadChoices, onChange, disabled = false, autoDefault = false }) {
  const mode = form.occasionMode || (form.id ? 'keep' : 'new')
  const [choices, setChoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const latest = useRef({ form, onChange }); latest.current = { form, onChange }
  const shouldLoad = autoDefault || mode === 'existing'
  useEffect(() => {
    if (!shouldLoad) return
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(); setError('Dagens träningar kunde inte hämtas i tid. Försök igen.'); setLoading(false) }, 20000)
    setLoading(true); setChoices([]); setError('')
    loadChoices(controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const options = data.occasions || []
      setChoices(options)
      // Never overwrite an explicit coach choice while this read was pending.
      if (autoDefault && latest.current.form.occasionMode == null) latest.current.onChange(defaultOccasionUpdate(options, latest.current.form))
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { clearTimeout(timer); if (!controller.signal.aborted) setLoading(false) })
    // An aborted old date must never overwrite the current date's choices.
    return () => { clearTimeout(timer); controller.abort() }
  }, [shouldLoad, autoDefault, loadChoices, retry])
  const changeMode = (value) => { if (value !== mode || form.occasionMode == null) onChange({ occasionMode: value, ...clearOccasionTarget }) }
  const choose = (id) => {
    onChange(occasionChoiceUpdate(choices.find(item => occasionChoiceKey(item) === id), form))
  }
  const slotLabel = (item) => item.time || (item.timeOfDay === 'morning' ? 'Morgon' : item.timeOfDay === 'afternoon' ? 'Eftermiddag / kväll' : 'Tid ej angiven')
  return <fieldset className="workout-occasion-choice" disabled={disabled}><legend>Träningstillfälle</legend>
    {autoDefault && mode !== 'existing' && loading && <p role="status">Kontrollerar dagens planerade träningar…</p>}
    {autoDefault && mode !== 'existing' && error && <p role="alert">{error} Välj Nytt träningstillfälle om du vill skapa en separat träning. <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Försök igen</button></p>}
    <div className="workout-occasion-modes" role="group" aria-label="Hur hör passet till planeringen?">
      {form.id && <button type="button" aria-pressed={mode === 'keep'} onClick={() => changeMode('keep')}><strong>Behåll nuvarande tillfälle</strong><small>Spara ändringar i passet med samma koppling.</small></button>}
      <button type="button" aria-pressed={mode === 'new'} onClick={() => changeMode('new')}><strong>Nytt träningstillfälle</strong><small>Passet räknas som en egen träning.</small></button>
      <button type="button" aria-pressed={mode === 'existing'} onClick={() => changeMode('existing')}><strong>Alternativ till befintlig träning</strong><small>Annat upplägg för samma tillfälle. Mängderna räknas en gång.</small></button>
    </div>
    {mode === 'existing' && <div className="workout-occasion-target">
      {loading ? <p role="status">Hämtar dagens träningstillfällen…</p> : error ? <p role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Försök igen</button></p> : <>
        <label>Vilken träning hör upplägget till?<select required value={occasionSelectionKey(form)} onChange={(event) => choose(event.target.value)}><option value="">Välj ett befintligt träningstillfälle…</option>{choices.map((item) => <option key={occasionChoiceKey(item)} value={occasionChoiceKey(item)}>{slotLabel(item)} · {item.titles.join(' / ')}{item.location ? ` · ${item.location}` : ''}</option>)}</select></label>
        {!choices.length && <p>Inga befintliga simträningar hittades på det valda datumet. Välj Nytt träningstillfälle.</p>}
      </>}
      <p>Samma datum och morgon/eftermiddag gäller för alternativen. Veckoplaneringen visar ett mängdintervall och simmaren väljer sitt upplägg efter träningen.</p>
    </div>}
  </fieldset>
}
