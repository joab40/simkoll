import React, { useState } from 'react'
import { apiRequest } from './api-request.js'

export default function CoachTestEmail({ account, code }) {
  const [sending, setSending] = useState(false), [message, setMessage] = useState('')
  const send = async () => {
    if (sending || !window.confirm(`Skicka ett testmejl till ${account.email}? Inget lösenord ändras.`)) return
    setSending(true); setMessage('')
    try {
      const result = await apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-test-email', accountId: account.id }) })
      setMessage(result.message)
    } catch (error) { setMessage(error.message || 'Testmejlet kunde inte skickas.') }
    finally { setSending(false) }
  }
  return <div className="coach-test-email"><button type="button" className="secondary-button" disabled={sending || !account.email} onClick={send}>{sending ? 'Skickar…' : 'Testa mejl'}</button>{message && <small role="status" aria-live="polite">{message}</small>}</div>
}
