import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { supabaseRequest, supabaseStorageRequest, supabaseStorageUrl } from './supabase.js'
import { decodeExerciseImage } from './strength-images.js'
import { removeUnattachedGoalImage, saveGoalImage } from './goal-support.js'
import { GOAL_VIDEO_MAX_BYTES, inspectGoalVideo } from '../shared/goal-video.js'

const bucket = 'goal-analysis-videos'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (message, status = 422) => Object.assign(new Error(message), { status })
const storage = (deps) => deps.storage || supabaseStorageRequest
const db = (deps) => deps.db || supabaseRequest
const secret = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const sign = (payload) => createHmac('sha256', secret()).update(`goal-video-v1:${payload}`).digest('base64url')
const fieldsCleared = { video_path: null, video_poster_path: null, video_duration_ms: null, video_bytes: null, video_codec: null }
const validGoal = (goal) => goal && uuid.test(goal.id) && uuid.test(goal.profile_id)
const removeImage = (path, deps) => (deps.removeImage || removeUnattachedGoalImage)(path)
const ownsPath = (goal, path) => validGoal(goal) && typeof path === 'string' && path.startsWith(`${goal.profile_id}/${goal.id}/`) && /^[a-f0-9/-]+\.(mp4|jpg)$/.test(path)

async function removePaths(paths, deps) {
  if (!paths.length) return
  const result = await storage(deps)(`object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) })
  if (!result.ok) throw new Error('Videofilerna kunde inte tas bort från lagringen.')
}

export async function cleanupGoalVideo(goal, deps = {}) {
  if (!validGoal(goal)) return
  await removePaths([goal.video_path, goal.video_poster_path].filter((path) => ownsPath(goal, path)), deps)
  if (deps.includeIncoming) {
    for (const prefix of [`${goal.profile_id}/${goal.id}/incoming`, `${goal.profile_id}/${goal.id}`]) {
      const result = await storage(deps)(`object/list/${bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000 }) })
      if (result.ok) await removePaths((await result.json()).filter((row) => /^[a-f0-9-]{36}\.(mp4|jpg)$/.test(row.name)).map((row) => `${prefix}/${row.name}`), deps)
    }
  }
}

