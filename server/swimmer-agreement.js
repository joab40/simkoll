import { supabaseRequest } from './supabase.js'
import { latestCompletedAgreement } from '../shared/swimmer-agreement.js'

export async function loadSwimmerAgreement(profileId, read = supabaseRequest) {
  const size = 50
  for (let offset = 0; offset < 2000; offset += size) {
    const result = await read(`development_talks?select=id,swimmer_id,status,meeting_date,follow_up_date,agreement,created_at,updated_at&swimmer_id=eq.${encodeURIComponent(profileId)}&status=eq.completed&order=meeting_date.desc,created_at.desc,id.desc&limit=${size}&offset=${offset}`)
    if (!result.ok) throw new Error('Överenskommelsen kunde inte hämtas. Försök igen.')
    const rows = await result.json()
    if (!Array.isArray(rows)) throw new Error('Överenskommelsen kunde inte läsas. Försök igen.')
    const talk = latestCompletedAgreement(rows.map((row) => ({ id: row.id, swimmerId: row.swimmer_id, status: row.status, meetingDate: row.meeting_date, followUpDate: row.follow_up_date, agreement: row.agreement, createdAt: row.created_at, updatedAt: row.updated_at })), profileId)
    if (talk || rows.length < size) return talk
  }
  throw new Error('Samtalshistoriken är för stor för en fullständig sökning efter överenskommelsen.')
}
