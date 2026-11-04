export function driveFolderId(value, optional = false) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text && optional) return ''
  if (/^[a-zA-Z0-9_-]{8,160}$/.test(text)) return text
  try {
    const url = new URL(text)
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com') {
      const id = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/)?.[1]
      if (id && /^[a-zA-Z0-9_-]{8,160}$/.test(id)) return id
    }
  } catch {}
  throw Object.assign(new Error('Ange en Google Drive-mapplänk eller ett mapp-ID, inte en fil eller vanlig sökväg.'), { status: 400 })
}
export function normalizeDriveSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Ogiltig Drive-inställning.'), { status: 400 })
  return { workoutFolderId: driveFolderId(value.workoutFolderId, true), useWorkoutFolder: value.useWorkoutFolder !== false, planningFolderId: value.useWorkoutFolder !== false ? '' : driveFolderId(value.planningFolderId) }
}
