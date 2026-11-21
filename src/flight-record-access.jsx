import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createVisibleRefresh } from './visible-refresh.js'
import './flight-record.css'

const statusUrl = '/api/training?flightRecord=status'
const postOptions = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const empty = { access: null, saving: false, error: '' }

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

export function FlightRecordHomeCard({ flight, onOpen }) {
  if (!flight.access?.offered || flight.access.choice === 'later') return null
  const active = flight.access.choice === 'active'
  return <section className="flight-invitation" aria-label="Flight Record">
    <span className="flight-invitation-icon" aria-hidden="true">✈︎</span>
    <div>
      <p className="eyebrow">Din formresa</p>
      <h2>Flight Record</h2>
      <p>{active ? 'Följ farten och träningen fram till nästa tävling.' : 'Vill du följa dina simtider, din fartkänsla och träningen fram till nästa tävling?'}</p>
      <div className="flight-actions">
        {active ? <button type="button" className="primary-button" onClick={onOpen}>Öppna formresan →</button> : <>
          <button type="button" className="primary-button" disabled={flight.saving} onClick={() => flight.choose('active')}>Aktivera</button>
          <button type="button" className="secondary-button" disabled={flight.saving} onClick={() => flight.choose('later')}>Inte nu</button>
        </>}
      </div>
      {!active && <p className="flight-invitation-help">Du kan ändra valet under Min profil.</p>}
      {flight.error && <p role="alert" className="flight-error">{flight.error}</p>}
    </div>
  </section>
}

export function FlightRecordProfileSetting({ flight, onOpen }) {
  if (!flight.access?.offered) return null
  const active = flight.access.choice === 'active'
  return <section className="flight-profile-setting">
    <label className="flight-toggle">
      <span><strong>✈︎ Flight Record</strong><small>Visa din formresa mot nästa tävling.</small></span>
      <input type="checkbox" checked={active} disabled={flight.saving} onChange={event => flight.choose(event.target.checked ? 'active' : 'later')} />
    </label>
    {active && <button type="button" className="text-button" onClick={onOpen}>Öppna formresan →</button>}
    {flight.error && <p role="alert" className="flight-error">{flight.error}</p>}
  </section>
}

export function FlightRecordCoachSetting({ profileId, code, request }) {
  const [state, setState] = useState({ offered: null, saving: false, error: '' })
  const [attempt, setAttempt] = useState(0)
  const scope = useMemo(() => ({ alive: false, saving: false }), [profileId, code, attempt])
  const url = statusUrl + '&profileId=' + encodeURIComponent(profileId)

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
      <span><strong>Erbjud Flight Record</strong><small>Simmaren väljer själv om formresan visas.</small></span>
      <input type="checkbox" checked={state.offered === true} disabled={state.offered == null || state.saving} onChange={event => save(event.target.checked)} />
    </label>
    {state.offered == null && !state.error && <small role="status">Hämtar inställningen…</small>}
    {state.error && <p role="alert" className="flight-error">{state.error} {state.offered == null && <button type="button" onClick={() => setAttempt(current => current + 1)}>Hämta igen</button>}</p>}
  </section>
}
