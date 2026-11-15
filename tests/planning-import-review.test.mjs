import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unresolvedPlanningRows } from '../shared/planning-import.js'

const row = calendarByGroup => ({ date: '2026-11-23', title: 'Fart', calendarByGroup })
const week = (sessions, selected = true) => ({ selected, groups: ['junior', 'ungdom_svart'], sessions })

test('review lists only selected weeks and preserves original indexes for opening closed rows', () => {
  assert.deepEqual(unresolvedPlanningRows([
    week([row({ junior: 'unresolved', ungdom_svart: 'none' })], false),
    week([row({ junior: 'linked', ungdom_svart: 'none' }), row({ junior: 'unresolved', ungdom_svart: 'unresolved' })]),
  ]), [{ weekIndex: 1, rowIndex: 1, groups: ['junior', 'ungdom_svart'] }])
})
test('missing per-group mappings are actionable, resolved choices are never overwritten', () => {
  const weeks = [week([row({ junior: 'linked' }), row(undefined)])]
  const before = structuredClone(weeks)
  assert.deepEqual(unresolvedPlanningRows(weeks), [
    { weekIndex: 0, rowIndex: 0, groups: ['ungdom_svart'] },
    { weekIndex: 0, rowIndex: 1, groups: ['junior', 'ungdom_svart'] },
  ])
  assert.deepEqual(weeks, before)
})
test('explicit no-calendar and linked choices both allow review, removed groups do not block', () => {
  assert.deepEqual(unresolvedPlanningRows([week([row({ junior: 'linked', ungdom_svart: 'none', removed: 'unresolved' })])]), [])
  assert.deepEqual(unresolvedPlanningRows([]), [])
})
test('review action guides unresolved calendars instead of silently disabling and still gates preview', () => {
  const source = readFileSync(new URL('../src/planning-import.jsx', import.meta.url), 'utf8')
  assert.match(source, /if \(pendingRows.length\) \{ setCalendarReviewAttempted\(true\); showCalendarChoice\(pendingRows\[0\]\); return \}/)
  assert.match(source, /disabled=\{!chosen.length\}[^>]*onClick=\{inspectChanges\}/)
  assert.match(source, /row.closest\('\.planning-import-week-content'\).open = true/)
  assert.match(source, /row.open = true/)
  assert.match(source, /select\[aria-invalid="true"\]/)
  assert.match(source, /ref=\{previewRef\} tabIndex=\{-1\}/)
})
