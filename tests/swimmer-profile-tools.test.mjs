import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { programKind } from '../shared/program-kind.js'

test('swimmer details keep compact strength assignment while full management has its own page', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const swimmerSection = source.slice(source.indexOf('function Swimmers('), source.indexOf('function PeriodOverview('))

  assert.match(source, /Profil skapad <strong>\{profile\.createdAt/)
  assert.match(source, /function SwimmerStrengthProgramCard/)
  assert.match(source, /className=\{`swimmer-strength-program-card/)
  assert.match(source, /Byt eller ta bort program/)
  assert.match(swimmerSection, /<SwimmerStrengthProgramCard profile=\{profile\}/)
  assert.match(source, /function CoachStrengthPrograms/)
  assert.match(source, /<h2>\{kind\.title\}<\/h2>/)
  assert.match(source, /Tilldela \{kind\.name\}/)
  assert.equal(programKind('strength').title, 'Styrkeprogram')
  assert.equal(programKind('strength').name, 'styrkeprogram')
  assert.match(swimmerSection, /<SwimmerStrengthProgramCard programType="dryland"/)
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
