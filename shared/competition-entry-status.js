// Group membership is not a confirmed intention to compete. This is only an
// overview of saved selections, not an attendance or eligibility assessment.
export function competitionEntryRoster(profiles, targetGroups = []) {
  return profiles.filter(profile => profile.active === true && profile.approval_status === 'approved' && !profile.is_test_profile
    && (!targetGroups.length || targetGroups.includes(profile.training_group)))
    .map(profile => ({ id: profile.id, name: profile.display_name || 'Simmare', emoji: profile.emoji || '🏊' }))
}

export const isSubmittedCompetitionEntry = entry => ['submitted', 'approved'].includes(entry.status)

export function competitionEntryProgress(roster, entries) {
  const byProfile = new Map()
  for (const entry of entries) {
    const status = isSubmittedCompetitionEntry(entry) ? 'submitted' : entry.status === 'draft' ? 'draft' : null
    if (status && byProfile.get(entry.profile_id) !== 'submitted') byProfile.set(entry.profile_id, status)
  }
  const swimmers = [...new Map(roster.map(profile => [profile.id, profile])).values()]
    .map(profile => ({ ...profile, status: byProfile.get(profile.id) || 'missing' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  const pending = swimmers.filter(profile => profile.status !== 'submitted')
  return { total: swimmers.length, submitted: swimmers.length - pending.length,
    drafts: pending.filter(profile => profile.status === 'draft').length,
    missing: pending.filter(profile => profile.status === 'missing').length, pending }
}
