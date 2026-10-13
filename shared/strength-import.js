export const STRENGTH_FILE_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}
export const STRENGTH_FILE_MAX_BYTES = 3_000_000

export function normalizeStrengthDraft(value = {}) {
  value = value || {}
  const text = (value) => typeof value === 'string' ? value.trim() : ''
  return {
    title: text(value.title), description: text(value.description), instructions: text(value.instructions),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(text).filter(Boolean) : [],
    passes: Array.isArray(value.passes) ? value.passes.map((pass) => ({
      title: text(pass?.title), instructions: text(pass?.instructions),
      exercises: Array.isArray(pass?.exercises) ? pass.exercises.map((exercise) => ({
        name: text(exercise?.name), prescription: text(exercise?.prescription),
        instructions: text(exercise?.instructions), source: text(exercise?.source), uncertain: exercise?.uncertain === true,
        imageId: text(exercise?.imageId), imageUrl: text(exercise?.imageUrl), imageSource: text(exercise?.imageSource),
        imageInstructions: text(exercise?.imageInstructions),
      })) : [],
    })) : [],
  }
}

export function draftExerciseImages(draft) {
  return draft.passes.flatMap((pass, passIndex) => pass.exercises.flatMap((exercise, exerciseIndex) => exercise.imageId ? [{ imageId: exercise.imageId, passNumber: passIndex + 1, exerciseIndex, exerciseName: exercise.name, ...(exercise.imageInstructions ? { imageInstructions: exercise.imageInstructions } : {}) }] : []))
}

export function strengthDraftContent(draft) {
  return [draft.instructions, ...draft.passes.map((pass, index) => [
    `Pass ${index + 1} · ${pass.title}`, pass.instructions,
    ...pass.exercises.map((exercise, number) => `${number + 1}. ${exercise.name}${exercise.prescription ? ` — ${exercise.prescription}` : ''}${exercise.instructions ? `\nInstruktion: ${exercise.instructions.replace(/\s*\n\s*/g, ' ')}` : ''}`),
  ].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n')
}

export function validateStrengthDraft(draft) {
  const errors = []
  if (!draft.title || draft.title.length > 100) errors.push('Ange ett programnamn med högst 100 tecken.')
  if (!draft.description || draft.description.length > 1000) errors.push('Ange en beskrivning med högst 1 000 tecken.')
  if (draft.passes.length < 1 || draft.passes.length > 3) errors.push('Ett program kan innehålla 1–3 pass. Dela större program i flera importer.')
  draft.passes.forEach((pass, index) => {
    if (!pass.title || /[\r\n]/.test(pass.title)) errors.push(`Ange en rubrik på en rad för pass ${index + 1}.`)
    if (!pass.exercises.length || pass.exercises.length > 30) errors.push(`Pass ${index + 1} behöver 1–30 övningar.`)
    if (pass.exercises.some((exercise) => !exercise.name || /[\r\n]/.test(exercise.name) || /[\r\n]/.test(exercise.prescription))) errors.push(`Kontrollera övningsnamn och dosering på en rad i pass ${index + 1}.`)
  })
  if (strengthDraftContent(draft).length > 5000) errors.push('Programmet är längre än 5 000 tecken. Korta instruktionerna eller dela programmet.')
  return errors
}
