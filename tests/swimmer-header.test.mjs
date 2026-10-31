import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { swimmerNavigation } from '../shared/swimmer-navigation.js'

test('desktop has three primary links and retains every other existing destination in More', () => {
  const items = swimmerNavigation({ hasProfile: true })
  assert.deepEqual(items.filter(item => item.primary).map(item => item.key), ['planning', 'diary', 'goals'])
  assert.deepEqual(items.filter(item => !item.primary).map(item => item.key), ['strength', 'dryland', 'competitions', 'community', 'help', 'legal'])
  assert.equal(new Set(items.map(item => item.key)).size, items.length)
})

test('profile and planning visibility rules are unchanged and menu definitions are not mutable', () => {
  assert.deepEqual(swimmerNavigation().map(item => item.key), ['help', 'legal'])
  assert.ok(!swimmerNavigation({ hasProfile: true, planningEnabled: false }).some(item => item.key === 'planning'))
  const items = swimmerNavigation({ hasProfile: true }); items[0].label = 'changed'
  assert.equal(swimmerNavigation({ hasProfile: true })[0].label, 'Veckoplanering')
})

test('header supports click outside, Escape with focus return, focus leaving and breakpoint changes', () => {
  const source = readFileSync(new URL('../src/swimmer-header.jsx', import.meta.url), 'utf8')
  for (const token of ['aria-expanded={moreOpen}', 'aria-controls={moreId}', 'aria-expanded={menuOpen}', 'aria-controls={navId}', 'pointerdown', 'Escape', 'moreButton.current?.focus()', 'mobileButton.current?.focus()', 'onBlurCapture', "query.addEventListener('change', close)"]) assert.ok(source.includes(token), token)
  assert.match(source, /const go = handler => \(\) => \{ close\(\); handler\?\.\(\) \}/)
  assert.doesNotMatch(source, /fetch\(|apiRequest|role="menu"/)
})

test('desktop never wraps the header and long names truncate without hiding full accessible names', () => {
  const css = readFileSync(new URL('../src/swimmer-header.css', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/swimmer-header.jsx', import.meta.url), 'utf8')
  assert.match(css, /swimmer-header-navigation \{ flex-wrap: nowrap/)
  assert.match(css, /text-overflow: ellipsis/)
  assert.match(css, /max-width: 1100px/)
  assert.match(css, /swimmer-more-panel \{ display: contents/)
  assert.match(source, /aria-label=\{`Öppna min profil: \$\{profile.displayName\}`\}/)
})

test('real swimmer shell wires all existing destinations and assistant brand into the new header', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const header = source.split('\n').find(line => line.includes('<SwimmerHeader'))
  assert.ok(header)
  for (const token of ['planning: onPlanning', 'diary: onDiary', 'strength: onStrengthProgram', 'dryland: onDrylandProgram', 'competitions: onCompetitions', 'community: onCommunity', 'goals: onGoals', 'help: onHelp', 'legal: onLegal', 'onProfile={onProfile}', 'onLogout={onLogout}', 'setAssistantOpen(true)']) assert.ok(header.includes(token), token)
})
