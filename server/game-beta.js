import { randomUUID } from 'node:crypto'
import { supabaseRequest } from './supabase.js'

export const validBetaProfileId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const settingKey = profileId => `game_beta:${profileId.toLowerCase()}`
export async function loadGameBeta(profileId, catalog) {
  if (!validBetaProfileId(profileId)) return { games: [], revision: null }
  const result = await supabaseRequest(`app_settings?setting_key=eq.${settingKey(profileId)}&select=setting_value&limit=1`)
  if (!result.ok) throw new Error('Betaspelen kunde inte hämtas.')
  const value = (await result.json())[0]?.setting_value
  return { games: [...new Set(Array.isArray(value?.games) ? value.games : [])].filter(key => catalog.some(game => game.key === key)), revision: value?.revision || null }
}
export async function requireBetaProfile(profileId) {
  if (!validBetaProfileId(profileId)) return false
  const result = await supabaseRequest(`profiles?id=eq.${profileId}&active=eq.true&approval_status=eq.approved&select=id&limit=1`)
  if (!result.ok) throw new Error('Simmarprofilen kunde inte kontrolleras.')
  return (await result.json()).length > 0
}
export async function saveGameBeta(profileId, games, revision, catalog) {
  if (!validBetaProfileId(profileId) || !Array.isArray(games) || games.length > catalog.length || games.some(key => !catalog.some(game => game.key === key)) || (revision !== null && !validBetaProfileId(revision))) return { status: 400, error: 'Kontrollera simmare och valda betaspel.' }
  if (!await requireBetaProfile(profileId)) return { status: 404, error: 'Ingen aktiv, godkänd simmare hittades.' }
  const current = await loadGameBeta(profileId, catalog)
  if (current.revision !== revision) return { status: 409, error: 'Betaspelen har ändrats av någon annan. Hämta aktuella val och försök igen.' }
  const value = { games: [...new Set(games)], revision: randomUUID() }
  const path = revision === null ? 'app_settings?on_conflict=setting_key' : `app_settings?setting_key=eq.${settingKey(profileId)}&setting_value->>revision=eq.${revision}`
  const result = await supabaseRequest(path, {
    method: revision === null ? 'POST' : 'PATCH',
    headers: { Prefer: revision === null ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
    body: JSON.stringify({ ...(revision === null ? { setting_key: settingKey(profileId) } : {}), setting_value: value, updated_at: new Date().toISOString() }),
  })
  if (!result.ok) throw new Error('Betaspelen kunde inte sparas.')
  if (!(await result.json()).length) return { status: 409, error: 'Betaspelen har ändrats av någon annan. Hämta aktuella val och försök igen.' }
  return { status: 200, ...value }
}
export async function removeGameBeta(profileId) {
  if (!validBetaProfileId(profileId)) return
  const result = await supabaseRequest(`app_settings?setting_key=eq.${settingKey(profileId)}`, { method: 'DELETE' })
  if (!result.ok) throw new Error('Betatilldelningen kunde inte tas bort.')
}
