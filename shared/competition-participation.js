export function competitionIncludesSwimmer(competition, swimmer) {
  const choice = competition.participantOverrides?.[swimmer.id]
  if (typeof choice === 'boolean') return choice
  return swimmer.isTestProfile || !competition.targetGroups?.length || competition.targetGroups.includes(swimmer.trainingGroup)
}
