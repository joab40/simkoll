// Copy drafts for display only. Never add IDs from published workouts or mutate
// import selections; the editor remains the only owner of the draft.
export function workbookPreviewWorkouts(sheets, { date, timeOfDay, targetGroups }) {
  return sheets.filter((sheet) => sheet.selected).map((sheet) => ({
    ...sheet.draft, id: `preview-${sheet.key}`, date, timeOfDay,
    targetGroups: [...(targetGroups || [])],
  }))
}

export function workoutPreviewContext(date, timeOfDay) {
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  const day = validDate ? new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Datum inte valt'
  const slot = { morning: 'Morgon', afternoon: 'Eftermiddag / kväll' }[timeOfDay]
  return [day, slot].filter(Boolean).join(' · ')
}
