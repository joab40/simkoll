import React, { useEffect, useRef, useState } from 'react'
import { clearOccasionTarget, compatibleOccasionChoices, defaultOccasionUpdate, occasionChoiceKey, occasionChoiceUpdate, occasionSelectionKey, occasionValidationKey, validOccasionSelection } from '../shared/workout-occasion-selection.js'
import './workout-occasion-choice.css'

export default function WorkoutOccasionChoice({ form, loadChoices, onChange, onValidationChange, disabled = false, autoDefault = false }) {
  const mode = form.occasionMode || (form.id ? 'keep' : 'new')
  const [choices, setChoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loadedFor, setLoadedFor] = useState(null)
  const latest = useRef({ form, onChange }); latest.current = { form, onChange }
  const shouldLoad = autoDefault || mode === 'existing'
  useEffect(() => {
    if (!shouldLoad) return
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(); setError('Dagens träningar kunde inte hämtas i tid. Försök igen.'); setLoading(false) }, 20000)
    setLoading(true); setChoices([]); setError(''); setLoadedFor(null)
    loadChoices(controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const options = data.occasions || []
      setChoices(options)
      setLoadedFor(() => loadChoices)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { clearTimeout(timer); if (!controller.signal.aborted) setLoading(false) })
    // An aborted old date must never overwrite the current date's choices.
    return () => { clearTimeout(timer); controller.abort() }
  }, [shouldLoad, autoDefault, loadChoices, retry])
  const ready = loadedFor === loadChoices && !loading && !error
  const compatible = compatibleOccasionChoices(choices, form)
  const validationKey = occasionValidationKey(form)
  const valid = validOccasionSelection({ ...form, occasionMode: mode }, choices) && (mode !== 'existing' || ready)
  useEffect(() => { onValidationChange?.({ key: validationKey, valid }) }, [onValidationChange, validationKey, valid])
  useEffect(() => {
    if (!autoDefault || !ready) return
    // The editor can finish loading/reset its draft after the choices arrive.
    // Reconcile here so defaults apply in either response order.
    if (latest.current.form.occasionMode == null) { latest.current.onChange(defaultOccasionUpdate(choices, latest.current.form)); return }
    if (mode !== 'existing') return
    // Inherited state and changed groups must be checked against this date's
    // actual choices, rather than keeping an empty/stale "existing" selection.
    if (!compatible.length) latest.current.onChange({ occasionMode: 'new', ...clearOccasionTarget })
    else if (occasionSelectionKey(form) && !validOccasionSelection(form, choices)) latest.current.onChange({ ...clearOccasionTarget })
  }, [autoDefault, ready, mode, validationKey, choices])
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
      <button type="button" disabled={autoDefault && ready && !compatible.length} aria-pressed={mode === 'existing'} onClick={() => changeMode('existing')}><strong>Alternativ till befintlig träning</strong><small>Annat upplägg för samma tillfälle. Mängderna räknas en gång.</small></button>
    </div>
    {mode === 'existing' && <div className="workout-occasion-target">
      {loading ? <p role="status">Hämtar dagens träningstillfällen…</p> : error ? <p role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Försök igen</button></p> : <>
        <label>Vilken träning hör upplägget till? (obligatoriskt)<select required aria-invalid={!valid} value={occasionSelectionKey(form)} onChange={(event) => choose(event.target.value)}><option value="">Välj ett befintligt träningstillfälle…</option>{compatible.map((item) => <option key={occasionChoiceKey(item)} value={occasionChoiceKey(item)}>{slotLabel(item)} · {item.titles.join(' / ')}{item.location ? ` · ${item.location}` : ''}</option>)}</select></label>
        {compatible.length > 0 && !valid && <p className="form-error" role="status">Välj träningstillfälle ovan för att kunna publicera. Passet kopplas då till den planerade träningen.</p>}
        {!compatible.length && <p>Inga befintliga simträningar hittades för datumet och de valda grupperna. Välj Nytt träningstillfälle.</p>}
      </>}
      <p>Passet kopplas till den valda träningens datum, starttid och plats. Mängderna räknas en gång.</p>
    </div>}
    {autoDefault && ready && !compatible.length && mode === 'new' && <p>Ingen befintlig träning hittades för datumet och de valda grupperna. Passet publiceras som ett nytt träningstillfälle.</p>}
  </fieldset>
}
