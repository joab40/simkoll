import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('swimmer details use a strength program card and show profile creation date', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')

  assert.match(source, /<section className="strength-program-card">/)
  assert.match(source, /Profil skapad <strong>\{profile\.createdAt/)
  assert.doesNotMatch(source, /<details className="profile-tools strength-program-picker">/)
})

test('swimmer cards include a compact development-goal overview with direct navigation', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')

  assert.match(source, /function SwimmerDevelopmentGoalsCard/)
  assert.match(source, /className="swimmer-development-goals-card"/)
  assert.match(source, /Öppna och redigera →/)
  assert.match(source, /Tidigare mål \(\{previousGoals\.length\}\)/)
  assert.match(source, /onCreateGoal=\{\(profileId\) => openGoalsForProfile\(profileId, '', true\)\}/)
  assert.match(source, /initiallyExpanded=\{goal\.id === initialGoalId \|\| goal\.id === focusedGoalId\}/)
})

test('expanded swimmer cards show a compact planned and completed week', async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ])

  assert.match(source, /function SwimmerCompactWeek/)
  assert.match(source, /<SwimmerCompactWeek training=\{training\} profileId=\{profile\.id\} \/>/)
  assert.match(source, /◆ Planerat/)
  assert.match(source, /✓ Genomfört/)
  assert.match(styles, /\.compact-week-grid/)
})
