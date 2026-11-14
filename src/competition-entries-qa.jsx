import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CompetitionEntryProgress from './competition-entry-progress.jsx'
import './styles.css'

const roster = ['Anna', 'Bo', 'Clara', 'David', 'Elsa', 'Filip', 'Greta', 'Hugo'].map((name, index) => ({ id: `${index}`, name, emoji: ['🐬', '🐢', '🐙', '🦦'][index % 4] }))
const baseEntries = roster.slice(0, 3).map(p => ({ profile_id: p.id, status: 'submitted' }))
const drafts = roster.slice(3, 5).map(p => ({ profile_id: p.id, status: 'draft' }))
function Preview() {
  const [scenario, setScenario] = useState('mixed')
  const entries = scenario === 'complete' ? roster.map(p => ({ profile_id: p.id, status: 'submitted' })) : scenario === 'none' ? [] : [...baseEntries, ...drafts]
  return <main className="page-content" style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}><p style={{ fontSize: 12 }}>Fiktiv förhandsvisning · inga riktiga personuppgifter eller databasändringar.</p><label>Testläge <select value={scenario} onChange={event => setScenario(event.target.value)}><option value="mixed">Blandad status</option><option value="complete">Alla inskickade</option><option value="none">Inga inskickade</option><option value="empty">Tom grupp</option><option value="closed">Stängd anmälan</option><option value="unavailable">Hämtningsfel</option></select></label><section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Se vilka som skickat in och vilka grenval som återstår.</small></div></div><label className="settings-field"><strong>Välj tävling</strong><select><option>Vinterpokalen · 2026-12-05</option></select></label><CompetitionEntryProgress key={scenario} roster={scenario === 'empty' ? [] : roster} entries={entries} available={scenario !== 'unavailable'} entriesOpen={scenario !== 'closed'} /><h2 className="competition-submitted-heading">Inskickade grenval</h2><div className="competition-swimmer-picker">{roster.filter(p => entries.some(e => e.profile_id === p.id && e.status === 'submitted')).map(p => <button key={p.id} type="button"><span className="competition-picker-name">{p.emoji} {p.name}</span><small>1 gren</small></button>)}</div></section></main>
}
createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile' ? <iframe title="Grenanmälan i mobilbredd, fiktivt demo" src="/competition-entries-qa.html" style={{ width: 390, maxWidth: '100%', height: 1100, border: 0 }} /> : <Preview />)
