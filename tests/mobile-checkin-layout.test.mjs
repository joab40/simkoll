import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')

test('ten-point scales describe numbered endpoints above all rows, not under value six',()=>{
  const view=source('src/checkin-scale.jsx')
  assert.match(view,/count === 10 && <div className="scale-endpoints"><span>1 = \{left\}<\/span><span>\{count\} = \{right\}/)
  assert(view.indexOf('className="scale-endpoints"')<view.indexOf('Array.from'))
  assert.match(view,/count !== 10 && <div className="scale-labels"/)
  assert.match(view,/onClick=\{\(\) => onChange\(index \+ 1\)\}/)
  assert.match(source('src/styles.css'),/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.scale-grid button:hover/)
})
test('whole and partial are equal grid columns without the stale full-row last-child override',()=>{
  const css=source('src/styles.css')
  assert.match(css,/\.checkin-completion-choice \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css,/\.checkin-completion-choice \{[^}]*margin: 16px 0 20px/)
  assert.doesNotMatch(css,/\.checkin-completion-choice button:last-child/)
  assert.match(css,/@media \(max-width: 360px\) \{ \.checkin-completion-choice \{ grid-template-columns: minmax\(0, 1fr\)/)
})
test('diary date controls keep native type, limits and submission while stacking on narrow screens',()=>{
  const view=source('src/training-diary.jsx'),css=source('src/training-diary.css')
  assert.match(view,/export function DiaryPeriod/)
  assert.match(view,/<DiaryPeriod draft=\{draft\}[^\n]*onDraft=\{setDraft\} onSubmit=\{\(\) => changeRange\(draft\)\}/)
  assert.match(view,/type="date" required value=\{draft.start\} max=\{draft.end\}/)
  assert.match(view,/type="date" required value=\{draft.end\} min=\{draft.start\} max=\{todayKey\(\)\}/)
  assert.match(css,/\.diary-period input\[type="date"\] \{[^}]*max-width: 100%[^}]*font-size: 16px/)
  assert.match(css,/@media \(max-width: 540px\) \{\s*\.training-diary-page \.diary-period form \{ grid-template-columns: minmax\(0, 1fr\)/)
})
