import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CompetitionEntryProgress from './competition-entry-progress.jsx'
import CompetitionEntryChoices from './competition-entry-choices.jsx'
import CompetitionPm from './competition-pm.jsx'
import './competition-entries.css'
import './styles.css'

const roster = ['Anna', 'Bo', 'Clara', 'David', 'Elsa', 'Filip', 'Greta', 'Hugo'].map((name, index) => ({ id: `${index}`, name, emoji: ['🐬', '🐢', '🐙', '🦦'][index % 4] }))
const baseEntries = roster.slice(0, 3).map(p => ({ profile_id: p.id, status: 'submitted' }))
const drafts = roster.slice(3, 5).map(p => ({ profile_id: p.id, status: 'draft' }))
function FilterPreview() {
  const [competition, setCompetition] = useState('demo'), [selected, setSelected] = useState(['race-3'])
  const events = [
    ['Herrar', '13–14', '400 m medley'], ['Damer', '13–14', '400 m medley'],
    ['Herrar', '15–16', '100 m frisim'], ['Mix', 'Alla åldrar', '4 × 50 m frisim'],
    ['Alla', 'Ej angiven – se PM', '50 m fjärilsim'],
  ].map(([gender, ageClass, label], index) => ({ id: `race-${index + 1}`, eventNumber: `${index + 1}`, gender: `Kön: ${gender}`, ageClass: `Klass: ${ageClass}`, label, selectable: true, itemType: 'race' }))
  return <main><section className="competition-entries">
    <p style={{ fontSize: 12, color: '#5c7277' }}>Fiktiv förhandsvisning · inga API-anrop eller databasändringar.</p>
    <button type="button" className="back-button inline">← Tillbaka</button>
    <div className="period-heading"><div><p className="eyebrow">Tävlingskalender</p><h1>Mina grenar</h1><small>Välj vilka grenar du vill simma. Tränarna ser när du skickar in.</small></div></div>
    <label className="settings-field"><strong>Tävling</strong><select value={competition} onChange={event => { setCompetition(event.target.value); setSelected([]) }}><option value="demo">Vinterpokalen · 2026-12-05</option><option value="other">Vinterpokalen för juniorer och ungdomar – ett långt tävlingsnamn · 2026-12-12</option></select></label>
    <CompetitionPm competition={{ id: competition, pmDocument: { name: 'vinterpokalen.pdf' } }} code="demo" request={async () => { throw new Error('Fiktiv förhandsvisning – inget PM hämtas.') }} />
    <fieldset className="competition-entry-fields"><CompetitionEntryChoices key={competition} events={events} selected={selected} onChange={setSelected} /></fieldset><p role="status">Valda grenar: {selected.length ? selected.join(', ') : 'inga'}</p>
  </section></main>
}
function Preview() {
  const [scenario, setScenario] = useState('mixed')
  const entries = scenario === 'complete' ? roster.map(p => ({ profile_id: p.id, status: 'submitted' })) : scenario === 'none' ? [] : [...baseEntries, ...drafts]
  return <main className="page-content" style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}><p style={{ fontSize: 12 }}>Fiktiv förhandsvisning · inga riktiga personuppgifter eller databasändringar.</p><label>Testläge <select value={scenario} onChange={event => setScenario(event.target.value)}><option value="mixed">Blandad status</option><option value="complete">Alla inskickade</option><option value="none">Inga inskickade</option><option value="empty">Tom grupp</option><option value="closed">Stängd anmälan</option><option value="unavailable">Hämtningsfel</option></select></label><section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Se vilka som skickat in och vilka grenval som återstår.</small></div></div><label className="settings-field"><strong>Välj tävling</strong><select><option>Vinterpokalen · 2026-12-05</option></select></label><CompetitionEntryProgress key={scenario} roster={scenario === 'empty' ? [] : roster} entries={entries} available={scenario !== 'unavailable'} entriesOpen={scenario !== 'closed'} /><h2 className="competition-submitted-heading">Inskickade grenval</h2><div className="competition-swimmer-picker">{roster.filter(p => entries.some(e => e.profile_id === p.id && e.status === 'submitted')).map(p => <button key={p.id} type="button"><span className="competition-picker-name">{p.emoji} {p.name}</span><small>1 gren</small></button>)}</div></section></main>
}
const params = new URLSearchParams(window.location.search)
createRoot(document.getElementById('root')).render(params.get('viewport') === 'mobile' ? <iframe title="Grenanmälan i mobilbredd, fiktivt demo" src={`/competition-entries-qa.html?scenario=${encodeURIComponent(params.get('scenario') || 'progress')}`} style={{ width: 390, maxWidth: '100%', height: 1100, border: 0 }} /> : params.get('scenario') === 'filters' ? <FilterPreview /> : <Preview />)
