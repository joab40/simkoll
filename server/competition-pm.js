import { randomUUID } from 'node:crypto'
import { supabaseStorageRequest, supabaseStorageUrl } from './supabase.js'

export const competitionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bucket = 'competition-pm'
const validPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i
export const canReadCompetition = (competition, role, profile) => Boolean(competition && (role === 'coach' || profile && (profile.is_test_profile || !competition.target_groups?.length || competition.target_groups.includes(profile.training_group))))
export const publicPm = (competition) => competition.pm_document?.path ? { name: competition.pm_document.name || 'Tävlings-PM', mimeType: competition.pm_document.mimeType, uploadedAt: competition.pm_document.uploadedAt } : null

export function decodeCompetitionPm(data, name) {
  if (typeof data !== 'string' || data.length > 4300000) throw new Error('Välj en PDF eller bild på högst 3 MB.')
  const match = data.match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw new Error('Välj en PDF, JPG, PNG eller WebP. Exportera Word till PDF först.')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error('Välj en fil på högst 3 MB.')
  const mime = match[1]
  const valid = mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (!valid) throw new Error('Filinnehållet stämmer inte med filtypen. Exportera filen igen som PDF eller bild.')
  return { bytes, mime, extension: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime], name: String(name || 'Tävlings-PM').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) }
}

export async function storeCompetitionPm(competitionId, decoded, storage = supabaseStorageRequest) {
  if (!competitionUuid.test(competitionId)) throw new Error('Tävlingen saknas.')
  const setup = await storage(`bucket/${bucket}`)
  if (!setup.ok || (await setup.json()).public !== false) throw new Error('PM-lagringen behöver databasuppdatering 099 innan filer kan bifogas.')
  const document = { path: `${competitionId}/${randomUUID()}.${decoded.extension}`, name: decoded.name, mimeType: decoded.mime, uploadedAt: new Date().toISOString() }
  const result = await storage(`object/${bucket}/${document.path}`, { method: 'POST', headers: { 'Content-Type': decoded.mime, 'x-upsert': 'false' }, body: decoded.bytes })
  if (!result.ok) throw new Error('PM-filen kunde inte laddas upp. Försök igen.')
  return document
}

export async function removeCompetitionPm(document, storage = supabaseStorageRequest) {
  if (!validPath.test(document?.path || '')) return
  try {
    const result = await storage(`object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [document.path] }) })
    if (!result.ok) console.warn('Competition PM cleanup failed:', result.status)
  } catch (error) { console.warn('Competition PM cleanup unavailable:', error.name) }
}

export async function competitionPmUrl(competition, storage = supabaseStorageRequest) {
  const document = competition.pm_document
  if (!validPath.test(document?.path || '') || !document.path.startsWith(`${competition.id}/`)) throw new Error('Inget PM är bifogat till tävlingen.')
  const result = await storage(`object/sign/${bucket}/${document.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) })
  if (!result.ok) throw new Error('PM-filen kunde inte öppnas. Försök igen.')
  const body = await result.json()
  const path = body.signedURL || body.signedUrl
  if (!path) throw new Error('PM-länken kunde inte skapas. Försök igen.')
  return { ...publicPm(competition), url: supabaseStorageUrl(path) }
}
