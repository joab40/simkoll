import test from 'node:test'
import assert from 'node:assert/strict'
import { competitionEntryRoster, competitionEntryProgress } from '../shared/competition-entry-status.js'

const swimmer = (id, overrides = {}) => ({ id, display_name: id, emoji: '🐬', training_group: 'junior', active: true, approval_status: 'approved', is_test_profile: false, ...overrides })

test('roster includes only active approved non-test swimmers in the competition groups', () => {
  const profiles = [swimmer('Anna'), swimmer('Bo', { training_group: 'ungdom_svart' }), swimmer('Test', { is_test_profile: true }), swimmer('Pending', { approval_status: 'pending' }), swimmer('Archived', { active: false }), swimmer('No group', { training_group: null })]
  assert.deepEqual(competitionEntryRoster(profiles, ['junior']).map(p => p.id), ['Anna'])
  assert.deepEqual(competitionEntryRoster(profiles, []).map(p => p.id), ['Anna', 'Bo', 'No group'])
  assert.deepEqual(Object.keys(competitionEntryRoster(profiles, ['junior'])[0]), ['id', 'name', 'emoji'])
})

test('progress counts swimmers once, separates drafts, and treats approved as submitted', () => {
  const roster = competitionEntryRoster(['Anna', 'Bo', 'Åsa', 'Örjan'].map(id => swimmer(id)))
  const entries = [
    { profile_id: 'Anna', status: 'submitted' }, { profile_id: 'Anna', status: 'submitted' },
    { profile_id: 'Anna', status: 'draft' }, { profile_id: 'Bo', status: 'approved' },
    { profile_id: 'Åsa', status: 'draft' }, { profile_id: 'Åsa', status: 'draft' },
    { profile_id: 'not-in-scope', status: 'submitted' },
  ]
  const result = competitionEntryProgress([...roster, roster[0]], entries)
  assert.deepEqual({ total: result.total, submitted: result.submitted, drafts: result.drafts, missing: result.missing }, { total: 4, submitted: 2, drafts: 1, missing: 1 })
  assert.deepEqual(result.pending.map(p => [p.name, p.status]), [['Åsa', 'draft'], ['Örjan', 'missing']])
  assert.equal(competitionEntryProgress(roster, [...entries].reverse()).submitted, 2)
})

test('empty entries, empty roster and unknown statuses never imply submissions', () => {
  const roster = competitionEntryRoster([swimmer('Anna')])
  assert.equal(competitionEntryProgress(roster, []).missing, 1)
  assert.equal(competitionEntryProgress(roster, [{ profile_id: 'Anna', status: 'unknown' }]).submitted, 0)
  assert.deepEqual(competitionEntryProgress([], []), { total: 0, submitted: 0, drafts: 0, missing: 0, pending: [] })
})
