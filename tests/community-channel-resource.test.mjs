import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCommunityChannelResource } from '../src/community-channel-resource.js'
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('focus/poll reads are deduplicated, without timestamp cache-busting or hidden shared caches', async () => {
  const pending = deferred(), states = [], calls = []
  const resource = createCommunityChannelResource({ code: 'coach-A', url: '/api/community?openChat=true', onChange: state => states.push(state), request: async (...args) => { calls.push(args); return pending.promise } })
  const a = resource.refresh(), b = resource.refresh()
  assert.equal(a, b); await Promise.resolve(); assert.equal(calls.length, 1)
  assert.equal(calls[0][1], 'coach-A'); assert.equal(calls[0][2].retry, false)
  pending.resolve({ openChat: { messages: [] } }); await a
  assert.equal(states.at(-1).loading, false); assert.equal(states.at(-1).error, '')
})

test('switching back to a recently fetched tab reuses its data until refresh is needed', async () => {
  let reads = 0
  const resource = createCommunityChannelResource({ code: 'demo', url: 'club', onChange() {}, request: async () => ({ reads: ++reads }) })
  await resource.refresh()
  assert.deepEqual(await resource.refresh({ maxAge: 10000 }), { reads: 1 })
  resource.invalidate()
  assert.equal(reads, 1, 'invalidating an inactive tab does not fetch')
  assert.deepEqual(await resource.refresh({ maxAge: 10000 }), { reads: 2 })
})

test('unmounted and old account requests cannot publish stale private data, even when the transport ignores abort', async () => {
  const old = deferred(), states = [], nextStates = []
  const resource = createCommunityChannelResource({ code: 'coach-A', url: 'private', onChange: state => states.push(state), request: () => old.promise })
  const pending = resource.refresh(); await Promise.resolve(); resource.dispose()
  const next = createCommunityChannelResource({ code: 'coach-B', url: 'private', onChange: state => nextStates.push(state), request: async () => ({ messages: ['B only'] }) })
  await next.refresh(); old.resolve({ messages: ['A SECRET'] }); await pending
  assert(!states.some(state => state.data)); assert(!JSON.stringify(nextStates).includes('A SECRET'))
  assert.deepEqual(nextStates.at(-1).data.messages, ['B only'])
})

test('mutations cancel older poll snapshots; forced refresh cannot be overwritten by an earlier response', async () => {
  const reads = [deferred(), deferred()], states = []; let count = 0
  const resource = createCommunityChannelResource({ code: 'coach', url: 'club', onChange: state => states.push(state), request: () => reads[count++].promise })
  const old = resource.refresh(); await Promise.resolve()
  resource.update(() => ({ items: ['new post'] }))
  const current = resource.refresh({ force: true }); await Promise.resolve()
  reads[1].resolve({ items: ['new post', 'latest'] }); await current
  reads[0].resolve({ items: ['old snapshot'] }); await old
  assert.deepEqual(states.at(-1).data.items, ['new post', 'latest'])
})

test('failed background refresh preserves last data and supports retry; StrictMode restart works', async () => {
  const states = []; let fail = false
  const resource = createCommunityChannelResource({ code: 'coach', url: 'info', onChange: state => states.push(state), request: async () => { if (fail) throw new Error('offline'); return { safe: true } } })
  await resource.refresh(); fail = true
  await assert.rejects(resource.refresh())
  assert.deepEqual(states.at(-1).data, { safe: true }); assert.equal(states.at(-1).error, 'offline')
  resource.dispose(); resource.activate(); fail = false; await resource.refresh()
  assert.equal(states.at(-1).error, '')
})

test('coach and swimmer club feeds share presentation, but not private inboxes or permissions', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const coach = readFileSync(new URL('../src/coach-messages.jsx', import.meta.url), 'utf8')
  const info = readFileSync(new URL('../src/open-chat-panel.jsx', import.meta.url), 'utf8')
  assert.match(main, /<CoachMessages key=\{code\}/)
  assert.doesNotMatch(main, /function CoachCommunity\(/)
  const swimmer = readFileSync(new URL('../src/swimmer-community.jsx', import.meta.url), 'utf8')
  assert.match(swimmer, /<PeppChannelPanel items=\{items\}/)
  assert.match(coach, /<PeppChannelPanel coach/)
  assert.match(coach, /visited\.includes\('club'\)/)
  assert.match(coach, /active=\{tab === 'club'\}/)
  assert.doesNotMatch(coach, /sessionStorage|polish-community-post/)
  assert.match(coach, /localStorage.setItem\(storagePrefix \+ key, JSON.stringify\(cursor\)\)/)
  assert.match(info, /key=\{`\$\{props.code\}:\$\{props.coach/)
  assert.match(coach, /Skriv RADERA/)
})
