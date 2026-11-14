const dateActive = (goal, asOf) => goal.startDate <= asOf && (!goal.endDate || goal.endDate >= asOf)
const target = (value, minimum = 0) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= minimum
export const goalDateLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' })
export function activeProfileGoals(training, profileId, asOf) {
  const latest = goals => goals.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  return {
    swimGoal: latest((training?.seasonGoals || []).filter(goal => goal.profileId === profileId && goal.active !== false && dateActive(goal, asOf))),
    crossGoal: latest((training?.crossGoals || []).filter(goal => goal.profileId === profileId && dateActive(goal, asOf))),
  }
}
export function profileTrainingGoals(training, profileId, asOf, status = training ? 'ready' : 'loading') {
  const { swimGoal, crossGoal } = activeProfileGoals(training, profileId, asOf)
  return [
    { key: 'swim', icon: '🏊', label: 'Simning', field: 'target', minimum: 1, current: swimGoal, goals: training?.seasonGoals || [] },
    { key: 'dryland', icon: '🤸', label: 'Landträning', field: 'drylandTarget', minimum: 0, current: crossGoal, goals: training?.crossGoals || [] },
    { key: 'strength', icon: '🏋️', label: 'Styrka', field: 'strengthTarget', minimum: 0, current: crossGoal, goals: training?.crossGoals || [] },
  ].map(({ field, minimum, current, goals, ...item }) => {
    const future = goals.filter(goal => goal.profileId === profileId && goal.active !== false && goal.startDate > asOf && (!goal.endDate || goal.endDate >= goal.startDate) && target(goal[field], minimum)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    const currentTarget = target(current?.[field], minimum) ? Number(current[field]) : null
    const pendingTarget = future ? Number(future[field]) : null
    const state = status !== 'ready' ? 'unknown' : currentTarget !== null ? 'active' : future ? 'scheduled' : 'missing'
    return { ...item, state, target: status === 'ready' ? currentTarget : null, pendingTarget: status === 'ready' ? pendingTarget : null, startsOn: status === 'ready' ? future?.startDate || null : null }
  })
}
export function trainingGoalValues(goals, draft = {}) {
  return Object.fromEntries(goals.map(goal => [goal.key, draft[goal.key] ?? (goal.key === 'swim' ? goal.target : goal.pendingTarget ?? goal.target) ?? '']))
}
export function swimmerProfileSetup(profile, training, asOf, status = training ? 'ready' : 'loading') {
  const goals = profileTrainingGoals(training, profile.id, asOf, status)
  const checks = [
    { key: 'tempus', label: 'Tempus-ID', complete: Boolean(String(profile.tempusId || '').trim()) },
    { key: 'stroke', label: 'specialinriktning', complete: Boolean(String(profile.primaryStroke || profile.secondaryStroke || '').trim()) },
    { key: 'goals', label: 'aktuella veckomål', complete: status !== 'ready' ? null : goals.every(goal => goal.state === 'active') },
    { key: 'group', label: 'träningsgrupp', complete: Boolean(String(profile.trainingGroup || '').trim()) },
  ]
  const missing = checks.filter(check => check.complete === false && check.key !== 'goals').map(check => check.label)
  missing.push(...goals.filter(goal => goal.state === 'missing').map(goal => `veckomål för ${goal.label.toLocaleLowerCase('sv-SE')}`))
  const scheduled = goals.filter(goal => goal.startsOn).map(goal => `${goal.label}: ${goal.pendingTarget} pass/vecka från ${goalDateLabel(goal.startsOn)}${goal.state === 'active' ? ` (nu ${goal.target})` : ' (inget aktivt mål idag)'}`)
  const unknown = checks.some(check => check.complete === null), completeCount = checks.filter(check => check.complete === true).length
  const informational = !unknown && missing.length === 0 && scheduled.length > 0
  const symbol = unknown ? '…' : informational ? 'i' : '?'
  const heading = unknown ? 'Profilinställningar kontrolleras' : informational ? 'Sparade mål – kommande startdatum' : `${completeCount}/4 inställningsområden klara för idag`
  const color = unknown ? 'gray' : completeCount >= 3 ? 'gray' : completeCount === 2 ? 'green' : completeCount === 1 ? 'yellow' : 'red'
  const title = unknown ? status === 'error' ? 'Träningsmålen kunde inte kontrolleras – inte samma sak som att de saknas.' : 'Kontrollerar profilinställningar och träningsmål…' : `${informational ? `${heading}. Ingen komplettering behövs.` : `${completeCount} av 4 inställningsområden klara för idag.`}${missing.length ? ` Saknas: ${missing.join(', ')}.` : ''}${scheduled.length ? ` Planerat: ${scheduled.join('; ')}.` : ''}`
  return { checks, missing, scheduled, unknown, informational, symbol, heading, completeCount, color, title, show: unknown || missing.length > 0 }
}
