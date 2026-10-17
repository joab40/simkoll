import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { COACH_MENU_FEATURES, COACH_NAV_ITEMS } from '../shared/coach-navigation.js'

test('strength programs have their own configurable coach view', () => {
  const item = COACH_NAV_ITEMS.find(({ key }) => key === 'strength-programs')

  assert.deepEqual(item, { key: 'strength-programs', label: 'Styrkeprogram', mobile: 'Styrka' })
  assert.deepEqual(COACH_MENU_FEATURES.find(([key]) => key === 'strength-programs'), ['strength-programs', 'Styrkeprogram'])
})

test('strength library, import and swimmer assignments live on the dedicated page', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const programsStart = source.indexOf('function CoachPrograms(')
  const programsEnd = source.indexOf('const FEEDBACK_OPTIONS', programsStart)
  const ordinaryPrograms = source.slice(programsStart, programsEnd)

  assert.match(source, /function CoachStrengthPrograms/)
  assert.match(source, /<StrengthProgramImport/)
  assert.match(source, /<StrengthProgramLibrary/)
  assert.match(source, /className="coach-card strength-assignment-manager"/)
  assert.doesNotMatch(ordinaryPrograms, /<StrengthProgramImport/)
  assert.doesNotMatch(ordinaryPrograms, /<StrengthProgramLibrary/)
  assert.match(ordinaryPrograms, /assignment\.program\.type !== 'strength'/)
})

test('ordinary signed-in coaches cannot manage the shared strength library', async () => {
  const source = await readFile(new URL('../api/training.js', import.meta.url), 'utf8')

  assert.match(source, /const canManageStrengthPrograms = !coachAccount \|\| \['head_coach', 'superadmin'\]\.includes\(coachAccount\.role\)/)
  assert.match(source, /type === 'strength' && !canManageStrengthPrograms/)
  assert.match(source, /action === 'update-program'[\s\S]*?!canManageStrengthPrograms/)
})
