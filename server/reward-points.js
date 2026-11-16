import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { rewardProgress } from '../shared/reward-levels.js'
import { levelArtwork } from './reward-art.js'

export async function rewardLevels(read = supabaseRequest) {
  const response = await analyticsRows('reward_levels?select=*&order=min_points.asc,id.asc', read)
  if (!response.ok || response.truncated) throw new Error('Levels incomplete')
  const rows = await response.json(), art = await levelArtwork(rows, read)
  return rows.map(row => ({ id: row.id, name: row.name, emoji: row.emoji, minPoints: row.min_points, artwork: art.get(row.id) || null }))
}
export async function rewardTotals(profileIds, read = supabaseRequest) {
  if (!profileIds.length) return {}
  const response = await read('rpc/reward_point_totals', { method: 'POST', body: JSON.stringify({ p_profile_ids: profileIds }) })
  if (!response.ok) throw new Error('Kompletta poäng kunde inte hämtas. Kontrollera att SQL 124 är körd.')
  const totals = await response.json()
  if (!totals || Array.isArray(totals) || typeof totals !== 'object') throw new Error('Invalid point totals')
  const output = {}
  for (const id of profileIds) {
    const total = Number(totals[id] ?? 0)
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid point total')
    output[id] = total
  }
  return output
}
export async function coachRewardOverview(read = supabaseRequest) {
  const [profileResult, levels] = await Promise.all([
    analyticsRows('profiles?select=id&active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&order=id.asc', read), rewardLevels(read),
  ])
  if (!profileResult.ok || profileResult.truncated) throw new Error('Profiles incomplete')
  const profiles = await profileResult.json(), totals = await rewardTotals(profiles.map(row => row.id), read)
  return { levels, profiles: profiles.map(row => {
    const { current, ...rest } = rewardProgress(totals[row.id], levels)
    return { profileId: row.id, ...rest, level: current }
  }) }
}
