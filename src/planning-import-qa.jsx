import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PlanningImport from './planning-import.jsx'
import { unresolvedPlanningRows, validatePlanningDraft } from '../shared/planning-import.js'
import './styles.css'

// Local-only fake API. No real file data, credentials or database requests leave this page.
const calls = [], groups = ['junior', 'ungdom_svart']
const session = (date, title) => ({ date, title, activityType: 'swim', timeOfDay: 'afternoon', focus: 'Fart', notes: '', distanceMeters: 2500, durationMinutes: null })
const weeks = ['2026-11-16', '2026-11-23'].map((monday, index) => ({ monday, groups, sourceSheet: 'Demo', sourceRange: 'A1:D10', sessions: index ? [session(monday, 'Fart'), session('2026-11-24', 'Sprint')] : [session(monday, 'Distans')] }))
const calendarChoices = ['2026-11-23', '2026-11-24'].flatMap(date => ['16:00', '18:00'].map(time => ({ key: `${date}-${time}`, date, time, timeOfDay: 'afternoon', title: 'Träning (demo)', groups: ['junior'], location: 'Demobadet', durationMinutes: 90 })))
window.fetch = async (url, options) => {
  if (url !== '/api/workouts') throw new Error('QA blockerar riktiga nätverksanrop.')
  const body = JSON.parse(options.body)
  calls.push(body.action)
  document.getElementById('qa-calls').textContent = calls.join(' · ')
  await new Promise(resolve => setTimeout(resolve, 100))
  let result
  if (body.action === 'planning-import-inspect') result = { fileName: 'Fiktiv planering.xlsx', sheets: [{ name: 'Demo', suggested: true, range: 'A1:D10' }] }
  else if (body.action === 'planning-import-analyze') result = { fileName: 'Fiktiv planering.xlsx', weeks, calendarChoices, existing: [], warnings: [], usedAi: false }
  else if (body.action === 'planning-import-preview') {
    validatePlanningDraft(body.weeks)
    if (unresolvedPlanningRows(body.weeks).length) throw new Error('Kalenderval saknas.')
    if (document.getElementById('qa-fail').checked) return new Response(JSON.stringify({ error: 'Fiktivt granskningsfel. Försök igen.' }), { status: 500 })
    result = { previewToken: 'demo-only', summary: { added: 3, replaced: 0, duplicates: 0, protected: 0 } }
  } else if (body.action === 'planning-import-apply') result = { summary: { weeks: 2, added: 3, replaced: 0 } }
  else throw new Error('Okänd QA-åtgärd.')
  return new Response(JSON.stringify(result), { status: 200 })
}
function Demo() {
  const [saved, setSaved] = useState(false)
  return <main style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}><p>Fiktiv QA · inga riktiga importer eller API-anrop. Använd valfri Excel-fil eller en Drive-länk som demo.</p><label><input id="qa-fail" type="checkbox" /> Simulera granskningsfel</label><p id="qa-calls" role="status" /><PlanningImport code="demo-only" selectedGroups={groups} initialMonday="2026-11-16" onClose={() => {}} onSaved={() => setSaved(true)} />{saved && <p>QA: sparad i minnet.</p>}</main>
}
createRoot(document.getElementById('root')).render(<Demo />)
