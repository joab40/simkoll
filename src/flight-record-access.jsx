import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createVisibleRefresh } from './visible-refresh.js'
import SwimmerCardSummary from './swimmer-card-summary.jsx'
import './flight-record.css'

const statusUrl = '/api/training?flightRecord=status'
const dataUrl = '/api/training?flightRecord=data'
const weightsUrl = '/api/training?flightRecord=weights'
const postOptions = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const empty = { access: null, saving: false, error: '' }
const FlightRecordChart = React.lazy(() => import('./flight-record.jsx'))
const FlightRecordDetails = React.lazy(() => import('./flight-record.jsx').then(module => ({ default: module.FlightRecordView })))

export function useFlightRecordAccess(profileId, code, request) {
  const scope = useMemo(() => ({ profileId, code, alive: false, revision: 0, saving: false }), [profileId, code])
  const [record, setRecord] = useState(null)
  const state = record?.scope === scope ? record : empty

  const refresh = useCallback(async () => {
    if (!scope.profileId || !scope.alive || scope.saving) return
    const revision = ++scope.revision
    try {
      const access = await request(statusUrl, scope.code, { retry: false })
      if (scope.alive && scope.revision === revision) {
        setRecord(current => ({ scope, access, saving: false, error: current?.scope === scope ? current.error : '' }))
      }
    } catch { /* Background refresh. The form page checks access separately. */ }
  }, [scope, request])

  useEffect(() => {
    if (!scope.profileId) return undefined
    scope.alive = true
    const loader = createVisibleRefresh(refresh, { minInterval: 1500 })
    const visible = () => { void loader.refresh() }
    visible()
    window.addEventListener('focus', visible)
    window.addEventListener('simkoll-home-open', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      scope.alive = false
      scope.revision++
      loader.dispose()
      window.removeEventListener('focus', visible)
      window.removeEventListener('simkoll-home-open', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [scope, refresh])

  const choose = async (choice) => {
    if (!scope.alive || scope.saving || !state.access?.offered) return
    scope.saving = true
    const revision = ++scope.revision
    setRecord({ scope, access: state.access, saving: true, error: '' })
    try {
      const access = await request(statusUrl, scope.code, postOptions({ choice, offerId: state.access.offerId }))
      if (scope.alive && scope.revision === revision) setRecord({ scope, access, saving: false, error: '' })
    } catch (error) {
      if (scope.alive && scope.revision === revision) setRecord({ scope, access: state.access, saving: false, error: error.message })
      scope.saving = false
      void refresh()
    } finally {
      scope.saving = false
    }
  }
  return { ...state, choose, refresh }
}

export function FlightRecordHomeCard({ flight, code, request, competitions }) {
  if (!flight.access?.offered || flight.access.choice === 'later') return null
  if (flight.access.choice === 'active') return <section className="flight-home-card" aria-label="Flight Record">
    <h2>Flight Record <span aria-hidden="true">✈︎</span></h2>
    <React.Suspense fallback={<p className="empty" role="status">Öppnar formgrafen…</p>}>
      <FlightRecordChart key={flight.access.offerId} code={code} request={request} competitions={competitions} onRefreshAccess={flight.refresh} />
    </React.Suspense>
  </section>
  return <section className="flight-invitation" aria-label="Flight Record">
    <span className="flight-invitation-icon" aria-hidden="true">✈︎</span>
    <div>
      <h2>Flight Record</h2>
      <p>Vill du visa din formgraf på startsidan?</p>
      <div className="flight-actions">
        <button type="button" className="primary-button" disabled={flight.saving} onClick={() => flight.choose('active')}>Visa grafen</button>
        <button type="button" className="secondary-button" disabled={flight.saving} onClick={() => flight.choose('later')}>Inte nu</button>
      </div>
      <p className="flight-invitation-help">Du kan ändra valet under Min profil.</p>
      {flight.error && <p role="alert" className="flight-error">{flight.error}</p>}
    </div>
  </section>
}

export function FlightRecordProfileSetting({ flight }) {
  if (!flight.access?.offered) return null
  const active = flight.access.choice === 'active'
  return <section className="flight-profile-setting">
    <label className="flight-toggle">
      <span><strong>✈︎ Visa Flight Record</strong><small>Visa formgrafen på startsidan.</small></span>
      <input type="checkbox" checked={active} disabled={flight.saving} onChange={event => flight.choose(event.target.checked ? 'active' : 'later')} />
    </label>
    {flight.error && <p role="alert" className="flight-error">{flight.error}</p>}
  </section>
}

function CoachFlightRecord({ profileId, code, request, competitions }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const profileQuery = '&profileId=' + encodeURIComponent(profileId)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    request(dataUrl + profileQuery, code, { signal: controller.signal, retry: false }).then(data => {
      if (!controller.signal.aborted) setData(data)
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [profileQuery, code, request, attempt])

  if (error) return <div className="flight-error">
    <p role="alert">{error}</p>
    <button type="button" className="text-button" onClick={() => setAttempt(current => current + 1)}>Hämta igen</button>
  </div>
  if (!data) return <p className="empty" role="status">Hämtar formresan…</p>
  const saveWeights = (weights, boostSettings, pbBoostSettings) => request(weightsUrl + profileQuery, code, postOptions({ weights, boostSettings, pbBoostSettings }))
  const saveMeasure = async input => {
    const result = await request('/api/training?flightRecord=measures' + profileQuery, code, postOptions(input))
    try {
      const next = await request(dataUrl + profileQuery, code, { retry: false })
      setData(next)
      return { ...result, refreshed: true }
    } catch {
      return { ...result, refreshed: false }
    }
  }
  return <React.Suspense fallback={<p className="empty" role="status">Öppnar formresan…</p>}>
    <FlightRecordDetails data={data} competitions={competitions} saveWeights={saveWeights} saveMeasure={saveMeasure} />
  </React.Suspense>
}

function FlightRecordCoachVisibility({ profileId, code, request }) {
  const [state, setState] = useState({ offered: null, saving: false, error: '' })
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ alive: false, saving: false }), [profileId, code, attempt])
  const profileQuery = '&profileId=' + encodeURIComponent(profileId)
  const url = statusUrl + profileQuery

  useEffect(() => {
    scope.alive = true
    setState({ offered: null, saving: false, error: '' })
    request(url, code, { retry: false }).then(({ offered }) => {
      if (scope.alive) setState({ offered, saving: false, error: '' })
    }).catch(error => {
      if (scope.alive) setState({ offered: null, saving: false, error: error.message })
    })
    return () => { scope.alive = false }
  }, [scope, url, code, request])

  const save = async (offered) => {
    if (!scope.alive || scope.saving) return
    scope.saving = true
    setState(current => ({ ...current, saving: true, error: '' }))
    try {
      const status = await request(url, code, postOptions({ offered }))
      if (scope.alive) setState({ offered: status.offered, saving: false, error: '' })
    } catch (error) {
      if (scope.alive) setState(current => ({ ...current, saving: false, error: error.message }))
    } finally {
      scope.saving = false
    }
  }

  return <section className="flight-coach-setting">
    <label className="flight-toggle">
      <span><strong>Visa för simmaren</strong><small>Simmaren väljer själv om grafen visas på startsidan.</small></span>
      <input type="checkbox" checked={state.offered === true} disabled={state.offered == null || state.saving} onChange={event => save(event.target.checked)} />
    </label>
    {state.offered == null && !state.error && <small role="status">Hämtar inställningen…</small>}
    {state.error && <p role="alert" className="flight-error">{state.error} {state.offered == null && <button type="button" onClick={() => setAttempt(current => current + 1)}>Hämta igen</button>}</p>}
  </section>
}

export function FlightRecordCoachCard(props) {
  const [open, setOpen] = useState(false)
  const panel = useRef(null)
  const expandButton = useRef(null)
  const restoreButton = useRef(null)
  const titleId = useId()

  const expand = () => {
    // Switch the same dialog into the top layer so the filters and any draft stay mounted.
    panel.current.close()
    panel.current.showModal()
    panel.current.scrollTop = 0
    restoreButton.current.focus({ preventScroll: true })
  }

  const restore = () => {
    panel.current.close()
    panel.current.show()
    expandButton.current.focus({ preventScroll: true })
  }

  return <details className="flight-coach-card swimmer-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <SwimmerCardSummary icon="✈︎" title="Flight Record" description="Formgraf, mätvärden och vikter" />
    {open && <dialog open ref={panel} className="flight-coach-content" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); restore() }}>
      <header className="flight-coach-toolbar">
        <h2 id={titleId}>Flight Record{props.swimmerName && ` · ${props.swimmerName}`}</h2>
        <button ref={expandButton} type="button" className="secondary-button flight-coach-expand" aria-haspopup="dialog" onClick={expand}>⛶ Helskärm</button>
        <button ref={restoreButton} type="button" className="secondary-button flight-coach-restore" onClick={restore}>↙ Tillbaka till simmarkortet</button>
      </header>
      <FlightRecordCoachVisibility {...props} />
      <CoachFlightRecord {...props} />
    </dialog>}
  </details>
}
