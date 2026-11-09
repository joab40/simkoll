import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('expanded swimmer panels have distinct keys, never the same bare profile ID', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const details = main.slice(main.indexOf('{isExpanded && <div className="swimmer-card-details">'), main.indexOf('function PeriodOverview'))
  const keys = [...details.matchAll(/\bkey=\{(`[^`]*\$\{profile\.id\}[^`]*`|profile\.id)\}/g)].map(match => match[1])
  assert.deepEqual(keys, ['`periodization-${profile.id}`', '`illness-${profile.id}`', '`game-beta-${profile.id}`'])
  assert.equal(new Set(keys).size, keys.length, 'duplicate sibling keys can leave orphan DOM when conditional status cards change')
  assert.equal((details.match(/<SwimmerPeriodization\b/g) || []).length, 1)
})
