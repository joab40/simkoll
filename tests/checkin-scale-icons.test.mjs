import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHECKIN_FEELINGS, checkinScaleIcons } from '../shared/checkin-scale-icons.js'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
test('body uses the same five smileys as general feeling, without changing values or labels', () => {
  assert.deepEqual(CHECKIN_FEELINGS.map(item => item.value), [1, 2, 3, 4, 5])
  assert.deepEqual(CHECKIN_FEELINGS.map(item => item.label), ['Tungt', 'Segt', 'Okej', 'Bra', 'Toppen'])
  assert.deepEqual(checkinScaleIcons('body'), CHECKIN_FEELINGS.map(item => item.emoji))
  assert.match(source('src/main.jsx'), /CHECKIN_FEELINGS as FEELINGS/)
})

test('every existing check-in scale has matching icons except the deliberately numeric temperature', () => {
  const matches = [...source('src/main.jsx').matchAll(/\{ key: '([^']+)'[^{}]*kind: 'scale', count: (\d+)/g)]
  assert.ok(matches.length >= 10)
  for (const [, key, count] of matches) {
    const icons = checkinScaleIcons(key)
    if (key === 'temperature') assert.equal(icons, null)
    else { assert.equal(icons.length, Number(count), key); assert.ok(icons.every(icon => typeof icon === 'string' && icon.length > 0), key) }
  }
  assert.equal(checkinScaleIcons('rpe').length, 10)
  assert.equal(checkinScaleIcons('new-unknown-scale'), null)
})

test('race head/focus keeps its calm-to-worried meaning instead of excitement', () => {
  assert.equal(checkinScaleIcons('motivation', { competition: true }).at(-1), '😌')
  assert.notDeepEqual(checkinScaleIcons('motivation', { competition: true }), checkinScaleIcons('motivation'))
  assert.deepEqual(checkinScaleIcons('body', { competition: true }), checkinScaleIcons('body'))
})

test('scale keeps numbered accessible choices and one-click values, including RPE 10', () => {
  const view = source('src/checkin-scale.jsx'), main = source('src/main.jsx'), css = source('src/styles.css')
  assert.match(view, /onClick=\{\(\) => onChange\(index \+ 1\)\}/)
  assert.match(view, /Array.from\(\{ length: count \}/)
  assert.match(view, /icons\?\.length === count/)
  assert.match(view, /aria-label/); assert.match(view, /aria-hidden="true"/)
  assert.match(main, /icons=\{checkinScaleIcons\(question.key, \{ competition: form.competition === true \}\)\}/)
  assert.match(css, /\.scale-10\.checkin-scale-icons \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(view, /request|fetch\(|Spara|Fortsätt/)
})

test('illness choice saves the clicked value immediately only during check-in, not explicit history editing', () => {
  const view = source('src/daily-illness.jsx')
  assert.match(view, /onClick=\{\(\) => choose\(choice.value\)\}/)
  assert.match(view, /if \(!replace\) save\(false, value\)/)
  assert.match(view, /status: selectedStatus, skipped, replace/)
  assert.match(view, /\{replace && <button[^>]*className="primary-button"/)
  assert.doesNotMatch(view, /Spara och fortsätt/)
  assert.match(view, /if \(saving.current\) return/)
  assert.match(view, /disabled=\{busy\}/)
  assert.match(view, /aria-busy=\{busy\}/)
  assert.match(view, /await request\([\s\S]*if \(active.current\) \{ onBusyChange\?\.\(false\); onContinue\(\)/)
})

test('save failures stay on the page; retry retains the actual answer or skip, and back is locked while saving', () => {
  const view = source('src/daily-illness.jsx'), main = source('src/main.jsx')
  assert.match(view, /lastAttempt.current = \{ skipped, status: selectedStatus \}/)
  assert.match(view, /save\(lastAttempt.current.skipped, lastAttempt.current.status\)/)
  assert.match(view, /role="alert"/); assert.match(view, /Försök igen/)
  assert.match(view, /setTimeout\(\(\) => controller.abort\(\), 10000\)/)
  assert.match(view, /finally \{ clearTimeout\(timer\) \}/)
  assert.match(main, /onBusyChange=\{setDailySaving\}/)
  assert.match(main, /className="back-button" disabled=\{dailySaving\}/)
})
