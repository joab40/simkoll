import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const css = source('competition-entries.css')

test('swimmer event page has its own centered bounded layout, without depending on a coach visit or wrapper', () => {
  assert.match(source('main.jsx'), /import '\.\/competition-entries.css'/)
  assert.match(css, /\.competition-entries \{ width: min\(calc\(100% - 32px\), 960px\)/)
  assert.match(css, /margin: 0 auto/)
  assert.match(css, /max-width: 620px/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(source('competition-entries-qa.jsx'), /import '\.\/competition-entries.css'/)
})

test('competition picker is still a native controlled select with modern styling, keyboard focus and high-contrast fallback', () => {
  assert.match(source('main.jsx'), /<select disabled=\{saving\} value=\{selectedCompetition\} onChange=\{\(event\) => setSelectedCompetition\(event.target.value\)\}/)
  assert.match(css, /\.competition-entries > \.settings-field \{ display: grid/)
  assert.match(css, /min-height: 54px/)
  assert.match(css, /border-radius: 14px/)
  assert.match(css, /select:focus-visible/)
  assert.match(css, /select:disabled/)
  assert.match(css, /forced-colors: active/)
  assert.match(css, /appearance: auto; -webkit-appearance: auto; background-image: none/)
})

test('PM card stays readable on desktop and stacks on small screens; unrelated settings selects are untouched', () => {
  assert.match(css, /competition-pm \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(css, /competition-pm \{ grid-template-columns: minmax\(0, 1fr\)/)
  assert.doesNotMatch(css, /(?:^|\n)\.settings-field|(?:^|\n)select\s*\{/)
})
