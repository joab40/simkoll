import { competitionIncludesSwimmer } from '../shared/competition-participation.js'
import { analyticsRows } from './analytics-rows.js'
import { supabaseRequest } from './supabase.js'

export const competitionUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export const competitionScope = 'target_groups,participant_overrides'

export function canReadCompetition(competition, role, profile) {
  return Boolean(competition && (role === 'coach' || profile && competitionIncludesSwimmer({
    targetGroups: competition.target_groups,
    participantOverrides: competition.participant_overrides,
  }, { id: profile.id, trainingGroup: profile.training_group, isTestProfile: profile.is_test_profile })))
}

export async function saveCompetitionParticipants(body) {
  const { competitionId, updatedAt, changes } = body
  const choices = changes && typeof changes === 'object' && !Array.isArray(changes) ? Object.entries(changes) : []
  if (typeof competitionId !== 'string' || !competitionUuid.test(competitionId)
    || typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))
    || !choices.length || choices.length > 1000
    || choices.some(([id, choice]) => !competitionUuid.test(id) || id !== id.toLowerCase() || (choice !== null && typeof choice !== 'boolean'))) {
    return { status: 400, error: 'Välj en giltig tävling och kontrollera deltagarlistan.' }
  }
  const endpoint = `competition_calendar?id=eq.${encodeURIComponent(competitionId)}`
  const result = await supabaseRequest(`${endpoint}&select=*&limit=1`)
  if (!result.ok) return { status: 503, error: 'Tävlingen kunde inte hämtas. Försök igen.' }
  const [competition] = await result.json()
  if (!competition) return { status: 404, error: 'Tävlingen finns inte längre.' }
  if (!Object.hasOwn(competition, 'participant_overrides')) {
    return { status: 503, error: 'Deltagarlistan kräver databasuppdatering 144.' }
  }
  const conflict = { status: 409, error: 'Tävlingen har ändrats. Öppna tävlingskalendern igen och gör om ditt val.' }
  if (competition.updated_at !== updatedAt) return conflict
  const selections = choices.filter(([, choice]) => choice !== null)
  if (selections.length) {
    const roster = await analyticsRows('profiles?active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id&order=id.asc')
    if (!roster.ok || roster.truncated) return { status: 503, error: 'Simmarna kunde inte kontrolleras. Försök igen.' }
    const validIds = new Set((await roster.json()).map(profile => profile.id))
    if (selections.some(([id]) => !validIds.has(id))) return { status: 400, error: 'En vald simmarprofil är inte längre aktiv. Hämta deltagarlistan igen.' }
  }
  const overrides = { ...competition.participant_overrides }
  for (const [id, choice] of choices) {
    if (choice === null) delete overrides[id]
    else overrides[id] = choice
  }
  const saved = await supabaseRequest(`${endpoint}&updated_at=eq.${encodeURIComponent(updatedAt)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ participant_overrides: overrides, updated_at: new Date(Math.max(Date.now(), Date.parse(updatedAt) + 1)).toISOString() }),
  })
  if (!saved.ok) return { status: 503, error: 'Deltagarna kunde inte sparas. Försök igen.' }
  const [row] = await saved.json()
  return row ? { row } : conflict
}
