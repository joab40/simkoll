import React, { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import TaperKollenCard from './taper-kollen.jsx'
import { buildFormKollen } from '../shared/form-kollen.js'
import { normalizeTaperGoal } from '../shared/taper-kollen.js'
import { SWIMMER_ASSISTANT_CATEGORIES } from '../shared/swimmer-assistant.js'
import './styles.css'

const profile = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Demo-simmaren', emoji: '🐬', aiAnalysisStatus: 'approved' }
const competitions = [{ id: '22222222-2222-4222-8222-222222222222', title: 'Ungdoms-SM (demo)', startDate: '2027-01-15', endDate: '2027-01-17' }, { id: '33333333-3333-4333-8333-333333333333', title: 'Senior-SM (demo)', startDate: '2027-01-08', endDate: '2027-01-10' }]
const targets = competitions.map((competition, index) => ({ competitionId: competition.id, title: competition.title, competitionStart: competition.startDate, competitionEnd: competition.endDate, targetDate: competition.startDate, priority: index ? 'B' : 'A', taperStart: index ? null : '2027-01-01', events: '100 och 200 frisim', note: '', enabled: true }))
function Preview() {
  const goals = useRef(targets), calls = useRef([]), [illness, setIllness] = useState(false), [role, setRole] = useState('head_coach'), [revision, setRevision] = useState(0)
  const request = useCallback(async (url, _code, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.current.push(body?.action || url); document.getElementById('taper-qa-calls').textContent = calls.current.join(' · ')
    await new Promise(resolve => setTimeout(resolve, 100))
    if (url.startsWith('/api/training') && !body) return { profileId: profile.id, asOf: '2027-01-02', goals: goals.current, competitions, form: buildFormKollen({ responses: ['2026-12-31', '2027-01-01', '2027-01-02'].map((date, index) => ({ id: String(index), date, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: 2.5, feeling: 4, speedFeeling: 5, rpe: 5, activityMinutes: 60 })), sleep: [], illness: [{ activity_date: '2027-01-02', status: illness ? 'mild' : 'none' }] }, '2027-01-02') }
    if (body?.action === 'save-taper-goal') {
      const competition = competitions.find(item => item.id === body.goal.competitionId)
      const goal = normalizeTaperGoal(body.goal, { id: competition.id, title: competition.title, start_date: competition.startDate, end_date: competition.endDate })
      goals.current = [...goals.current.filter(item => item.competitionId !== goal.competitionId), goal]
      return { goal }
    }
    if (body?.action === 'swimmer-assistant-preview') {
      const sources = body.categories.includes('taper') ? goals.current.filter(goal => goal.enabled).map((goal, index) => ({ id: `S${index + 1}`, category: 'taper', label: 'Fiktivt måltävlingsunderlag', date: goal.targetDate, data: { priority: goal.priority, title: goal.title, targetDate: goal.targetDate } })) : []
      return { model: 'Fiktiv modell – inget externt anrop', expiresInMinutes: 30, token: 'demo-only', requestEnvelopeBytes: 100, context: { sources, daily: [], selection: { start: '2026-10-05', end: '2027-01-02' }, warnings: ['Fiktiv UI-demo. Inget skickas till OpenAI.'], limitations: ['Testdata, inte en verklig bedömning.'], categories: body.categories.map(key => ({ key, label: SWIMMER_ASSISTANT_CATEGORIES.find(item => item.key === key).label, records: sources.filter(source => source.category === key).length })) } }
    }
    if (body?.action === 'swimmer-assistant-chat') return { model: 'Fiktiv modell', reply: { answer: { text: 'Fiktivt svar: diskutera den rapporterade kroppkänslan och tävlingsprioriteringen innan ni justerar planen.', sourceIds: ['S1'] }, observations: [], interpretations: [], limitations: ['Ingen riktig språkmodell har anropats.'] }, history: [], historySignature: 'demo-only' }
    throw new Error('QA blockerar okända API-anrop.')
  }, [illness])
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}><h1 style={{ fontSize: 22 }}>Fiktiv Toppningskoll</h1><p>Inga databasändringar eller externa AI-anrop.</p><details><summary>Testkontroller</summary><label><input type="checkbox" checked={illness} onChange={event => { setIllness(event.target.checked); setRevision(value => value + 1) }} /> Lägg till sjukdomskänning</label><label>Roll<select value={role} onChange={event => setRole(event.target.value)}><option value="head_coach">Huvudtränare</option><option value="coach">Tränare utan AI-dialog</option></select></label><p id="taper-qa-calls" /></details><TaperKollenCard key={`${role}:${revision}`} profile={profile} code="demo-only" accountRole={role} aiEnabled request={request} /></main>
}
createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile' ? <iframe title="Toppningskollen i mobilbredd · fiktivt demo" src="/taper-kollen-qa.html" style={{ width: 390, maxWidth: '100%', height: 1100, border: 0 }} /> : <Preview />)
