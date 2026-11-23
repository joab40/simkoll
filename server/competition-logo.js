import { randomUUID } from 'node:crypto'
import { supabaseStorageRequest, supabaseStorageUrl } from './supabase.js'
import { competitionUuid } from './competition-participation.js'

const bucket = 'competition-logos'
const maxBytes = 448 * 1024
const maxSide = 320
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const validDocument = (id, document) => competitionUuid.test(id) && competitionUuid.test(document?.version)
  && document.path === `${id}/${document.version}.png`
const surface = value => value === 'dark' ? 'dark' : 'light'

export function publicCompetitionLogo(competition) {
  const logo = competition.logo_document
  return validDocument(competition.id, logo) ? { version: logo.version, surface: surface(logo.surface) } : null
}

export function decodeCompetitionLogo(data) {
  const fail = () => new Error('Loggan kunde inte läsas. Välj bilden igen i tävlingsformuläret.')
  if (typeof data !== 'string' || data.length > Math.ceil(maxBytes / 3) * 4 + 22) throw fail()
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data)
  if (!match) throw fail()
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length < 45 || bytes.length > maxBytes || !bytes.subarray(0, 8).equals(pngHeader)
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw fail()
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > maxSide || height > maxSide) throw fail()

  let hasPixels = false
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    offset += 12 + length
    if (offset > bytes.length || type === 'acTL') throw fail()
    if (type === 'IDAT') hasPixels = true
    if (type === 'IEND' && length === 0 && offset === bytes.length && hasPixels) return bytes
  }
  throw fail()
}

export async function storeCompetitionLogo(id, bytes, preferredSurface, storage = supabaseStorageRequest) {
  const setup = await storage(`bucket/${bucket}`)
  if (!setup.ok || (await setup.json()).public !== false) throw new Error('Logglagringen kräver databasuppdatering 148.')
  const version = randomUUID()
  const document = { version, path: `${id}/${version}.png`, surface: surface(preferredSurface) }
  const result = await storage(`object/${bucket}/${document.path}`, {
    method: 'POST', headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600', 'x-upsert': 'false' }, body: bytes,
  })
  if (!result.ok) throw new Error('Loggan kunde inte laddas upp. Försök igen.')
  return document
}

export async function removeCompetitionLogo(id, logo, storage = supabaseStorageRequest) {
  if (!validDocument(id, logo)) return
  try {
    const result = await storage(`object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [logo.path] }) })
    if (!result.ok) console.warn('Competition logo cleanup failed:', result.status)
  } catch (error) { console.warn('Competition logo cleanup unavailable:', error.name) }
}

export async function competitionLogoUrl(competition, storage = supabaseStorageRequest) {
  const logo = competition.logo_document
  const result = await storage(`object/sign/${bucket}/${logo.path}`, { method: 'POST', body: JSON.stringify({ expiresIn: 3600 }) })
  if (!result.ok) throw new Error('Loggan kunde inte öppnas.')
  const data = await result.json()
  const signedPath = data.signedURL || data.signedUrl
  if (!signedPath) throw new Error('Logglänken kunde inte skapas.')
  return supabaseStorageUrl(signedPath)
}
