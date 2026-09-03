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
    createdAt: profile.created_at,
  }
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
  const profileResult = await supabaseRequest(`profiles?id=eq.${session.profile_id}&active=eq.true&select=*&limit=1`)
  if (!profileResult.ok) throw new Error(`Profile lookup failed: ${profileResult.status}`)
  const [profile] = await profileResult.json()
  return profile || null
}

export async function deleteCurrentSession(request) {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return
  await supabaseRequest(`profile_sessions?token_hash=eq.${hashToken(token)}`, { method: 'DELETE' })
}
