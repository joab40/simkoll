import { supabaseRequest } from './supabase.js'
import { builtInFlightDefaults, flightGroupId, validateFlightDefaults } from '../shared/flight-defaults.js'
import { writeAuditLog } from './audit.js'

const clubKey = 'flight_record_defaults'
const groupKey = (group) => `flight_record_group_${group}`
const fail = (message, status = 502) => Object.assign(new Error(message), { status })
const canManageClub = coach => ['head_coach', 'superadmin'].includes(coach.role)

export async function loadFlightDefaults(groups) {
  const keys = [clubKey, ...new Set(groups.map(flightGroupId).filter(Boolean).map(groupKey))]
  const response = await supabaseRequest(`app_settings?setting_key=in.(${keys.join(',')})&select=setting_key,setting_value`)
  if (!response.ok) throw fail('Flight Records standardinställningar kunde inte hämtas.')
  const rows = new Map()
  for (const row of await response.json()) {
    if (!row.setting_value || row.setting_value.inherit === true) continue
    try { rows.set(row.setting_key, validateFlightDefaults(row.setting_value)) } catch {
      throw fail('En sparad Flight Record-inställning är ogiltig.')
    }
  }
  const club = rows.get(clubKey) ?? builtInFlightDefaults
  return { club, group: (group) => rows.get(groupKey(flightGroupId(group))) ?? null }
}

export async function coachFlightDefaults(request, coach) {
  const scope = request.query.group
  const group = scope === undefined ? null : flightGroupId(scope)
  if (scope !== undefined && (typeof scope !== 'string' || scope !== group)) throw fail('Välj en giltig träningsgrupp.', 400)
  const canEdit = Boolean(group) || canManageClub(coach)
  if (request.method === 'POST') {
    if (!canEdit) throw fail('Huvudtränare och superadmin ändrar klubbens standardvärden.', 403)
    if (group) {
      const response = await supabaseRequest(`training_groups?id=eq.${group}&active=eq.true&select=id&limit=1`)
      if (!response.ok) throw fail('Träningsgruppen kunde inte kontrolleras.')
      if (!(await response.json()).length) throw fail('Träningsgruppen är inte aktiv.', 404)
    }
    let settings = null
    if (request.body?.settings !== null) {
      try { settings = validateFlightDefaults(request.body?.settings) } catch (error) { throw fail(error.message, 400) }
    }
    const fallback = group && !settings ? (await loadFlightDefaults([])).club : builtInFlightDefaults
    const settingKey = group ? groupKey(group) : clubKey
    const saved = await supabaseRequest('app_settings?on_conflict=setting_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ setting_key: settingKey, setting_value: settings ?? { inherit: true }, updated_at: new Date().toISOString() }),
    })
    if (!saved.ok) throw fail('Flight Records standardinställningar kunde inte sparas.')
    await writeAuditLog(request, { eventType: 'flight_record_defaults', role: 'coach', details: { coachAccountId: coach.sub, group, inherited: settings == null } })
    return { settings: settings ?? fallback, canEdit, inherited: Boolean(group && !settings) }
  }
  const defaults = await loadFlightDefaults([group])
  const groupOverride = group ? defaults.group(group) : null
  return { settings: groupOverride ?? defaults.club, canEdit, inherited: Boolean(group && !groupOverride) }
}
