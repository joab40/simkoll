import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('superadmin can permanently reject only pending coach applications', async () => {
  const [api, client] = await Promise.all([
    readFile(new URL('../api/auth.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(api, /action === 'coach-reject'/)
  assert.match(api, /status=eq\.pending&select=id,email,display_name,status/)
  assert.match(api, /method: 'DELETE'/)
  assert.match(api, /eventType: 'coach_account_rejection'/)
  assert.match(api, /Endast en väntande tränaransökan kan tas bort/)
  assert.match(client, /Ta bort ansökan/)
  assert.match(client, /action: 'coach-reject'/)
  assert.match(client, /'TA BORT'/)
})
