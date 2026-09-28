import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { supabaseRequest } from './supabase.js'

const scrypt = promisify(scryptCallback)
const SESSION_TTL_SECONDS = 8 * 60 * 60
const base64url = (value) => Buffer.from(value).toString('base64url')
const sessionSecret = () => process.env.COACH_SESSION_SECRET || process.env.SIMKOLL_COACH_BOOTSTRAP_TOKEN || 'simkoll-change-session-secret'
const sign = (value) => createHmac('sha256', sessionSecret()).update(value).digest('base64url')
const normalizeEmail = (value = '') => String(value).trim().toLowerCase()

export async function hashCoachPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(String(password), salt, 64)
  return { hash: Buffer.from(derived).toString('hex'), salt }
}

export async function verifyCoachPassword(password, salt, expectedHash) {
  const { hash } = await hashCoachPassword(password, salt)
  const actual = Buffer.from(hash, 'hex'), expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function findCoach(email) {
  const result = await supabaseRequest(`coach_accounts?email=eq.${encodeURIComponent(normalizeEmail(email))}&select=*&limit=1`)
  if (!result.ok) throw new Error(`Coach lookup failed: ${result.status}`)
  return (await result.json())[0] || null
}

export async function countCoaches() {
  const result = await supabaseRequest('coach_accounts?select=id&limit=1', { headers: { Prefer: 'count=exact' } })
  if (!result.ok) throw new Error(`Coach count failed: ${result.status}`)
  const range = result.headers.get('content-range') || '*/0'
  return Number(range.split('/')[1]) || 0
}

export function createCoachToken(account, ttlSeconds = SESSION_TTL_SECONDS) {
  const payload = { sub: account.id, email: account.email, name: account.display_name, role: account.role, exp: Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds) || SESSION_TTL_SECONDS) }
  const encoded = base64url(JSON.stringify(payload))
  return `coach.${encoded}.${sign(encoded)}`
}

export function readCoachToken(token) {
  const value = String(token || '')
  if (!value.startsWith('coach.')) return null
  const [, encoded, signature] = value.split('.')
  if (!encoded || !signature) return null
  const expected = Buffer.from(sign(encoded)), actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null
  } catch { return null }
}

export function coachFromRequest(request) { return readCoachToken(request.headers['x-simkoll-code']) }

export async function createCoach({ email, displayName, password, role = 'coach', status = 'pending' }) {
  const passwordData = await hashCoachPassword(password)
  const result = await supabaseRequest('coach_accounts', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ email: normalizeEmail(email), display_name: String(displayName).trim(), password_hash: passwordData.hash, password_salt: passwordData.salt, role, status, approved_at: status === 'active' ? new Date().toISOString() : null }),
  })
  if (!result.ok) throw new Error(`Coach account creation failed: ${result.status} ${await result.text()}`)
  return (await result.json())[0]
}
