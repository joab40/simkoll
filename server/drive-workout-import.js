import { parseSwimWorkbook } from './swim-workbook-import.js'
import { SWIM_WORKBOOK_TYPES, SWIM_WORKBOOK_MAX_BYTES } from '../shared/swim-workbook.js'

export async function importDriveWorkbook(fileId, apiKey) {
  if (!apiKey) throw new Error('Google Drive API-nyckel saknas i Vercel.')
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
  const metadata = await fetch(`${base}?${new URLSearchParams({ key: apiKey, fields: 'id,name,mimeType,size' })}`, { signal: AbortSignal.timeout(20000) })
  if (!metadata.ok) throw new Error(`Google Drive-filen kunde inte läsas (${metadata.status}).`)
  const file = await metadata.json()
  if (!Object.hasOwn(SWIM_WORKBOOK_TYPES, file.mimeType)) throw new Error('Välj Google Kalkylark eller en Excel-fil (XLS/XLSX).')
  if (Number(file.size) > SWIM_WORKBOOK_MAX_BYTES) throw new Error('Välj ett kalkylblad under 3 MB.')
  const googleSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet'
  const url = googleSheet
    ? `${base}/export?${new URLSearchParams({ key: apiKey, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })}`
    : `${base}?${new URLSearchParams({ key: apiKey, alt: 'media' })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Google Drive-filen kunde inte hämtas (${response.status}).`)
  if (Number(response.headers.get('content-length')) > SWIM_WORKBOOK_MAX_BYTES) throw new Error('Välj ett kalkylblad under 3 MB.')
  const chunks = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > SWIM_WORKBOOK_MAX_BYTES) { await response.body.cancel?.().catch(() => {}); throw new Error('Välj ett kalkylblad under 3 MB.') }
    chunks.push(Buffer.from(chunk))
  }
  return parseSwimWorkbook(Buffer.concat(chunks), file.name)
}
