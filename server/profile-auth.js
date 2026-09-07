import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { supabaseRequest } from './supabase.js'

const scrypt = promisify(scryptCallback)
const SESSION_COOKIE = 'simkoll_session'

export const normalizeUsername = (value = '') => value.trim().toLowerCase()
export const validUsername = (value) => /^[a-z0-9._-]{3,24}$/.test(value)
export const validPin = (value) => /^\d{4}$/.test(value)
export const hashToken = (value) => createHash('sha256').update(value).digest('hex')

export async function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(pin, salt, 64)
  return { hash: Buffer.from(derived).toString('hex'), salt }
}

export async function verifyPin(pin, salt, expectedHash) {
  const { hash } = await hashPin(pin, salt)
  const actual = Buffer.from(hash, 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function publicProfile(profile) {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    emoji: profile.emoji,
    approvalStatus: profile.approval_status || 'approved',
    createdAt: profile.created_at,
  }
}

export function stockholmDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export async function touchProfileActivity(profileId) {
  const result = await supabaseRequest('profile_daily_activity?on_conflict=profile_id,activity_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ profile_id: profileId, activity_date: stockholmDate(), last_seen_at: new Date().toISOString() }),
  })
  if (!result.ok) throw new Error(`Activity update failed: ${result.status} ${await result.text()}`)
  await awardPoints(profileId, 'daily_active', 1, stockholmDate())
}

export async function awardPoints(profileId, eventType, points, sourceKey) {
  const result = await supabaseRequest('point_events?on_conflict=profile_id,event_type,source_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ profile_id: profileId, event_type: eventType, points, source_key: String(sourceKey) }),
  })
  if (!result.ok) throw new Error(`Points insert failed: ${result.status} ${await result.text()}`)
}

export async function awardArtifact(profileId, artifactKey) {
  const catalog = await supabaseRequest(`artifact_catalog?artifact_key=eq.${artifactKey}&select=id&limit=1`)
  if (!catalog.ok) throw new Error(`Artifact lookup failed: ${catalog.status}`)
  const [artifact] = await catalog.json()
  if (!artifact) return
  const result = await supabaseRequest('profile_artifacts?on_conflict=profile_id,artifact_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ profile_id: profileId, artifact_id: artifact.id, source: 'automatic' }),
  })
  if (!result.ok) throw new Error(`Artifact insert failed: ${result.status}`)
  const inserted = await result.json()
  if (inserted.length) await awardPoints(profileId, 'artifact', 5, artifact.id)
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';')
  const cookie = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null
}

export async function createSession(response, profileId) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const result = await supabaseRequest('profile_sessions', {
    method: 'POST',
    body: JSON.stringify({ profile_id: profileId, token_hash: hashToken(token), expires_at: expires.toISOString() }),
  })
  if (!result.ok) throw new Error(`Session insert failed: ${result.status} ${await result.text()}`)
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`)
}

export function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
}

export async function getSessionProfile(request) {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const sessionResult = await supabaseRequest(`profile_sessions?token_hash=eq.${hashToken(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=profile_id&limit=1`)
  if (!sessionResult.ok) throw new Error(`Session lookup failed: ${sessionResult.status}`)
  const [session] = await sessionResult.json()
  if (!session) return null
  const profileResult = await supabaseRequest(`profiles?id=eq.${session.profile_id}&active=eq.true&approval_status=eq.approved&select=*&limit=1`)
  if (!profileResult.ok) throw new Error(`Profile lookup failed: ${profileResult.status}`)
  const [profile] = await profileResult.json()
  return profile || null
}

export async function deleteCurrentSession(request) {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return
  await supabaseRequest(`profile_sessions?token_hash=eq.${hashToken(token)}`, { method: 'DELETE' })
}
