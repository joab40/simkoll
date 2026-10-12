import test from 'node:test'
import assert from 'node:assert/strict'
import { COACH_NAV_ITEMS } from '../shared/coach-navigation.js'
import { buildCoachAssistantFeatureSnapshot } from '../server/assistant-feature-guide.js'

const findNav = (snapshot, key) => snapshot.navigation.find((item) => item.key === key)
const findFeature = (snapshot, feature) => snapshot.featureSettings.find((item) => item.feature === feature)

test('assistant menu snapshot follows the shared navigation keys and default visibility', () => {
  const snapshot = buildCoachAssistantFeatureSnapshot({ accountRole: 'coach', webappSettings: {} })
  assert.deepEqual(snapshot.navigation.map(({ key }) => key), COACH_NAV_ITEMS.map(({ key }) => key))
  assert.equal(findNav(snapshot, 'planning').inMenu, true)
  assert.equal(findNav(snapshot, 'planning').overviewShortcut, true)
  assert.equal(snapshot.personalSettingsEnabled, false)
})

test('ordinary coaches only see global menu settings, not supplied personal overrides', () => {
  const snapshot = buildCoachAssistantFeatureSnapshot({
    accountRole: 'coach',
    webappSettings: { coach: { planning: false } },
    personalSettingsEnabled: true,
    personalSettings: { coach: { planning: true } },
  })
  assert.equal(findNav(snapshot, 'planning').inMenu, false)
  assert.equal(findNav(snapshot, 'planning').overviewShortcut, false)
})

test('head coaches can see their own effective navigation when personal settings are enabled', () => {
  const snapshot = buildCoachAssistantFeatureSnapshot({
    accountRole: 'head_coach',
    webappSettings: { coach: { planning: false }, overview: { planning: false } },
    personalSettingsEnabled: true,
    personalSettings: { coach: { planning: true }, overview: { planning: true } },
  })
  assert.equal(snapshot.personalSettingsEnabled, true)
  assert.equal(findNav(snapshot, 'planning').inMenu, true)
  assert.equal(findNav(snapshot, 'planning').overviewShortcut, true)
})

test('feature snapshot includes only safe current switches and read-only guidance', () => {
  const snapshot = buildCoachAssistantFeatureSnapshot({
    accountRole: 'superadmin',
    webappSettings: { aiEnabled: false, openChat: { enabled: true, coachOnly: true, backgroundImage: 'private-image-data' }, swimmer: { customPep: false } },
    openChatSettings: { enabled: true, coachOnly: true },
    developmentTalksEnabled: false,
    pushSettings: { enabled: true, developmentTalks: false },
  })
  assert.equal(findFeature(snapshot, 'AI-stöd').enabled, false)
  assert.equal(findFeature(snapshot, 'Info från tränarna').enabled, true)
  assert.equal(findFeature(snapshot, 'Info från tränarna').coachOnly, true)
  assert.equal(findFeature(snapshot, 'Utvecklingssamtal i simmarvyn').enabled, false)
  assert.equal(findFeature(snapshot, 'Pushnotiser för klubben').categories.developmentTalks, false)
  assert.equal(JSON.stringify(snapshot).includes('private-image-data'), false)
  assert.equal(snapshot.menuAndSettingsAreReadOnlyToAssistant, true)
})
