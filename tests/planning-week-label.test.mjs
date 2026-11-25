import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isoWeek } from '../shared/planning-import.js'
import { planningAddDays } from '../shared/weekly-planning.js'

test('viewed planning week follows the selected Monday forwards, backwards and across ISO years', () => {
  const monday = '2026-11-09'
  for (const [offset, week, year] of [[0, 46, 2026], [7, 47, 2026], [-7, 45, 2026], [56, 1, 2027]]) {
    assert.deepEqual(isoWeek(planningAddDays(monday, offset)), { week, year })
  }
  assert.deepEqual(isoWeek('2026-12-28'), { week: 53, year: 2026 })
  assert.deepEqual(isoWeek('2027-01-04'), { week: 1, year: 2027 })
})

test('actual planning navigation labels the selected week, not today, and announces changes', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const label = readFileSync(new URL('../src/planning-week-label.jsx', import.meta.url), 'utf8')
  assert.match(main, /planningView === 'week' && <>\s+<PlanningWeekLabel monday=\{weekStart\} \/>/)
  assert.match(main, /const weekStart = dateKey\(monday\)/)
  assert.match(main, /planningView !== 'week' && <small>Nu: vecka/)
  assert.match(label, /isoWeek\(monday\)/)
  assert.match(label, /Visar vecka \{week\} · \{year\}/)
  assert.match(label, /planningAddDays\(monday, 6\)/)
  assert.match(label, /role="status" aria-live="polite" aria-atomic="true"/)
})
