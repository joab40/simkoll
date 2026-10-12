import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('home card is limited to development talks still being prepared', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const selector = source.match(/const latestPendingDevelopmentTalk[\s\S]*?const average/)

  assert.ok(selector, 'development talk selector should exist')
  assert.match(selector[0], /talk\.status === 'draft'/)
})
