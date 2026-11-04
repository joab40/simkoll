import { supabaseRequest } from './supabase.js'
import { driveFolderId, normalizeDriveSettings } from '../shared/drive-settings.js'

const DEFAULT_DRIVE_FOLDER_ID = '10yTsKP2-Z4a1oNafx76MyyybkOzydBO1'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const fail = (message, status = 503) => { throw Object.assign(new Error(message), { status }) }
export const driveApiKey = () => String(process.env.GOOGLE_DRIVE_API_KEY || '').trim()
export async function loadDriveConfig(db = supabaseRequest) {
  let response
  try { response = await db('app_settings?setting_key=eq.google_drive&select=setting_value&limit=1') } catch { fail('Drive-inställningen kunde inte hämtas. Försök igen.') }
  if (!response.ok) fail('Drive-inställningen kunde inte hämtas. Försök igen.')
  const value = (await response.json())[0]?.setting_value || {}
  const settings = normalizeDriveSettings(value)
  const environmentFolder = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim()
  const workoutId = settings.workoutFolderId || driveFolderId(environmentFolder || DEFAULT_DRIVE_FOLDER_ID)
  return { settings, apiKeyConfigured: Boolean(driveApiKey()), environmentFolderConfigured: Boolean(environmentFolder), fallbackWorkoutFolder: { id: driveFolderId(environmentFolder || DEFAULT_DRIVE_FOLDER_ID), source: environmentFolder ? 'environment' : 'default' }, folders: {
    workout: { id: workoutId, source: settings.workoutFolderId ? 'saved' : environmentFolder ? 'environment' : 'default' },
    planning: { id: settings.useWorkoutFolder ? workoutId : settings.planningFolderId, source: settings.useWorkoutFolder ? 'workout' : 'saved' },
  } }
}
async function googleGet(path, params, fetcher = fetch) {
  if (!driveApiKey()) fail('GOOGLE_DRIVE_API_KEY saknas i serverns miljövariabler.')
  let response
  try {
    response = await fetcher(`https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams({ ...params, key: driveApiKey() })}`, { signal: AbortSignal.timeout(15000) })
  } catch { fail('Google Drive svarade inte i tid eller kunde inte nås. Försök igen.') }
  if (!response.ok) fail(response.status === 404 ? 'Mappen eller filen hittades inte, eller är inte delad så att Simkoll kan läsa den.' : `Google Drive nekade åtkomst (HTTP ${response.status}). Kontrollera API-nyckeln, Drive API och mappens delning.`)
  try { return await response.json() } catch { fail('Google Drive lämnade ett oläsbart svar. Försök igen.') }
}
export async function verifyDriveFolder(folder, fetcher = fetch) {
  const id = driveFolderId(folder)
  const metadata = await googleGet(`files/${id}`, { fields: 'id,name,mimeType,trashed', supportsAllDrives: 'true' }, fetcher)
  if (metadata.mimeType !== FOLDER_TYPE || metadata.trashed === true || metadata.id !== id) fail('Länken pekar inte på en tillgänglig Drive-mapp.', 400)
  const listed = await googleGet('files', { q: `'${id}' in parents and trashed = false`, pageSize: '1', fields: 'files(id),nextPageToken', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }, fetcher)
  if (!Array.isArray(listed.files)) fail('Mappens innehåll kunde inte kontrolleras. Försök igen.')
  return { id, name: String(metadata.name || id), hasItems: listed.files.length > 0, checkedAt: new Date().toISOString() }
}
export async function listDriveFolder(folder, fetcher = fetch) {
  const id = driveFolderId(folder)
  const payload = await googleGet('files', { q: `'${id}' in parents and trashed = false`, pageSize: '100', orderBy: 'folder,name', fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }, fetcher)
  if (!Array.isArray(payload.files)) fail('Google Drive lämnade en oläsbar fillista.')
  return { folderId: id, hasMore: Boolean(payload.nextPageToken), items: payload.files.map(item => ({ id: item.id, name: item.name, mimeType: item.mimeType, modifiedTime: item.modifiedTime || null, size: item.size ? Number(item.size) : null, webViewLink: item.webViewLink || null, folder: item.mimeType === FOLDER_TYPE })).sort((a, b) => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1
    return (Date.parse(b.modifiedTime || '') || 0) - (Date.parse(a.modifiedTime || '') || 0) || a.name.localeCompare(b.name, 'sv')
  }) }
}
export async function saveDriveSettings(input, db = supabaseRequest, fetcher = fetch) {
  const settings = normalizeDriveSettings(input)
  const fallback = String(process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID).trim()
  const workoutId = settings.workoutFolderId || driveFolderId(fallback)
  // Verify again at save time; a green test on a previous value is not proof.
  const workout = await verifyDriveFolder(workoutId, fetcher)
  const planning = settings.useWorkoutFolder || settings.planningFolderId === workoutId ? workout : await verifyDriveFolder(settings.planningFolderId, fetcher)
  const response = await db('app_settings?on_conflict=setting_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ setting_key: 'google_drive', setting_value: settings, updated_at: new Date().toISOString() }) })
  if (!response.ok) fail('Mapparna nås, men inställningen kunde inte sparas. Försök igen.')
  return { saved: true, settings, verified: { workout, planning } }
}
