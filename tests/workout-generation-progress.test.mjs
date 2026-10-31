import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('generation animation is rendered only while generating, with a live status and disabled submit', () => {
  const source = readFileSync(new URL('../src/workout-generator.jsx', import.meta.url), 'utf8')
  assert.match(source, /generating && <span className="workout-generation-spinner" aria-hidden="true"/)
  assert.match(source, /generating \? 'Skapar passförslag…'/)
  assert.match(source, /aria-busy=\{generating\} disabled=\{generating \|\| !generator.groups.length\}/)
  assert.match(source, /role="status" aria-live="polite"/)
  assert.match(source, /inget publiceras automatiskt/)
  assert.match(source, /disabled=\{generating\} onClick=\{onClose\}/)
})

test('entry button shows the same in-progress state; duplicate requests and failures remain guarded', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /aria-expanded=\{generatorOpen\} aria-busy=\{generating\} disabled=\{generating\}/)
  assert.match(main, /<WorkoutGenerationButtonContent generating=\{generating\} idleLabel="✨ Skapa passförslag"/)
  assert.match(main, /if \(generatingRef.current\) return/)
  assert.match(main, /finally \{ generatingRef.current = false; setGenerating\(false\) \}/)
})

test('spinner respects reduced motion and stays legible on a disabled button', () => {
  const css = readFileSync(new URL('../src/workout-generation-progress.css', import.meta.url), 'utf8')
  assert.match(css, /animation: workout-generation-spin/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation: none/)
  assert.match(css, /is-generating \{ cursor: wait; opacity: 1;/)
})