async function cleanupIncoming(goal, deps) {
  for (const prefix of [`${goal.profile_id}/${goal.id}/incoming`, `${goal.profile_id}/${goal.id}`]) {
    const result = await storage(deps)(`object/list/${bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, sortBy: { column: 'created_at', order: 'asc' } }) })
    if (!result.ok) continue
    const rows = await result.json(), cutoff = Date.now() - 86400000
    const paths = rows.filter((row) => /^[a-f0-9-]{36}\.(mp4|jpg)$/.test(row.name) && Date.parse(row.created_at) < cutoff).map((row) => `${prefix}/${row.name}`).filter((path) => path !== goal.video_path && path !== goal.video_poster_path)
    await removePaths(paths, deps)
  }
}

export async function beginGoalVideo(goal, body, deps = {}) {
  if (!validGoal(goal)) throw fail('Utvecklingsmålet kunde inte hittas.', 404)
  if (!Number.isInteger(body.bytes) || body.bytes <= 0 || body.bytes > GOAL_VIDEO_MAX_BYTES) throw fail('Videon får vara högst 25 MB.')
  const [schema, setup] = await Promise.all([db(deps)('development_goals?select=video_path&limit=0'), storage(deps)(`bucket/${bucket}`)])
  if (!schema.ok || !setup.ok) throw fail('Videolagringen behöver databasuppdatering 109_development_goal_video.', 503)
  const config = await setup.json()
  if (config.public !== false || config.file_size_limit !== GOAL_VIDEO_MAX_BYTES) throw fail('Videolagringen behöver databasuppdatering 109_development_goal_video.', 503)
  await cleanupIncoming(goal, deps).catch(() => {})
  const path = `${goal.profile_id}/${goal.id}/incoming/${randomUUID()}.mp4`
  const result = await storage(deps)(`object/upload/sign/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' }, body: '{}' })
  if (!result.ok) throw fail('Uppladdningen kunde inte startas. Försök igen.', 502)
  const data = await result.json()
  const url = new URL(supabaseStorageUrl(data.url))
  const expected = new URL(supabaseStorageUrl(`/object/upload/sign/${bucket}/${path}`))
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || !url.searchParams.get('token')) throw fail('Uppladdningslänken kunde inte verifieras.', 502)
  const payload = Buffer.from(JSON.stringify({ goalId: goal.id, owner: goal.profile_id, path, bytes: body.bytes, version: goal.updated_at, expires: Date.now() + 15 * 60000 })).toString('base64url')
  return { uploadUrl: url.toString(), ticket: `${payload}.${sign(payload)}` }
}

function readTicket(goal, ticket) {
  if (typeof ticket !== 'string' || ticket.length > 3000) throw fail('Uppladdningen är ogiltig. Välj filen igen.')
  const [encoded, signature, extra] = ticket.split('.')
  const expected = Buffer.from(sign(encoded || '')), actual = Buffer.from(signature || '')
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw fail('Uppladdningen är ogiltig. Välj filen igen.')
  let data
  try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) } catch { throw fail('Uppladdningen är ogiltig.') }
  if (data.goalId !== goal.id || data.owner !== goal.profile_id || !data.path?.startsWith(`${goal.profile_id}/${goal.id}/incoming/`) || !/^[a-f0-9/-]+\/incoming\/[a-f0-9-]{36}\.mp4$/.test(data.path)) throw fail('Uppladdningen hör inte till det här målet.')
  if (!Number.isFinite(data.expires) || data.expires < Date.now()) throw fail('Uppladdningen har gått ut. Välj filen igen.')
  if (data.version !== goal.updated_at) throw fail('Målet ändrades under uppladdningen. Öppna målet igen och försök på nytt.', 409)
  return data
}

export async function cancelGoalVideo(goal, body, deps = {}) {
  if (!validGoal(goal)) throw fail('Utvecklingsmålet kunde inte hittas.', 404)
  const ticket = readTicket(goal, body.ticket)
  await removePaths([ticket.path], deps)
  return { ok: true }
}

async function readBounded(response) {
  if (Number(response.headers?.get('content-length')) > GOAL_VIDEO_MAX_BYTES) throw fail('Videon får vara högst 25 MB.')
  if (!response.body?.getReader) throw fail('Videofilen kunde inte läsas. Ladda upp den på nytt.')
  const reader = response.body.getReader(), parts = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > GOAL_VIDEO_MAX_BYTES) { await reader.cancel(); throw fail('Videon får vara högst 25 MB.') }
      parts.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(parts, length)
}

