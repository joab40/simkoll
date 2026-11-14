const dateActive = (goal, asOf) => goal.startDate <= asOf && (!goal.endDate || goal.endDate >= asOf)
const target = (value, minimum = 0) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= minimum
export function activeProfileGoals(training, profileId, asOf) {
  const latest = goals => goals.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  return {
    swimGoal: latest((training?.seasonGoals || []).filter(goal => goal.profileId === profileId && goal.active !== false && dateActive(goal, asOf))),
    crossGoal: latest((training?.crossGoals || []).filter(goal => goal.profileId === profileId && dateActive(goal, asOf))),
  }
}
export function swimmerProfileSetup(profile, training, asOf, status = training ? 'ready' : 'loading') {
  const { swimGoal, crossGoal } = activeProfileGoals(training, profile.id, asOf)
  const checks = [
    { key: 'tempus', label: 'Tempus-ID', complete: Boolean(String(profile.tempusId || '').trim()) },
    { key: 'stroke', label: 'specialinriktning', complete: Boolean(String(profile.primaryStroke || profile.secondaryStroke || '').trim()) },
    { key: 'goals', label: 'aktuella mål för simning, landträning och styrka', complete: status !== 'ready' ? null : target(swimGoal?.target, 1) && target(crossGoal?.drylandTarget) && target(crossGoal?.strengthTarget) },
    { key: 'group', label: 'träningsgrupp', complete: Boolean(String(profile.trainingGroup || '').trim()) },
  ]
  const missing = checks.filter(check => check.complete === false).map(check => check.label)
  const unknown = checks.some(check => check.complete === null), completeCount = checks.filter(check => check.complete === true).length
  const color = unknown ? 'gray' : completeCount >= 3 ? 'gray' : completeCount === 2 ? 'green' : completeCount === 1 ? 'yellow' : 'red'
  const title = unknown ? status === 'error' ? 'Träningsmålen kunde inte kontrolleras – inte samma sak som att de saknas.' : 'Kontrollerar profilinställningar och träningsmål…' : missing.length ? `${completeCount} av 4 profilinställningar klara. Saknas: ${missing.join(', ')}.` : 'Profilinställningar kompletta'
  return { checks, missing, unknown, completeCount, color, title, show: unknown || missing.length > 0 }
}
