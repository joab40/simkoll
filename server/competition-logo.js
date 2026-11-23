import { randomUUID } from 'node:crypto'
import { supabaseRequest, supabaseStorageRequest, supabaseStorageUrl } from './supabase.js'
import { competitionUuid } from './competition-participation.js'
import { competitionLogoPreset } from '../shared/competition-logo-presets.js'

const bucket = 'competition-logos'
const maxBytes = 448 * 1024
const maxSide = 320
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const libraryTable = 'competition_logo_library'
const libraryPath = id => `library/${id}.png`
const libraryError = () => new Error('Loggbiblioteket kunde inte nås. Kontrollera att databasuppdatering 149 är körd.')
function validLibraryPath(id, path) {
  if (typeof id !== 'string' || !competitionUuid.test(id) || typeof path !== 'string') return false
  const [folder, filename, extra] = path.split('/')
  return extra === undefined && filename === `${id}.png` && (folder === 'library' || competitionUuid.test(folder))
}
const surface = value => value === 'dark' ? 'dark' : 'light'

export function publicCompetitionLogo(competition) {
  const logo = competition.logo_document
  if (!competitionUuid.test(competition.id) || !competitionUuid.test(logo?.version)) return null
  const summary = { version: logo.version, surface: surface(logo.surface) }
  if (logo.presetId) return competitionLogoPreset(logo.presetId) ? { ...summary, presetId: logo.presetId } : null
  if (logo.libraryId) return validLibraryPath(logo.libraryId, logo.path) ? { ...summary, libraryId: logo.libraryId } : null
  return logo.path === `${competition.id}/${logo.version}.png` ? summary : null
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

export async function readCompetitionLogoAsset(id) {
  const result = await supabaseRequest(`${libraryTable}?id=eq.${id}&select=id,path,surface&limit=1`)
  if (!result.ok) {
    const error = libraryError()
    const details = await result.json().catch(() => null)
    error.schemaMissing = ['PGRST205', '42P01'].includes(details?.code)
    throw error
  }
  const [asset] = await result.json()
  return validLibraryPath(asset?.id, asset?.path) ? asset : null
}

export function competitionLogoDocument({ asset, presetId }) {
  return presetId
    ? { version: randomUUID(), presetId }
    : { version: randomUUID(), libraryId: asset.id, path: asset.path, surface: surface(asset.surface) }
}

async function uploadLogoFile(path, bytes) {
  const setup = await supabaseStorageRequest(`bucket/${bucket}`)
  if (!setup.ok || (await setup.json()).public !== false) throw new Error('Logglagringen kräver databasuppdatering 148.')
  return supabaseStorageRequest(`object/${bucket}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600', 'x-upsert': 'false' }, body: bytes,
  })
}

export async function storeCompetitionLogo(competitionId, bytes, name, preferredSurface, uploadId = randomUUID()) {
  const id = uploadId.toLowerCase()
  let existing
  try {
    existing = await readCompetitionLogoAsset(id)
  } catch (error) {
    if (!error.schemaMissing) throw error
    // Deploys can precede the SQL migration. These files are imported when it runs.
    const version = randomUUID()
    const path = `${competitionId}/${version}.png`
    if (!(await uploadLogoFile(path, bytes)).ok) throw new Error('Loggan kunde inte laddas upp. Försök igen.')
    return { version, path, surface: surface(preferredSurface) }
  }
  if (existing) return competitionLogoDocument({ asset: existing })

  const asset = { id, name, path: libraryPath(id), surface: surface(preferredSurface) }
  const result = await uploadLogoFile(asset.path, bytes)
  if (!result.ok) {
    const saved = await readCompetitionLogoAsset(id)
    if (saved) return competitionLogoDocument({ asset: saved })
    throw new Error('Loggan kunde inte laddas upp. Försök igen.')
  }
  const saved = await supabaseRequest(libraryTable, { method: 'POST', body: JSON.stringify(asset) })
  if (!saved.ok) {
    await removeLogoFile(asset.path)
    throw libraryError()
  }
  return competitionLogoDocument({ asset })
}

async function removeLogoFile(path, storage = supabaseStorageRequest) {
  try {
    const result = await storage(`object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) })
    if (!result.ok) console.warn('Competition logo cleanup failed:', result.status)
  } catch (error) { console.warn('Competition logo cleanup unavailable:', error.name) }
}

export async function removeCompetitionLogo(id, logo, storage = supabaseStorageRequest) {
  if (!logo?.libraryId && !logo?.presetId && publicCompetitionLogo({ id, logo_document: logo })) {
    await removeLogoFile(logo.path, storage)
  }
}

export async function competitionLogoUrl(logo, storage = supabaseStorageRequest) {
  const preset = competitionLogoPreset(logo.presetId)
  if (preset) return preset.src
  const result = await storage(`object/sign/${bucket}/${logo.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) })
  if (!result.ok) throw new Error('Loggan kunde inte öppnas.')
  const data = await result.json()
  const signedPath = data.signedURL || data.signedUrl
  if (!signedPath) throw new Error('Logglänken kunde inte skapas.')
  return supabaseStorageUrl(signedPath)
}
