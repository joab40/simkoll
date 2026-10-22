import { supabaseRequest } from './supabase.js'
import { getSessionProfile, stockholmDate } from './profile-auth.js'

const dateValid = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date
const dayBefore = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86400000).toISOString().slice(0,10)
const fail = (message, status) => Object.assign(new Error(message), { status })
export async function dailySleep(request, role) {
  const today = stockholmDate()
  const profile = await getSessionProfile(request)
  if (request.method === 'POST') {
    if (role !== 'swimmer' || !profile) throw fail('Logga in på din simmarprofil.', 401)
    const { date, minutes, quality, skipped = false } = request.body || {}
    if (![today, dayBefore(today, 1)].includes(date) || typeof skipped !== 'boolean' || (!skipped && (!Number.isInteger(minutes) || minutes < 0 || minutes > 840 || minutes % 15 !== 0 || ![1,3,5].includes(quality)))) throw fail('Ange sovtid 0–14 timmar i kvartsteg och välj hur sömnen kändes.', 400)
    const result = await supabaseRequest('profile_daily_sleep?on_conflict=profile_id,activity_date', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ profile_id: profile.id, activity_date: date, minutes: skipped ? null : minutes, quality: skipped ? null : quality, skipped }),
    })
    if (!result.ok) throw fail('Sömnkollen kunde inte sparas. Kontrollera att databasuppdatering 100 är körd.', 503)
    return { saved: true }
  }
  if (!profile && role !== 'coach') throw fail('Logga in på din simmarprofil.', 401)
  const start = String(request.query?.start || dayBefore(today,27)), end = String(request.query?.end || today)
  if (!dateValid(start) || !dateValid(end) || start > end || end > today || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw fail('Välj högst ett år fram till idag.',400)
  const owner = role === 'coach' ? String(request.query?.profileId || '') : profile.id
  if (owner && !/^[0-9a-f-]{36}$/i.test(owner)) throw fail('Ogiltig simmarprofil.',400)
  const scope = role === 'coach' ? '&profiles.active=eq.true&profiles.approval_status=eq.approved&profiles.is_test_profile=eq.false' : ''
  const records = []
  for (let offset = 0; offset < 20000; offset += 500) {
    const result = await supabaseRequest(`profile_daily_sleep?select=profile_id,activity_date,minutes,quality,skipped,created_at${role === 'coach' ? ',profiles!inner(active,approval_status,is_test_profile)' : ''}&activity_date=gte.${start}&activity_date=lte.${end}${owner ? `&profile_id=eq.${encodeURIComponent(owner)}` : ''}${scope}&order=activity_date.desc,profile_id.asc&limit=500&offset=${offset}`)
    if (!result.ok) throw fail('Sömnkollen kunde inte hämtas. Kontrollera att databasuppdatering 100 är körd.',503)
    const page = await result.json()
    records.push(...page.map(({ profiles, ...row }) => row))
    if (page.length < 500) return { records }
  }
  throw fail('För mycket sömndata. Välj en kortare period.',400)
}
