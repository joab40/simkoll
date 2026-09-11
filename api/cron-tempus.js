import { sendJson, supabaseRequest } from '../server/supabase.js'
import { awardPoints } from '../server/profile-auth.js'

const decodePage = (html) => {
  const match = html.match(/data-page="([^\"]+)"/)
  if (!match) return null
  return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/'))
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.authorization !== `Bearer ${secret}`) return sendJson(response, 401, { error: 'Unauthorized' })
  try {
    const profilesResult = await supabaseRequest('profiles?active=eq.true&approval_status=eq.approved&tempus_id=not.is.null&select=id,tempus_id')
    if (!profilesResult.ok) throw new Error('Tempus profiles lookup failed')
    let synced = 0; let personalBests = 0
    for (const profile of await profilesResult.json()) {
      const existingResult = await supabaseRequest(`competition_results?profile_id=eq.${profile.id}&select=event,pool,result_time&order=result_time.asc&limit=10000`)
      if (!existingResult.ok) continue
      const existing = await existingResult.json()
      const best = new Map()
      existing.forEach((item) => { const key = `${item.event}|${item.pool || ''}`; if (Number.isFinite(item.result_time)) best.set(key, Math.min(best.get(key) ?? Infinity, item.result_time)) })
      const page = await fetch(`https://www.tempusopen.se/swimmers/${profile.tempus_id}/swimming?best_time_only=0&from_date=2000-01-01&to_date=${new Date().toISOString().slice(0, 10)}`)
      if (!page.ok) continue
      const data = decodePage(await page.text()); if (!data) continue
      const all = [...(data.props?.results_short?.data || []), ...(data.props?.results_long?.data || [])]
      const rows = all.filter((item) => item.event_name && item.result_date && item.swim_time).slice(0, 500).map((item) => ({ profile_id: profile.id, event: item.event_name, competition_name: item.competition_name || null, pool: item.pool_type_name || null, result_date: item.result_date, swim_time: item.swim_time, result_time: Number.isFinite(Number(item.result_time)) ? Number(item.result_time) : null, aqua_points: Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, synced_at: new Date().toISOString() }))
      if (!rows.length) continue
      const improved = rows.filter((row) => { const previous = best.get(`${row.event}|${row.pool || ''}`); return Number.isFinite(row.result_time) && previous != null && row.result_time < previous })
      const upsert = await supabaseRequest('competition_results?on_conflict=profile_id,event,pool,result_date,swim_time,competition_name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) })
      if (!upsert.ok) continue
      synced += rows.length
      for (const row of improved) { await awardPoints(profile.id, 'personal_best', 3, `${row.event}|${row.pool || ''}|${row.result_date}|${row.swim_time}`); personalBests += 1 }
    }
    return sendJson(response, 200, { ok: true, synced, personalBests })
  } catch (error) { console.error(error); return sendJson(response, 500, { error: 'Tempus nattliga synkning misslyckades.' }) }
}
