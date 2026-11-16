import { analyticsRows } from './analytics-rows.js'
import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'

export async function loadActivityDates(profileId, read = supabaseRequest, today = stockholmDate()) {
  const result = await analyticsRows(`profile_daily_activity?profile_id=eq.${encodeURIComponent(profileId)}&activity_date=lte.${today}&select=activity_date&order=activity_date.desc`, read)
  if (!result.ok || result.truncated) throw new Error('Aktivitetshistoriken kunde inte läsas fullständigt.')
  return (await result.json()).map(row => row.activity_date)
}
