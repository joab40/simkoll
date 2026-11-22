import React, { useEffect, useRef, useState } from 'react'
import { changeFlightWeight } from '../shared/flight-line.js'
import { changePracticeBoost } from '../shared/flight-pb.js'
import { builtInFlightDefaults, FLIGHT_MAX_MIN_SWIMMERS, FLIGHT_MIN_SWIMMERS, validateFlightDefaults } from '../shared/flight-defaults.js'
import { FlightBoostControls, FlightPresentationFields, FlightWeightControls } from './flight-record.jsx'
import './coach-flight-record.css'

export default function CoachFlightRecord({ code, request, groups, onOpenOverview }) {
  const [group, setGroup] = useState('')
  const [loaded, setLoaded] = useState(null)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const saveLock = useRef(false)
  const endpoint = '/api/training?flightRecord=defaults' + (group ? '&group=' + encodeURIComponent(group) : '')
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(loaded?.settings)
  const locked = saving || !loaded?.canEdit

  useEffect(() => {
    const controller = new AbortController()
    setMessage('')
    setError('')
    setLoaded(null)
    setDraft(null)
    request(endpoint, code, { signal: controller.signal, retry: false }).then(data => {
      if (controller.signal.aborted) return
      setLoaded(data)
      setDraft(data.settings)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message)
    })
    return () => controller.abort()
  }, [endpoint, code, request, attempt])

  const choose = event => {
    if (dirty && !window.confirm('Byta inställningar och lämna dina osparade ändringar?')) return
    setGroup(event.target.value)
  }
  const update = (change) => {
    setDraft(change)
    setMessage('')
    setError('')
  }
  const save = async (reset = false) => {
    if (locked || saveLock.current) return
    setError('')
    setMessage('')
    let settings
    try { settings = reset ? null : validateFlightDefaults(draft) } catch (reason) { setError(reason.message); return }
    saveLock.current = true
    setSaving(true)
    try {
      const data = await request(endpoint, code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) })
      setLoaded(data)
      setDraft(data.settings)
      setMessage(reset ? (group ? 'Gruppen följer nu klubbens standardvärden.' : 'Klubbens standardvärden är återställda.') : 'Standardvärdena är sparade.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  return <section className="coach-flight-settings">
    <header className="period-heading">
      <div><h1>Flight Record</h1><p>Standardvärden för simmare och träningsgrupper.</p></div>
      {onOpenOverview && <button type="button" className="secondary-button" disabled={saving} onClick={() => {
        if (!dirty || window.confirm('Öppna Grupptrend och lämna dina osparade ändringar?')) onOpenOverview()
      }}>Öppna gruppöversikten →</button>}
    </header>
    <div className="coach-flight-settings-card">
      <label className="flight-field">Standardinställningar för
        <select value={group} onChange={choose} disabled={saving}>
          <option value="">Alla simmare · klubbens standard</option>
          {groups.map(([id, name]) => <option key={id} value={id}>{name} · gruppens standard</option>)}
        </select>
      </label>
      {loaded && <p className="flight-muted">{group
        ? loaded.inherited ? 'Gruppen följer klubbens standardvärden. Här kan du spara gruppens egna förval.' : 'Gruppen har egna förval för sina simmare.'
        : 'Klubbens förval används av simmare och grupper som följer standardinställningarna.'} En simmares egna inställningar har företräde.</p>}
      {loaded && !loaded.canEdit && <p className="flight-muted">Huvudtränare och superadmin kan ändra klubbens standardvärden.</p>}
      {!draft ? error ? <button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Hämta igen</button>
        : <p role="status">Hämtar standardvärden…</p> : <>
        <FlightWeightControls weights={draft.weights} onChange={(key, value, source) => update(current => ({ ...current,
          weights: changeFlightWeight(source ?? current.weights, key, value),
        }))} saving={locked} shared />
        <FlightBoostControls weights={draft.weights} onChange={(key, value) => update(current => ({ ...current,
          weights: changeFlightWeight(current.weights, key, value),
        }))} saving={locked} shared taperAvailable configAvailable pbAvailable config={draft.boosts} pbConfig={draft.pbBoosts}
          onConfigChange={(kind, key, value) => update(current => ({ ...current,
            boosts: { ...current.boosts, [kind]: { ...current.boosts[kind], [key]: value } },
          }))}
          onPbChange={(kind, key, value) => update(current => ({ ...current,
            pbBoosts: { ...current.pbBoosts, [kind]: changePracticeBoost(current.pbBoosts[kind], key, value) },
          }))} />
        <details className="flight-presentation">
          <summary>Simmarens visning</summary>
          <div className="flight-presentation-body"><FlightPresentationFields draft={draft.presentation} saving={locked}
            update={patch => update(current => ({ ...current, presentation: { ...current.presentation, ...patch } }))} /></div>
        </details>
        <details className="flight-weights">
          <summary>Gruppkurvan i Grupptrend</summary>
          <div className="flight-measure-fields">
            <label>Minsta antal simmare med värde per dag
              <input type="number" inputMode="numeric" min={FLIGHT_MIN_SWIMMERS} max={FLIGHT_MAX_MIN_SWIMMERS}
                step={1} value={draft.minSwimmers} disabled={locked}
                onChange={event => update(current => ({ ...current, minSwimmers: event.target.value === '' ? '' : event.target.valueAsNumber }))} />
            </label>
          </div>
          <p className="flight-muted">{group ? 'Gränsen gäller när gruppen visas för sig.' : 'Gränsen gäller också när flera grupper visas tillsammans.'}</p>
        </details>
        {loaded.canEdit && <div className="flight-actions">
          <button type="button" className="primary-button" disabled={saving || (!dirty && !loaded.inherited)} onClick={() => save()}>
            {saving ? 'Sparar…' : 'Spara standardvärden'}
          </button>
          <button type="button" className="secondary-button" disabled={saving || (group ? loaded.inherited && !dirty : JSON.stringify(loaded.settings) === JSON.stringify(builtInFlightDefaults) && !dirty)}
            onClick={() => {
              if (window.confirm(group ? 'Låt gruppen följa klubbens standardvärden?' : 'Återställ klubbens Flight Record till appens förval?')) void save(true)
            }}>{group ? 'Följ klubbens standard' : 'Återställ klubbens förval'}</button>
        </div>}
      </>}
      {error && <p className="flight-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </section>
}
