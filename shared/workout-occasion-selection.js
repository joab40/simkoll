export const occasionChoiceKey = choice => choice.targetWorkoutId ? `workout:${choice.targetWorkoutId}` : choice.targetPlanId ? `plan:${choice.targetPlanId}` : `calendar:${choice.targetCalendarKey}`
export const occasionSelectionKey = form => form.alternativeToWorkoutId ? `workout:${form.alternativeToWorkoutId}` : form.alternativeToPlanId ? `plan:${form.alternativeToPlanId}` : form.alternativeToCalendarKey ? `calendar:${form.alternativeToCalendarKey}` : ''
export const hasOccasionTarget = form => [form.alternativeToWorkoutId, form.alternativeToPlanId, form.alternativeToCalendarKey].filter(Boolean).length === 1
export const compatibleOccasionChoices = (choices, form) => choices.filter(choice => !form.targetGroups?.length || !choice.targetGroups?.length || choice.targetGroups.some(group => form.targetGroups.includes(group)))
export const occasionValidationKey = form => JSON.stringify([form.date, form.occasionMode, occasionSelectionKey(form), [...(form.targetGroups || [])].sort()])
export const validOccasionSelection = (form, choices) => form.occasionMode === 'new' || form.occasionMode === 'keep' || (form.occasionMode === 'existing' && hasOccasionTarget(form) && compatibleOccasionChoices(choices, form).some(choice => occasionChoiceKey(choice) === occasionSelectionKey(form)))
export const clearOccasionTarget = { alternativeToWorkoutId: '', alternativeToPlanId: '', alternativeToCalendarKey: '', requiresTimeOfDay: false }
export function occasionChoiceUpdate(choice, form) {
  if (!choice) return { ...clearOccasionTarget }
  const timeOfDay = ['morning', 'afternoon'].includes(choice.timeOfDay) ? choice.timeOfDay : ''
  return { ...clearOccasionTarget, alternativeToWorkoutId: choice.targetWorkoutId || '', alternativeToPlanId: choice.targetPlanId || '', alternativeToCalendarKey: choice.targetCalendarKey || '', timeOfDay, requiresTimeOfDay: !timeOfDay, targetGroups: choice.targetGroups?.length ? choice.targetGroups : form.targetGroups }
}
export function defaultOccasionUpdate(choices, form) {
  const compatible = compatibleOccasionChoices(choices, form)
  return compatible.length ? { occasionMode: 'existing', ...(compatible.length === 1 ? occasionChoiceUpdate(compatible[0], form) : clearOccasionTarget) } : { occasionMode: 'new', ...clearOccasionTarget }
}
