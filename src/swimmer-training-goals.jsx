import React from 'react'
import { goalDateLabel, trainingGoalValues } from '../shared/swimmer-profile-setup.js'

export default function SwimmerTrainingGoals({ goals, sessions, draft, status, onChange, onSave }) {
  const values = trainingGoalValues(goals, draft), unknown = goals.some(goal => goal.state === 'unknown')
  return <section className="swimmer-training-goals">
    <p className="eyebrow">Simning, landträning och styrka</p>
    <div>{goals.map(goal => {
      const completed = sessions.filter(session => session.type === goal.key).length
      return <div key={goal.key}><span aria-hidden="true">{goal.icon}</span><p>
        <strong>{goal.target === 0 ? `${goal.label} · ${completed} genomförda · mål 0` : goal.target !== null ? `${completed} av ${goal.target} ${goal.label.toLowerCase()}` : goal.label}</strong>
        {goal.target > 0 && <i><b style={{ width: `${Math.min(100, Math.round(completed / goal.target * 100))}%` }} /></i>}
        {goal.state === 'missing' && <small>Mål saknas · {completed} genomförda</small>}
        {goal.state === 'scheduled' && <small>Inget aktivt mål idag · {completed} genomförda</small>}
        {goal.state === 'unknown' && <small>Målen kunde inte kontrolleras ännu</small>}
        {goal.startsOn && <small>{goal.pendingTarget} pass/vecka från {goalDateLabel(goal.startsOn)}</small>}
      </p></div>
    })}</div>
    <details className="swimmer-goal-edit"><summary>Ändra överenskomna mål</summary>
      <form onSubmit={event => { event.preventDefault(); onSave() }}>
        {goals.map(goal => <label key={goal.key}>{goal.key === 'swim' ? 'Simning / vecka · från idag' : `${goal.key === 'dryland' ? 'Land' : 'Styrka'} / vecka · från nästa måndag`}<input type="number" min={goal.key === 'swim' ? 1 : 0} max={goal.key === 'swim' ? 14 : 7} required disabled={unknown} value={values[goal.key]} placeholder="Ange mål" onChange={event => onChange(goal.key, event.target.value)} /></label>)}
        <button type="submit" disabled={unknown || status === 'Sparar…'}>Spara mål</button>
        {status && <small role="status">{status}</small>}
      </form>
      <small>Ändras efter dialog med simmaren. Simning gäller från idag. Land och styrka sparas från nästa måndag; befintliga mål gäller tills dess. 0 är ett giltigt mål för land och styrka.</small>
    </details>
  </section>
}
