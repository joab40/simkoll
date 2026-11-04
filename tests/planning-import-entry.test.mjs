import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const planning = app.slice(app.indexOf('function CoachPlanning('), app.indexOf('function BackupTools('))
const form = readFileSync(new URL('../src/planning-import.jsx', import.meta.url), 'utf8')

test('actual coach planning page renders a working import entry, not just unused import state', () => {
  assert.match(planning, /className="planning-import-launch"/)
  assert.match(planning, /aria-expanded=\{importOpen\} onClick=\{\(\) => setImportOpen\(value => !value\)\}>📊 Importera veckoplanering<\/button>/)
  assert.match(planning, /\{importOpen && <PlanningImport code=\{code\} selectedGroups=\{selectedGroups\}/)
  assert.match(planning, /initialMonday=\{days\[0\]\.key\}/)
  assert.match(planning, /<PlanningImport[^>]*availableGroups=\{availableGroups\}/)
  assert.match(planning, /onClose=\{\(\) => setImportOpen\(false\)\}/)
  assert.match(planning, /onSaved=\{date => \{ selectCycleWeek\(date\); setPlanningRevision\(value => value \+ 1\) \}\}/)
  const navigation = planning.indexOf('aria-label="Planeringsnivå"')
  const launch = planning.indexOf('className="planning-import-launch"')
  const loading = planning.indexOf('{loading ? <p')
  assert.ok(navigation < launch && launch < loading, 'import stays visible below tabs even during planning loading/errors')
})
test('import form sends top-menu groups and explicit ISO weeks before analysis, not only filtering afterwards', () => {
  assert.match(form, /initialMonday/)
  assert.match(form, /planningImportMondays\(Number\(year\), Number\(weekNumber\), Number\(weekCount\)\)/)
  assert.match(form, /groups: selectedGroups, mondays: requestedMondays, useAi: withAi/)
  assert.match(form, /Grupper från planeringsvyn:/)
  for (const label of ['Visad vecka', 'Denna vecka', 'Nästa vecka', 'Välj flera veckor', 'Läs samma urval utan AI']) assert.ok(form.includes(label))
  assert.match(form, /!selectedGroups.length \|\| Boolean\(selectionError\)/)
  assert.doesNotMatch(form, /groups.length \? groups : week.groups/)
  assert.doesNotMatch(form, /PLANNING_GROUPS\[group\]/)
  assert.match(form, /week.groups.map\(group => \(draft.groupLabels \|\| groupLabels\)\[group\] \|\| group\)/)
  assert.match(form, /<table><caption>Planering att granska/)
})
