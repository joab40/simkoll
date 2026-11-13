import React, { useState } from 'react'

export function coachResetRoute(hash) {
  if (!String(hash).startsWith('#coach-reset=')) return { active: false, token: '' }
  const token = String(hash).slice('#coach-reset='.length)
  return { active: true, token: /^[a-f0-9]{64}$/.test(token) ? token : '' }
}

export default function CoachPasswordReset({ token }) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault(); setError('')
    if (password !== confirm) { setError('Lösenorden matchar inte.'); return }
    setLoading(true)
    try {
      const result = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-reset-password', token, password }) })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error || 'Återställningen misslyckades. Begär en ny länk.')
      setPassword(''); setConfirm(''); setMessage(data.message)
    } catch (failure) { setError(failure.message || 'Kunde inte ansluta. Försök igen.') }
    finally { setLoading(false) }
  }
  return <main className="login-page coach-reset-page"><section className="login-card"><p className="eyebrow">Tränarkonto · Simkoll</p><h1>Välj nytt lösenord</h1>
    {message ? <p role="status">{message}</p> : !token ? <p role="alert">Länken är ogiltig. Gå till tränarinloggningen och välj Glömt lösenord? för att begära en ny.</p> : <><p>Länken gäller i 30 minuter och kan användas en gång. Tidigare tränarsessioner avslutas när du sparar.</p><form className="code-form" onSubmit={submit}>
      <label htmlFor="coach-new-password">Nytt lösenord</label><input id="coach-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
      <label htmlFor="coach-confirm-password">Upprepa nytt lösenord</label><input id="coach-confirm-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={loading} type="submit">{loading ? 'Sparar…' : 'Spara nytt lösenord'}</button>
    </form></>}
    <a href="/">Till inloggningen / begär en ny länk</a>
  </section></main>
}
