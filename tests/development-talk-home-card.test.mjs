import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('home card keeps showing after a development talk is marked prepared', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const selector = source.match(/const latestPendingDevelopmentTalk[\s\S]*?const average/)

  assert.ok(selector, 'development talk selector should exist')
  assert.match(selector[0], /talk\.status !== 'completed'/)
  assert.doesNotMatch(selector[0], /talk\.status === 'draft'/)
})
