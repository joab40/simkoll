import { supabaseRequest } from './supabase.js'

export const validEmblemRequestId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function rewardEmblemBonus(profileId, requestId = null) {
  const response = await supabaseRequest('rpc/reward_emblem_bonus', {
    method: 'POST', body: JSON.stringify({ p_profile_id: profileId, p_request_id: requestId }),
  })
  if (!response.ok) throw new Error(`Emblem bonus unavailable: ${response.status}`)
  const data = await response.json()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.date) || !Number.isInteger(data.used) || data.used < 0 || data.used > 5 || data.limit !== 5 || ![0, 1].includes(data.awarded) || !Number.isSafeInteger(data.total) || data.total < 0 || typeof data.replayed !== 'boolean') throw new Error('Invalid emblem bonus response')
  return data
}

export async function loadEmblemBonus(profile) {
  if (profile.is_test_profile) return { available: false }
  try {
    const { total: _total, ...bonus } = await rewardEmblemBonus(profile.id)
    return { ...bonus, available: true }
  } catch {
    // Deploying before SQL 129 must not hide the swimmer's existing points.
    return { available: false }
  }
}
