import React, { useEffect, useId, useRef, useState } from 'react'
import { formatFeedDate } from './community-date.js'

export default function OpenChatReadDetails({ message, code, request, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    request(`/api/community?openChatReadDetails=${encodeURIComponent(message.id)}`, code, { signal: controller.signal, retry: false })
      .then(details => { if (!controller.signal.aborted) setResult(details) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [attempt, code, message.id, request])

  const { seenCount, recipientCount, unseen } = result || message.engagement
  return <dialog className="info-read-dialog" ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="info-read-dialog-content">
      <header>
        <div><p className="eyebrow">Tränarinfo · {formatFeedDate(message.createdAt)}</p><h2 id={titleId}>Sett av {seenCount} / {recipientCount}</h2></div>
        <button type="button" className="secondary-button" autoFocus onClick={onClose} aria-label="Stäng visningslistan">Stäng</button>
      </header>
      {error ? <div role="status"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></div>
        : !result ? <p role="status">Hämtar visningslistan…</p>
        : !recipientCount ? <p>Det finns inga aktiva mottagare.</p>
        : !unseen.length ? <p>Alla mottagare har fått meddelandet visat.</p>
        : <section>
          <h3>Saknar registrerad visning · {unseen.length}</h3>
          <ul>{unseen.map(profile => <li key={profile.id}><span aria-hidden="true">{profile.emoji || '🏊'}</span>{profile.displayName}</li>)}</ul>
        </section>}
      <p className="info-read-dialog-note">En visning registreras när meddelandet visas på startsidan eller i tränarinfon.</p>
    </div>
  </dialog>
}
