import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('swimmer details use a strength program card and show profile creation date', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')

  assert.match(source, /<section className="strength-program-card">/)
  assert.match(source, /Profil skapad <strong>\{profile\.createdAt/)
  assert.doesNotMatch(source, /<details className="profile-tools strength-program-picker">/)
})
