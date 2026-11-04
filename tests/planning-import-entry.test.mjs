import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const planning = app.slice(app.indexOf('function CoachPlanning('), app.indexOf('function BackupTools('))

test('actual coach planning page renders a working import entry, not just unused import state', () => {
  assert.match(planning, /className="planning-import-launch"/)
  assert.match(planning, /aria-expanded=\{importOpen\} onClick=\{\(\) => setImportOpen\(value => !value\)\}>📊 Importera veckoplanering<\/button>/)
  assert.match(planning, /\{importOpen && <PlanningImport code=\{code\} selectedGroups=\{selectedGroups\}/)
  assert.match(planning, /onClose=\{\(\) => setImportOpen\(false\)\}/)
  assert.match(planning, /onSaved=\{date => \{ selectCycleWeek\(date\); setPlanningRevision\(value => value \+ 1\) \}\}/)
  const navigation = planning.indexOf('aria-label="Planeringsnivå"')
  const launch = planning.indexOf('className="planning-import-launch"')
  const loading = planning.indexOf('{loading ? <p')
  assert.ok(navigation < launch && launch < loading, 'import stays visible below tabs even during planning loading/errors')
})
