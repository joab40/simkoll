import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ActivityCorrection from './activity-correction.jsx'
import { activityStreak, shiftActivityDay } from '../shared/activity-streak.js'
import './styles.css'

const today = '2026-11-16', missing = '2026-11-11'
const profiles = [{ id: '11111111-1111-4111-8111-111111111111', displayName: 'Demo-simmare', emoji: '🐬' }, { id: '33333333-3333-4333-8333-333333333333', displayName: 'Min egen simmarprofil · demo', emoji: '🌊' }]
const histories = new Map(profiles.map(profile => [profile.id, { activityDates: Array.from({ length: 12 }, (_, index) => shiftActivityDay(today, -index)).filter(day => day !== missing), corrections: [] }]))
async function mockRequest(url, _code, options = {}) {
  if (options.method === 'POST') {
    const body = JSON.parse(options.body), history = histories.get(body.profileId)
    if (body.action !== 'correct-activity-day' || !body.confirmed || !history) throw new Error('Ogiltigt demosvar.')
    const added = !history.activityDates.includes(body.activityDate)
    if (added) { history.activityDates.push(body.activityDate); history.corrections.push({ activity_date: body.activityDate, reason: body.reason, created_at: `${today}T12:00:00Z` }) }
    return { added, message: added ? 'Fiktiv rättelse sparad i demots minne. Inga databasändringar eller poäng.' : 'Dagen var redan registrerad. Inget ändrades.' }
  }
  const id = new URL(url, 'https://demo.invalid').searchParams.get('profileId'), history = histories.get(id)
  return structuredClone({ ...history, profile: profiles.find(profile => profile.id === id), today, createdDay: '2026-10-01', streak: activityStreak(history.activityDates, today) })
}
function Demo() {
  const [role, setRole] = useState('superadmin')
  return <main style={{ maxWidth: 760, margin: '24px auto', padding: 20 }}><h1>Aktivitetsrättelse · fiktiv demo</h1><p>Inga riktiga konton eller API-anrop. Den 11 november saknas: 5 dagar kan bli 12 efter rättelsen.</p><label>Roll <select value={role} onChange={event => setRole(event.target.value)}><option value="superadmin">Superadmin</option><option value="head_coach">Huvudtränare</option><option value="coach">Tränare</option></select></label>{profiles.map(profile => <section key={profile.id} className="coach-card" style={{ marginTop: 20, padding: 20 }}><h2>{profile.emoji} {profile.displayName}</h2>{role === 'superadmin' ? <ActivityCorrection profile={profile} code="demo" request={mockRequest} /> : <p>Rättelseverktyget visas endast för superadmin.</p>}</section>)}</main>
}
createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile' ? <iframe title="Aktivitetsrättelse i mobilbredd, fiktiv demo" src="/activity-correction-qa.html" style={{ width: 390, maxWidth: '100%', height: 1000, border: 0 }} /> : <Demo />)
