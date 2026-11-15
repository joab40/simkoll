import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://swimmer-assistant-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'legacy-only'
const { default: handler } = await import('../api/workouts.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const body = { action: 'swimmer-assistant-preview', profileId: '11111111-1111-4111-8111-111111111111', period: '28', categories: ['load'] }
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })

test('actual workouts route denies ordinary coaches and legacy/shared access before any data read', async () => {
  globalThis.fetch = async () => { throw new Error('No swimmer data or OpenAI read expected') }
  for (const code of ['legacy-only', '', createCoachToken({ id: 'coach-1', role: 'coach' })]) {
    const result = response()
    await coachSessionFixture(handler)({ method: 'POST', body, headers: { 'x-simkoll-code': code } }, result)
    assert.equal(result.code, 403)
  }
})

test('actual route rejects revoked sessions even when their token says head coach', async () => {
  globalThis.fetch = async url => {
    assert(String(url).includes('coach_accounts?'))
    return new Response('[]', { status: 200 })
  }
  const result = response()
  await handler({ method: 'POST', body, headers: { 'x-simkoll-code': createCoachToken({ id: 'revoked', role: 'head_coach' }) } }, result)
  assert.equal(result.code, 401)
})
