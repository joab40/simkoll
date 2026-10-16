import test from 'node:test'
import assert from 'node:assert/strict'
import { coachInfoReadKey, latestCoachMessageId, markCoachMessageRead } from '../src/coach-info.js'

test('latest coach message ignores swimmer replies', () => {
  const messages = [
    { id: 'coach-old', senderRole: 'coach', createdAt: '2026-10-15T10:00:00Z' },
    { id: 'swimmer-new', senderRole: 'swimmer', createdAt: '2026-10-16T12:00:00Z' },
    { id: 'coach-new', senderRole: 'coach', createdAt: '2026-10-16T11:00:00Z' },
  ]
  assert.equal(latestCoachMessageId(messages), 'coach-new')
})

test('opening the yellow envelope stores the latest message as read', () => {
  const values = new Map()
  const storage = { setItem: (key, value) => values.set(key, value) }
  assert.equal(markCoachMessageRead(storage, 'profile-a', 'message-a'), true)
  assert.equal(values.get(coachInfoReadKey('profile-a')), 'message-a')
})

test('read state remains safe when browser storage is unavailable', () => {
  const storage = { setItem: () => { throw new Error('blocked') } }
  assert.equal(markCoachMessageRead(storage, 'profile-a', 'message-a'), false)
  assert.equal(markCoachMessageRead(null, 'profile-a', 'message-a'), false)
})
