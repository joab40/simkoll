import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const css = source('swimmer-card-copy.css')

test('card typography shares a body/status size and a secondary detail size, independently of name/icon sizes', () => {
  assert.match(source('swimmer-card-header.jsx'), /import '\.\/swimmer-card-copy.css'/)
  assert.match(css, /--swimmer-copy-size: 12px; --swimmer-meta-size: 11px/)
  for (const selector of ['swimmer-stars', 'swimmer-attention', 'swimmer-expand-hint', 'swimmer-traffic-reasons', 'swimmer-status', 'swimmer-training-goals']) assert.match(css, new RegExp(selector))
  assert.doesNotMatch(css, /font-size: (?:8|9|10|13|14|15|16)px/)
  assert.match(css, /swimmer-training-goals > \.eyebrow[^}]*letter-spacing: 0; text-transform: none/)
  assert.match(css, /swimmer-speed > small \{ font-size: var\(--swimmer-copy-size\)/)
  assert.match(css, /swimmer-speed > \.speed-age \{ font-size: var\(--swimmer-meta-size\)/)
})

test('planning information is a compact scoped note, retaining its distinction from health follow-up', () => {
  const main = source('main.jsx')
  assert.match(main, /traffic.planningNotes\?\.length > 0 && <p className="swimmer-planning-note"/)
  assert.match(main, /<strong>Planering: <\/strong>\{traffic.planningNotes.join\(' · '\)\}/)
  assert.match(main, /<small>Påverkar inte hälsotrafikljuset\.<\/small>/)
  assert.match(css, /\.swimmer-card-details \.swimmer-planning-note \{[^}]*font-size: var\(--swimmer-copy-size\)/)
  assert.doesNotMatch(css, /\.checkin-selection-note/)
  assert.match(main, /signalReasons.join\(' · '\)/)
  assert.match(main, /swimmer-status \$\{status\[0\]\}/)
})

test('narrow cards keep aligned padding and stack training targets without altering values or form controls', () => {
  assert.match(css, /@container \(max-width: 430px\)/)
  assert.match(css, /\.swimmer-card-details \{ padding: 0 16px 16px/)
  assert.match(css, /swimmer-training-goals > div \{ grid-template-columns: 1fr/)
  assert.match(source('swimmer-training-goals.jsx'), /goal.target/)
  assert.match(source('swimmer-training-goals.jsx'), /onSubmit=\{event => \{ event.preventDefault\(\); onSave\(\)/)
})
