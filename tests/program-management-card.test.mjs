import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('program cards use one native, initially closed disclosure with always-mounted children', () => {
  const card = source('program-management-card.jsx')
  assert.match(card, /<details className=.*swimmer-disclosure/)
  assert.match(card, /<SwimmerCardSummary icon=\{icon\} eyebrow=\{eyebrow\} title=\{title\} status=\{status\}/)
  assert.match(card, /open=\{open\}/)
  assert.doesNotMatch(card, /open = true|open &&|fetch\(|request\(|apiRequest|localStorage/)
  assert.match(card, /className="program-management-body">\{children\}/)
})

test('all six coach program sections use the shared card, including active follow-up and both program types', () => {
  const main = source('main.jsx'), start = main.indexOf('function CoachStrengthPrograms('), end = main.indexOf('function CoachPrograms(', start)
  const page = main.slice(start, end)
  for (const heading of ['Redigerbara mallar', 'Per simmare', 'Aktiva program']) assert.match(page, new RegExp(`<ProgramManagementCard[^>]*eyebrow="${heading}"`))
  assert.match(page, /programType === 'dryland' \? 'Bibliotek för landträning'/)
  assert.match(source('strength-program-import.jsx'), /<ProgramManagementCard[^>]*eyebrow="Från fil till program"/)
  assert.match(source('program-bulk-assign.jsx'), /<ProgramManagementCard[^>]*eyebrow="Gruppvis"/)
  const builder = source('strength-program-builder.jsx')
  assert.match(builder, /<ProgramManagementCard[^>]*eyebrow="Bygg av sparade övningar"/)
  assert.match(builder, /open=\{open\} onOpenChange=\{setOpen\}/)
  assert.doesNotMatch(builder, /\{open && <form/)
  assert.match(page, /status && !training && <p className="form-error" role="alert"/)
})

test('compact styling shares chevrons and focus affordances while retaining mobile content width', () => {
  const css = source('program-management-card.css'), shared = source('swimmer-card-summary.css')
  assert.match(css, /\.coach-card.program-management-card[^}]*padding: 0/)
  assert.match(css, /min-height: 64px/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /minmax\(0, 1fr\)/)
  assert.match(shared, /summary:focus-visible/)
  assert.match(shared, /\[open\] > summary::after/)
  assert.match(shared, /prefers-reduced-motion/)
})
