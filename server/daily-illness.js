import { supabaseRequest } from './supabase.js'
import { getSessionProfile, stockholmDate } from './profile-auth.js'
import { ILLNESS_CHOICES, validIllnessDay } from '../shared/illness.js'
import { coachWeekAddDays } from '../shared/coach-week.js'

const fail = (message, status) => Object.assign(new Error(message), { status })
export const ILLNESS_UNAVAILABLE = 'Sjukdomskollen kunde inte hämtas. Kontrollera att SQL 112 är körd. Saknat underlag är inte ett nej-svar.'
export async function missingIllnessTable(result) {
  if (result.ok) return false
  const error = await result.json().catch(() => ({}))
  return ['42P01', 'PGRST205'].includes(error.code)
}
export async function dailyIllness(request, role) {
  const today = stockholmDate(), profile = await getSessionProfile(request)
  if (request.method === 'POST') {
    if (role !== 'swimmer' || !profile) throw fail('Logga in på din simmarprofil.', 401)
    const { date, status, skipped = false, replace = false } = request.body || {}
    if (![today, coachWeekAddDays(today, -1)].includes(date) || typeof skipped !== 'boolean' || typeof replace !== 'boolean' || (!skipped && !ILLNESS_CHOICES.some(choice => choice.value === status))) throw fail('Välj ett giltigt sjukdomssvar för idag eller igår.', 400)
    // Retries/devices cannot overwrite a prior answer. Only an explicit edit in
    // the history uses replace; ownership always comes from the profile session.
    const result = await supabaseRequest('profile_daily_illness?on_conflict=profile_id,activity_date', {
      method: 'POST', headers: { Prefer: `resolution=${replace ? 'merge' : 'ignore'}-duplicates` },
      body: JSON.stringify({ profile_id: profile.id, activity_date: date, status: skipped ? null : status, skipped, updated_at: new Date().toISOString() }),
    })
    if (!result.ok) throw fail('Sjukdomskollen kunde inte sparas. Kontrollera att SQL 112 är körd.', 503)
    return { saved: true }
  }
  if (!profile && role !== 'coach') throw fail('Logga in på din simmarprofil.', 401)
  const start = String(request.query?.start || coachWeekAddDays(today, -27)), end = String(request.query?.end || today)
  if (!validIllnessDay(start) || !validIllnessDay(end) || start > end || end > today || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw fail('Välj högst ett år fram till idag.', 400)
  const owner = role === 'coach' ? String(request.query?.profileId || '') : profile.id
  if (owner && !/^[0-9a-f-]{36}$/i.test(owner)) throw fail('Ogiltig simmarprofil.', 400)
  const scope = role === 'coach' ? '&profiles.active=eq.true&profiles.approval_status=eq.approved&profiles.is_test_profile=eq.false' : ''
  const records = []
  for (let offset = 0; offset < 20000; offset += 500) {
    const result = await supabaseRequest(`profile_daily_illness?select=profile_id,activity_date,status,skipped,updated_at${role === 'coach' ? ',profiles!inner(active,approval_status,is_test_profile)' : ''}&activity_date=gte.${start}&activity_date=lte.${end}${owner ? `&profile_id=eq.${encodeURIComponent(owner)}` : ''}${scope}&order=activity_date.desc,profile_id.asc&limit=500&offset=${offset}`)
    if (!result.ok) {
      if (await missingIllnessTable(result)) return { records: [], available: false, warning: ILLNESS_UNAVAILABLE }
      throw fail('Sjukdomskollen kunde inte hämtas. Försök igen.', 503)
    }
    const page = await result.json()
    if (!Array.isArray(page)) throw fail('Sjukdomskollen kunde inte läsas.', 503)
    records.push(...page.map(({ profiles, ...row }) => row))
    if (page.length < 500) return { records, available: true }
  }
  throw fail('För mycket data. Välj en kortare period.', 400)
}
