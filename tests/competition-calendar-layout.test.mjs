import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('add competition disclosure avoids nested padding while keeping a 44px keyboard-focusable trigger', () => {
  const css = readFileSync(new URL('../src/competition-calendar.css', import.meta.url), 'utf8')
  const view = readFileSync(new URL('../src/competition-calendar.jsx', import.meta.url), 'utf8')
  assert.match(css, /\.competition-calendar-v2 > \.competition-add-card \{[^}]*padding: 0/)
  assert.match(css, /\.competition-calendar-v2 > \.competition-add-card > summary \{[^}]*min-height: 44px/)
  assert.match(css, /summary:focus-visible \{[^}]*outline: 2px/)
  assert.match(view, /<details className="competition-add-card" open=\{open\} onToggle=/)
  assert.match(view, /<summary>\{form.id \? 'Redigera tävling' : '＋ Lägg till tävling'\}<\/summary>/)
})
