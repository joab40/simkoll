import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { isTimeDate, isTimeId, validateSwimTime } from '../shared/swim-times.js'
import { loadTrainingDiary } from './training-diary.js'

const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const checkTable = async (result) => {
  if (result.ok) return
  const detail = await result.json().catch(() => ({}))
  if (['42P01', 'PGRST205'].includes(detail.code)) throw fail('Egna tider kräver databasuppdatering 098. Be administratören uppdatera databasen.', 503)
  throw fail('Tiderna kunde inte hämtas eller sparas. Försök igen.', 502)
}

export async function loadSwimTimes(profileId, start, end) {
  if (!isTimeDate(start) || !isTimeDate(end) || start > end || end > stockholmDate()) throw fail('Välj en giltig period till och med idag.')
  const rows = []
  for (let offset = 0; offset < 6000; offset += 500) {
    const result = await supabaseRequest(`training_swim_times?profile_id=eq.${encodeURIComponent(profileId)}&result_date=gte.${start}&result_date=lte.${end}&select=*&order=result_date.desc,created_at.desc,id.desc&limit=500&offset=${offset}`)
    await checkTable(result)
    const page = await result.json()
    rows.push(...page)
    if (page.length < 500) return { times: rows, limited: false }
  }
  return { times: rows, limited: true }
}

export async function saveSwimTime(profile, body) {
  let values
  try { values = validateSwimTime(body, stockholmDate()) } catch (error) { throw fail(error.message) }
  if (body.id && !isTimeId(body.id)) throw fail('Ogiltig tidsregistrering.')
  if (values.entry_key) {
    const diary = await loadTrainingDiary(profile, values.result_date, values.result_date)
    if (!diary.entries.some((entry) => entry.key === values.entry_key && entry.type === 'swim' && entry.state === 'completed')) throw fail('Välj ett genomfört simpass i den valda simmarens dagbok för samma datum.')
  }
  const updating = Boolean(body.id)
  const path = updating ? `training_swim_times?id=eq.${body.id}&profile_id=eq.${encodeURIComponent(profile.id)}` : 'training_swim_times'
  const result = await supabaseRequest(path, { method: updating ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...values, profile_id: profile.id, updated_at: new Date().toISOString() }) })
  await checkTable(result)
  const [time] = await result.json()
  if (!time) throw fail('Tidsregistreringen finns inte i den valda profilen. Uppdatera sidan.', 404)
  return time
}

export async function deleteSwimTime(profileId, id) {
  if (!isTimeId(id)) throw fail('Ogiltig tidsregistrering.')
  const result = await supabaseRequest(`training_swim_times?id=eq.${id}&profile_id=eq.${encodeURIComponent(profileId)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  await checkTable(result)
  if (!(await result.json()).length) throw fail('Tidsregistreringen finns inte i din profil.', 404)
}
