import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('home card is limited to development talks still being prepared', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const selector = source.match(/const latestPendingDevelopmentTalk[\s\S]*?const average/)

  assert.ok(selector, 'development talk selector should exist')
  assert.match(selector[0], /talk\.status === 'draft'/)
})

test('submitting a development talk is single-flight and returns home', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const component = source.match(/function DevelopmentTalkSwimmer[\s\S]*?function Vandningsmastaren/)

  assert.ok(component, 'development talk form should exist')
  assert.match(component[0], /if \(savingRef\.current\) return/)
  assert.match(component[0], /savingRef\.current = true/)
  assert.match(component[0], /nextStatus === 'prepared'\) window\.setTimeout\(onBack, 900\)/)
})