async function updateAttachment(goal, fields, deps) {
  const result = await db(deps)(`development_goals?id=eq.${goal.id}&profile_id=eq.${goal.profile_id}&updated_at=eq.${encodeURIComponent(goal.updated_at)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }) })
  if (!result.ok) throw fail('Bilagan kunde inte sparas. Öppna målet igen och kontrollera innan du försöker på nytt.', 502)
  const [saved] = await result.json()
  if (!saved) throw fail('Målet har ändrats av någon annan. Öppna det igen och försök på nytt.', 409)
  return saved
}

export async function finishGoalVideo(goal, body, deps = {}) {
  if (!validGoal(goal)) throw fail('Utvecklingsmålet kunde inte hittas.', 404)
  const ticket = readTicket(goal, body.ticket)
  let poster
  if (body.posterData) {
    poster = decodeExerciseImage(body.posterData)
    if (poster.mime !== 'image/jpeg' || poster.bytes.length > 200000) throw fail('Förhandsbilden får vara högst 200 kB och i JPG-format.')
  }
  const incoming = await storage(deps)(`object/${bucket}/${ticket.path}`, { signal: AbortSignal.timeout(45000) })
  if (!incoming.ok) throw fail('Videon saknas i lagringen. Ladda upp den igen.', 502)
  const bytes = await readBounded(incoming)
  if (bytes.length !== ticket.bytes) throw fail('Videons storlek stämmer inte med uppladdningen. Välj filen igen.')
  const info = inspectGoalVideo(bytes), id = randomUUID()
  // Upload tokens remain valid after validation. Never link their mutable path:
  // write exactly the inspected bytes to a different, server-only object.
  const path = `${goal.profile_id}/${goal.id}/${id}.mp4`, posterPath = poster ? `${goal.profile_id}/${goal.id}/${id}.jpg` : null
  const uploaded = await storage(deps)(`object/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'false' }, body: bytes })
  if (!uploaded.ok) throw fail('Videon kunde inte sparas. Din tidigare bilaga finns kvar.', 502)
  if (poster) {
    const savedPoster = await storage(deps)(`object/${bucket}/${posterPath}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: poster.bytes })
    if (!savedPoster.ok) { await removePaths([path], deps).catch(() => {}); throw fail('Förhandsbilden kunde inte sparas. Din tidigare bilaga finns kvar.', 502) }
  }
  // On transport uncertainty, retain the immutable new object: the PATCH may
  // have committed. Only a confirmed conflict is safe for immediate cleanup.
  let saved
  try { saved = await updateAttachment(goal, { image_path: null, video_path: path, video_poster_path: posterPath, video_duration_ms: info.durationMs, video_bytes: bytes.length, video_codec: info.codec }, deps) }
  catch (error) { if (error.status === 409) await removePaths([path, posterPath].filter(Boolean), deps).catch(() => {}); throw error }
  await removePaths([ticket.path], deps).catch(() => {})
  await cleanupGoalVideo(goal, deps).catch(() => {})
  if (goal.image_path) await removeImage(goal.image_path, deps).catch(() => {})
  return saved
}

export async function replaceGoalImage(goal, body, deps = {}) {
  if (!validGoal(goal)) throw fail('Utvecklingsmålet kunde inte hittas.', 404)
  if (body.expectedUpdatedAt !== goal.updated_at) throw fail('Målet har ändrats. Öppna det igen innan du byter bilaga.', 409)
  const path = await (deps.saveImage || saveGoalImage)(goal.profile_id, body.imageData)
  let saved
  try { saved = await updateAttachment(goal, { ...fieldsCleared, image_path: path }, deps) }
  catch (error) { if (error.status === 409) await removeImage(path, deps).catch(() => {}); throw error }
  await cleanupGoalVideo(goal, deps).catch(() => {})
  if (goal.image_path) await removeImage(goal.image_path, deps).catch(() => {})
  return saved
}

export async function clearGoalMedia(goal, body, deps = {}) {
  if (!validGoal(goal)) throw fail('Utvecklingsmålet kunde inte hittas.', 404)
  if (body.expectedUpdatedAt !== goal.updated_at) throw fail('Målet har ändrats. Öppna det igen innan du tar bort bilagan.', 409)
  const saved = await updateAttachment(goal, { ...fieldsCleared, image_path: null }, deps)
  await cleanupGoalVideo(goal, deps).catch(() => {})
  if (goal.image_path) await removeImage(goal.image_path, deps).catch(() => {})
  return saved
}

export async function signedGoalVideo(goal, poster = false, deps = {}) {
  const path = poster ? goal.video_poster_path : goal.video_path
  if (!ownsPath(goal, path) || (poster ? !path.endsWith('.jpg') : !path.endsWith('.mp4'))) return null
  const result = await storage(deps)(`object/sign/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 1800 }) })
  if (!result.ok) return null
  const data = await result.json(), url = data.signedURL || data.signedUrl
  return url ? supabaseStorageUrl(url) : null
}
