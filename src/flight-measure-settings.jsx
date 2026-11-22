import React, { useId, useRef, useState } from 'react'
import { flightSignalGroups } from '../shared/flight-line.js'
import { isTimeDate } from '../shared/swim-times.js'

export default function FlightMeasureSettings({ data, onSave }) {
  const categoriesId = useId()
  const { customMeasures, sleepGoalMinutes, asOf, days, contextDays } = data
  const [measureKey, setMeasureKey] = useState('')
  const [date, setDate] = useState(asOf)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const writeLock = useRef(false)
  const measure = customMeasures.find(item => item.key === measureKey) ?? customMeasures[0]
  const day = days.find(item => item.date === date) ?? contextDays.find(item => item.date === date)
  const savedScore = measure ? day?.[measure.key] : null
  const firstLoadedDay = contextDays[0]?.date ?? days[0]?.date ?? asOf
  const canDeleteScore = Number.isInteger(savedScore) || (isTimeDate(date) && date >= '0001-01-01' && date < firstLoadedDay)

  const save = async (input, success) => {
    if (writeLock.current) return null
    writeLock.current = true
    setBusy(true)
    setMessage(null)
    try {
      const result = await onSave(input)
      setMessage({ text: result.refreshed ? success : `${success} Öppna kortet igen för att hämta grafen.` })
      return result
    } catch (error) {
      setMessage({ text: error.message, error: true })
      return null
    } finally {
      writeLock.current = false
      setBusy(false)
    }
  }

  const submitGoal = event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const minutes = Number(form.get('hours')) * 60 + Number(form.get('minutes'))
    void save({ action: 'sleep-goal', minutes }, 'Sömnmålet är sparat.')
  }

  const createMeasure = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const created = await save({ action: 'create-measure', name: values.get('name'), category: values.get('category') }, 'Mätvärdet är skapat.')
    if (created) {
      setMeasureKey(created.measureId)
      form.reset()
    }
  }

  const submitScore = event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void save({ action: 'save-score', measureId: measure.key, date, value: Number(form.get('score')) }, 'Värdet är sparat.')
  }

  const deleteScore = () => {
    if (!canDeleteScore || writeLock.current || !window.confirm(`Ta bort värdet för ${measure.label} den ${date}?`)) return
    void save({ action: 'delete-score', measureId: measure.key, date }, 'Värdet är borttaget.')
  }

  return <details className="flight-weights flight-measure-settings">
    <summary>Sömnmål och egna mätvärden</summary>
    <form key={sleepGoalMinutes} onSubmit={submitGoal}>
      <fieldset className="flight-weight-group" disabled={busy}>
        <legend>Simmarens sömnmål</legend>
        <div className="flight-measure-fields">
          <label>Timmar<input name="hours" type="number" inputMode="numeric" min="0" max="14" step="1" required defaultValue={Math.floor((sleepGoalMinutes ?? 0) / 60)} /></label>
          <label>Minuter<input name="minutes" type="number" inputMode="numeric" min="0" max="59" step="1" required defaultValue={(sleepGoalMinutes ?? 0) % 60} /></label>
        </div>
        <p>Målet motsvarar 5 av 5 i måttet Sovtid mot sömnmål.</p>
        <div className="flight-actions">
          <button type="submit" className="secondary-button">Spara sömnmål</button>
          {sleepGoalMinutes != null && <button type="button" className="text-button" onClick={() => save({ action: 'sleep-goal', minutes: null }, 'Sömnmålet är rensat.')}>Rensa mål</button>}
        </div>
      </fieldset>
    </form>
    <form onSubmit={createMeasure}>
      <fieldset className="flight-weight-group" disabled={busy}>
        <legend>Lägg till mätvärde</legend>
        <div className="flight-measure-fields">
          <label>Namn<input name="name" required maxLength={60} placeholder="T.ex. Teknikkänsla" /></label>
          <label>Kategori<input name="category" list={categoriesId} required maxLength={40} placeholder="Välj eller skriv ett namn" /></label>
          <datalist id={categoriesId}>{flightSignalGroups(customMeasures).map(group => <option key={group.label} value={group.label} />)}</datalist>
        </div>
        <div className="flight-actions"><button type="submit" className="secondary-button">Lägg till mått</button></div>
      </fieldset>
    </form>
    {measure && <form onSubmit={submitScore}>
      <fieldset className="flight-weight-group" disabled={busy}>
        <legend>Registrera ett värde</legend>
        <div className="flight-measure-fields">
          <label>Mått<select value={measure.key} onChange={event => setMeasureKey(event.target.value)}>
            {customMeasures.map(item => <option key={item.key} value={item.key}>{item.label} · {item.category}</option>)}
          </select></label>
          <label>Datum<input type="date" value={date} max={asOf} onChange={event => setDate(event.target.value)} required /></label>
          <label>Värde<select key={`${measure.key}:${date}:${savedScore}`} name="score" required defaultValue={savedScore ?? ''}>
            <option value="">Välj 1–5</option>
            {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </div>
        <p>Skalan går från 1 (lågt) till 5 (högt). Ett nytt värde samma dag uppdaterar registreringen.</p>
        <div className="flight-actions">
          <button type="submit" className="secondary-button">Spara värde</button>
          {canDeleteScore && <button type="button" className="text-button danger-text" onClick={deleteScore}>Ta bort värde</button>}
        </div>
      </fieldset>
    </form>}
    {busy && <p role="status">Sparar och uppdaterar grafen…</p>}
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'flight-error' : ''}>{message.text}</p>}
  </details>
}
