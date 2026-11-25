import test from 'node:test'
import assert from 'node:assert/strict'
import { canSeeCoachCard, coachCategory } from '../shared/coach-card-categories.js'

process.env.SUPABASE_URL = 'https://coach-categories-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-database-key'
process.env.COACH_SESSION_SECRET = 'test-coach-card-secret'
process.env.SIMKOLL_SWIMMER_CODE = 'test-swimmer'
process.env.SIMKOLL_COACH_CODE = 'test-group-coach'
const { default: handler } = await import('../api/auth.js')
const { createCoachToken } = await import('../server/coach-auth.js')

test('coach layouts start at Bas and higher categories include lower ones', () => {
  assert.equal(coachCategory(undefined), 'bas')
  const categories = ['bas', 'pro', 'exp']
  assert.deepEqual(categories.map(view => categories.filter(card => canSeeCoachCard(view, card))), [
    ['bas'], ['bas', 'pro'], ['bas', 'pro', 'exp'],
  ])
  assert.equal(canSeeCoachCard('pro', undefined), true)
})

test('card editing requires both superadmin and Exp, while superadmin can always change the account view', async (t) => {
  const admin = { id: '11111111-1111-4111-8111-111111111111', role: 'superadmin', view_category: 'bas' }
  const coach = { id: '22222222-2222-4222-8222-222222222222', role: 'coach', view_category: 'bas' }
  const cards = new Map([['another.setting', 'pro']])
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let adminActive = true
  const json = value => new Response(JSON.stringify(value), { status: 200 })
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    const params = url.searchParams
    if (url.pathname.endsWith('/coach_accounts')) {
      const account = [admin, coach].find(row => params.get('id') === `eq.${row.id}`)
      if (params.has('session_version')) {
        return json(account && (account !== admin || adminActive) && params.get('role') === `eq.${account.role}` ? [{ id: account.id }] : [])
      }
      if (options.method === 'PATCH' && account) Object.assign(account, JSON.parse(options.body))
      return json(account ? [{ id: account.id, view_category: account.view_category }] : [])
    }
    if (url.pathname.endsWith('/app_settings')) {
      if (options.method === 'POST') {
        assert.equal(params.get('on_conflict'), 'setting_key')
        assert.match(options.headers.Prefer, /resolution=merge-duplicates/)
        const row = JSON.parse(options.body)
        cards.set(row.setting_key, row.setting_value)
      }
      return json([...cards].map(([setting_key, setting_value]) => ({ setting_key, setting_value })))
    }
    if (url.pathname.endsWith('/audit_logs')) return json(null)
    throw new Error(`Unexpected data request ${url.pathname}`)
  }
  const adminCode = createCoachToken(admin, 600)
  const coachCode = createCoachToken(coach, 600)
  async function request(code, action, payload) {
    const response = { setHeader() {}, status(status) { this.statusCode = status; return this }, json(body) { this.body = body } }
    await handler({ method: 'POST', headers: { 'x-simkoll-code': code }, body: { action, ...payload } }, response)
    return response
  }
  const cardEdit = { cardId: 'attendance', category: 'exp' }
  const coachEdit = { accountId: coach.id, category: 'pro' }
  assert.equal((await request(coachCode, 'coach-set-card-category', cardEdit)).statusCode, 403)
  assert.equal((await request(coachCode, 'coach-set-view-category', coachEdit)).statusCode, 403)
  assert.equal((await request('test-swimmer', 'coach-card-layout')).statusCode, 403)
  assert.equal((await request(adminCode, 'coach-set-card-category', cardEdit)).statusCode, 403)
  assert.equal((await request(adminCode, 'coach-set-view-category', { accountId: admin.id, category: 'pro' })).statusCode, 200)
  assert.equal((await request(adminCode, 'coach-set-card-category', cardEdit)).statusCode, 403)
  assert.equal((await request(adminCode, 'coach-set-view-category', { accountId: admin.id, category: 'exp' })).body.ownAccount, true)
  assert.equal((await request(adminCode, 'coach-set-card-category', { ...cardEdit, cardId: 'unknown' })).statusCode, 400)
  assert.equal((await request(adminCode, 'coach-set-view-category', { ...coachEdit, category: ['pro'] })).statusCode, 400)
  assert.equal((await request(adminCode, 'coach-set-card-category', cardEdit)).statusCode, 200)
  assert.equal((await request(adminCode, 'coach-set-card-category', { cardId: 'lane-usage', category: 'pro' })).statusCode, 200)
  assert.deepEqual((await request(adminCode, 'coach-set-view-category', coachEdit)).body, {
    account: { id: coach.id, view_category: 'pro' }, ownAccount: false,
  })
  const layout = (await request(coachCode, 'coach-card-layout', { accountId: admin.id })).body
  assert.deepEqual(layout, { accountId: coach.id, category: 'pro', cards: { attendance: 'exp', 'lane-usage': 'pro' } })
  assert.equal((await request('test-group-coach', 'coach-card-layout')).body.category, 'bas')
  assert.equal((await request(adminCode, 'coach-card-layout')).body.category, 'exp')
  assert.equal((await request(adminCode, 'coach-set-view-category', { accountId: coach.id, category: 'exp' })).statusCode, 200)
  assert.equal((await request(coachCode, 'coach-set-card-category', cardEdit)).statusCode, 403)
  assert.equal((await request(adminCode, 'coach-set-view-category', { accountId: admin.id, category: 'bas' })).statusCode, 200)
  assert.equal((await request(adminCode, 'coach-set-card-category', cardEdit)).statusCode, 403)
  assert.equal(admin.role, 'superadmin')
  adminActive = false
  assert.equal((await request(adminCode, 'coach-set-card-category', cardEdit)).statusCode, 401)
})
