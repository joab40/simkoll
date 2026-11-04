import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { driveFolderId, normalizeDriveSettings } from '../shared/drive-settings.js'
import { loadDriveConfig, verifyDriveFolder, listDriveFolder, saveDriveSettings } from '../server/drive-settings.js'
import { loadPlanningGroups } from '../server/planning-groups.js'

const workout = 'workout_folder_123', planning = 'planning_folder_456', secret = 'fixture-drive-key-not-for-the-client'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const withKey = async fn => {
  const oldKey = process.env.GOOGLE_DRIVE_API_KEY, oldFolder = process.env.GOOGLE_DRIVE_FOLDER_ID
  process.env.GOOGLE_DRIVE_API_KEY = secret; process.env.GOOGLE_DRIVE_FOLDER_ID = workout
  try { await fn() } finally {
    if (oldKey === undefined) delete process.env.GOOGLE_DRIVE_API_KEY; else process.env.GOOGLE_DRIVE_API_KEY = oldKey
    if (oldFolder === undefined) delete process.env.GOOGLE_DRIVE_FOLDER_ID; else process.env.GOOGLE_DRIVE_FOLDER_ID = oldFolder
  }
}
const reachable = async raw => {
  const url = new URL(raw)
  assert.equal(url.hostname, 'www.googleapis.com')
  assert.equal(url.searchParams.get('key'), secret)
  assert.equal(url.searchParams.get('supportsAllDrives'), 'true')
  const id = url.pathname.split('/').at(-1)
  return id === 'files' ? json({ files: [] }) : json({ id, name: id === workout ? 'Träningspass' : 'Veckoplanering', mimeType: 'application/vnd.google-apps.folder', trashed: false })
}
test('Drive settings accept folder links or IDs but never arbitrary hosts, files or paths', () => {
  assert.equal(driveFolderId(`https://drive.google.com/drive/u/1/folders/${workout}?usp=sharing`), workout)
  assert.equal(driveFolderId(`https://drive.google.com/drive/folders/${workout}`), workout)
  assert.equal(driveFolderId(workout), workout)
  assert.equal(driveFolderId('', true), '')
  for (const value of ['', 'Träning/Planering', `https://drive.google.com.evil.invalid/drive/folders/${workout}`, `https://drive.google.com/file/d/${workout}/view`, `http://drive.google.com/drive/folders/${workout}`, "folder' or trashed=true", 'file:///private/file']) assert.throws(() => driveFolderId(value))
  assert.throws(() => normalizeDriveSettings({ useWorkoutFolder: false, planningFolderId: '' }))
  assert.throws(() => normalizeDriveSettings(null))
})
test('configuration shows only env booleans, preserves legacy root and supports separate planning root', async () => withKey(async () => {
  const initial = await loadDriveConfig(async () => json([]))
  assert.equal(initial.apiKeyConfigured, true); assert.equal(initial.environmentFolderConfigured, true)
  assert.equal(initial.folders.workout.id, workout); assert.equal(initial.folders.planning.id, workout)
  assert.equal(initial.folders.workout.source, 'environment')
  assert.ok(!JSON.stringify(initial).includes(secret))
  const separate = await loadDriveConfig(async () => json([{ setting_value: { workoutFolderId: '', useWorkoutFolder: false, planningFolderId: planning } }]))
  assert.equal(separate.folders.planning.id, planning)
  delete process.env.GOOGLE_DRIVE_API_KEY
  assert.equal((await loadDriveConfig(async () => json([]))).apiKeyConfigured, false)
  await assert.rejects(verifyDriveFolder(workout, reachable), /GOOGLE_DRIVE_API_KEY saknas/)
  await assert.rejects(loadDriveConfig(async () => json({}, 500)), /kunde inte hämtas/)
}))
test('a green folder check requires actual folder metadata AND a readable listing; an empty folder is valid', async () => withKey(async () => {
  const result = await verifyDriveFolder(workout, reachable)
  assert.equal(result.hasItems, false); assert.equal(result.name, 'Träningspass'); assert.ok(result.checkedAt)
  await assert.rejects(verifyDriveFolder(workout, async () => json({ id: workout, name: 'Not a folder', mimeType: 'application/pdf' })), /inte på en tillgänglig Drive-mapp/)
  await assert.rejects(verifyDriveFolder(workout, async raw => raw.includes('/files?') ? json({}, 403) : reachable(raw)), /HTTP 403/)
  await assert.rejects(verifyDriveFolder(workout, async () => json({}, 404)), /inte delad/)
  await assert.rejects(verifyDriveFolder(workout, async () => { throw Error(`Network to https://fixture.invalid?key=${secret}`) }), error => !error.message.includes(secret) && /kunde inte nås/.test(error.message))
}))
test('saving retests both exact new folder values, persists only IDs and never overwrites webapp settings', async () => withKey(async () => {
  const writes = [], checked = []
  const db = async (path, options) => { writes.push({ path, body: JSON.parse(options.body) }); return json({}) }
  const fetcher = async raw => { if (!raw.includes('/files?')) checked.push(new URL(raw).pathname.split('/').at(-1)); return reachable(raw) }
  const result = await saveDriveSettings({ workoutFolderId: `https://drive.google.com/drive/folders/${workout}`, useWorkoutFolder: false, planningFolderId: planning, apiKey: secret }, db, fetcher)
  assert.deepEqual(checked, [workout, planning]); assert.equal(result.saved, true)
  assert.equal(writes.length, 1); assert.equal(writes[0].body.setting_key, 'google_drive')
  assert.deepEqual(writes[0].body.setting_value, { workoutFolderId: workout, planningFolderId: planning, useWorkoutFolder: false })
  assert.ok(!JSON.stringify(writes).includes(secret)); assert.ok(!JSON.stringify(result).includes(secret))
  writes.length = 0
  await assert.rejects(saveDriveSettings({ workoutFolderId: workout, useWorkoutFolder: false, planningFolderId: planning }, db, async raw => raw.includes(`files/${planning}?`) ? json({}, 404) : reachable(raw)))
  assert.equal(writes.length, 0)
  checked.length = 0
  await saveDriveSettings({ workoutFolderId: '', useWorkoutFolder: true }, db, fetcher)
  assert.deepEqual(checked, [workout]) // Clearing custom root verifies the env root, not a previous saved value.
}))
test('folder picker uses the configured root, folders first, and reports truncated listings honestly', async () => withKey(async () => {
  const result = await listDriveFolder(planning, async raw => {
    const url = new URL(raw)
    assert.match(url.searchParams.get('q'), new RegExp(planning))
    assert.equal(url.searchParams.get('includeItemsFromAllDrives'), 'true')
    return json({ nextPageToken: 'more', files: [{ id: 'f', name: 'File', mimeType: 'application/vnd.google-apps.spreadsheet' }, { id: 'd', name: 'Folder', mimeType: 'application/vnd.google-apps.folder' }] })
  })
  assert.equal(result.folderId, planning); assert.equal(result.items[0].folder, true); assert.equal(result.hasMore, true)
}))
test('dynamic group catalog fails closed and does not substitute all default groups', async () => {
  const catalog = await loadPlanningGroups(async () => json([{ id: 'junior_elit', name: 'Junior Elit' }]))
  assert.deepEqual(catalog, { junior_elit: 'Junior Elit' })
  await assert.rejects(loadPlanningGroups(async () => json({}, 500)), /kunde inte hämtas/)
})
test('actual settings and both import entry points are wired to the new configuration', () => {
  const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const form = readFileSync(new URL('../src/planning-import.jsx', import.meta.url), 'utf8')
  assert.match(app, /<SportAdminCalendarSettings code=\{code\} \/><DriveSettings code=\{code\} \/>/)
  assert.match(form, /drive=true&purpose=planning/)
  assert.match(app, /drive=true\$\{folderId/) // workout picker remains the default purpose.
  const settings = readFileSync(new URL('../src/drive-settings.jsx', import.meta.url), 'utf8')
  assert.match(settings, /setVerified\(\{\}\)/)
  assert.match(settings, /config.fallbackWorkoutFolder.id/)
  assert.match(settings, /setForm\(data.settings\); setVerified\(data.verified\); setSaved\(true\)/)
})
