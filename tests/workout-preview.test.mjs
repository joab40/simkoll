import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { workbookPreviewWorkouts, workoutPreviewContext } from '../shared/workout-preview.js'
import { workoutStartLabel } from '../shared/workout-start.js'

test('start-time labels never render Start art when a full Start prefix is present', () => {
  for (const prefix of ['St ', 'st. ', 'St: ', 'Start ', 'Start: ', 'Starttid: ']) assert.equal(workoutStartLabel(prefix + '1:30'), 'Start 1:30')
})

test('preview uses only selected sheets, current edits and common occasion fields without changing the draft', () => {
  const sheets = [
    { key: 'free', selected: true, draft: { title: 'Frisim ändrat', content: 'Huvudserie\n8 × 100 · Start 1:30', note: 'Utkast', distanceMeters: '4000', durationMinutes: '90', focus: 'f2_frisim', date: '2026-10-28', timeOfDay: 'morning', targetGroups: ['old'] } },
    { key: 'breast', selected: true, draft: { title: 'Bröstsim', content: '6 × 200', distanceMeters: '3000' } },
    { key: 'warmup', selected: false, draft: { title: 'Bara insim', content: '400 valfritt' } },
  ]
  const original = structuredClone(sheets), groups = ['junior', 'ungdom_svart']
  const result = workbookPreviewWorkouts(sheets, { date: '2026-10-29', timeOfDay: 'afternoon', targetGroups: groups })
  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'preview-free')
  assert.equal(result[0].title, 'Frisim ändrat')
  assert.equal(result[0].content, sheets[0].draft.content)
  assert.equal(result[0].note, 'Utkast')
  assert.equal(result[0].distanceMeters, '4000')
  assert.equal(result[1].distanceMeters, '3000') // Not summed to 7 000 m.
  assert.ok(result.every((item) => item.date === '2026-10-29' && item.timeOfDay === 'afternoon'))
  assert.deepEqual(result[0].targetGroups, groups)
  result[0].targetGroups.push('extra'); result[0].title = 'Only preview copy'
  assert.deepEqual(groups, ['junior', 'ungdom_svart'])
  assert.deepEqual(sheets, original)
  assert.deepEqual(workbookPreviewWorkouts(sheets.map((sheet) => ({ ...sheet, selected: false })), {}), [])
})

test('preview context handles missing or invalid dates without crashing or silently rolling them over', () => {
  assert.match(workoutPreviewContext('2026-10-29', 'afternoon'), /torsdag 29 oktober 2026 · Eftermiddag \/ kväll/)
  assert.match(workoutPreviewContext('2026-10-29', 'morning'), /Morgon$/)
  for (const date of ['', null, '2026-02-30', '<script>']) assert.equal(workoutPreviewContext(date, ''), 'Datum inte valt')
})

test('live swimmer view and preview share the same presentation; preview has no save, AI or push request', async () => {
  const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')
  const [main, preview, card, workbook] = await Promise.all(['../src/main.jsx', '../src/workout-preview.jsx', '../src/workout-card.jsx', '../src/workout-workbook-review.jsx'].map(read))
  assert.match(main, /import WorkoutCard, \{ WorkoutContent, WorkoutMeta \} from '\.\/workout-card.jsx'/)
  assert.doesNotMatch(main, /function Workout(Card|Content|Meta)\(/)
  assert.match(preview, /import WorkoutCard from '\.\/workout-card.jsx'/)
  assert.match(preview, /<WorkoutCard[\s\S]*?locked=\{false\} initiallyExpanded/)
  assert.match(card, /useState\(initiallyExpanded\)/)
  assert.doesNotMatch(preview, /apiRequest|\bfetch\s*\(|onPublish|onSubmit|dangerouslySetInnerHTML/)
  assert.match(preview, /sandbox="allow-same-origin"/)
  assert.match(preview, /element.showModal\(\)/)
  assert.match(preview, /onCancel=/)
  assert.match(preview, /frame.addEventListener\('keydown', escape\)/)
  assert.match(preview, /event.key === 'Escape'/)
  assert.match(preview, /frame.removeEventListener\('keydown', escape\)/)
  assert.match(preview, /previousFocus\?\.focus/)
  for (const source of [main, workbook]) assert.match(source, /<button type="button"[^>]*onClick=\{\(\) => setPreviewOpen\(true\)\}>Förhandsgranska som simmare/)
  assert.match(workbook, /workbookPreviewWorkouts\(sheets, \{ date, timeOfDay, targetGroups: groups \}\)/)
})
