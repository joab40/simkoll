import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachMessageBadge } from '../src/coach-message-badge.js'
import { COACH_MENU_FEATURES, COACH_OVERVIEW_FEATURES, COACH_MENU_SECTIONS } from '../shared/coach-navigation.js'
import { buildCoachAssistantFeatureSnapshot } from '../server/assistant-feature-guide.js'

test('message badge exposes the full new count but keeps large visual badges compact', () => {
  assert.deepEqual(coachMessageBadge(0), { count: 0, text: '0', label: 'Meddelanden, inga nya meddelanden' })
  assert.equal(coachMessageBadge(1).label, 'Meddelanden, 1 nytt meddelande')
  assert.equal(coachMessageBadge(3).label, 'Meddelanden, 3 nya meddelanden')
  assert.equal(coachMessageBadge(99).text, '99')
  assert.equal(coachMessageBadge(540).text, '99+')
  assert.match(coachMessageBadge(540).label, /540 nya meddelanden/)
  for (const invalid of [NaN, Infinity, -1, null, undefined, '12']) assert.equal(coachMessageBadge(invalid).count, 0)
})

test('messages move from overview shortcuts to the header, retaining menu visibility controls', () => {
  assert.ok(COACH_MENU_FEATURES.some(([key]) => key === 'community'))
  assert.ok(COACH_MENU_SECTIONS.some(([, keys]) => keys.includes('community')))
  assert.ok(!COACH_OVERVIEW_FEATURES.some(([key]) => key === 'community'))
  const item = (settings) => buildCoachAssistantFeatureSnapshot({ webappSettings: settings }).navigation.find(({ key }) => key === 'community')
  assert.equal(item({}).headerShortcut, true)
  assert.equal(item({}).overviewShortcut, false)
  assert.equal(item({ coach: { community: false } }).headerShortcut, false)
  assert.equal(item({ overview: { community: false } }).headerShortcut, true, 'old overview preferences do not hide the new header shortcut')
})

test('actual coach view wires existing count, visibility and navigation to the shared header', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const header = source.split('\n').find((line) => line.includes('<CoachHeader')) || ''
  assert.match(header, /messagesVisible=\{coachVisible\('community'\)\}/)
  assert.match(header, /messageCount=\{coachMessageCount\}/)
  assert.match(header, /messagesActive=\{view === 'community'\}/)
  assert.match(header, /onMessages=\{\(\) => openViewFromMenu\('community'\)\}/)
  assert.ok(source.includes("item && item.key !== 'community'"), 'old saved orders cannot restore the duplicate tab')
  assert.ok(source.includes('simkoll-coach-messages-seen-${coachProfile?.id ||'), 'personal coach read checkpoints use the stable account ID')
})
