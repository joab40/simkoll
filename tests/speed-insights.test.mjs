import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { redactSpeedInsightsUrl } from '../shared/speed-insights.js'

test('performance events strip all URL parameters, fragments and credentials without changing metrics', () => {
  const event = { url: 'https://user:secret@www.simkoll.app/?push=private&pushOwner=profile-id#reset=secret-token', type: 'vital', value: 45 }
  assert.deepEqual(redactSpeedInsightsUrl(event), { ...event, url: 'https://www.simkoll.app/' })
  assert.match(event.url, /secret-token/, 'the original event must not be mutated')
  assert.equal(redactSpeedInsightsUrl({ url: 'https://www.simkoll.app/path' }).url, 'https://www.simkoll.app/path')
  for (const url of ['not a URL?token=secret', '', undefined, 'javascript:secret', 'data:text/plain,secret']) {
    assert.equal(redactSpeedInsightsUrl({ url }), null)
  }
})

test('Speed Insights is mounted once alongside App, outside login and coach early returns, in production only', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /import \{ SpeedInsights \} from '@vercel\/speed-insights\/react'/)
  assert.ok(main.includes("createRoot(document.getElementById('root')).render(<><App />{import.meta.env.PROD && <SpeedInsights beforeSend={redactSpeedInsightsUrl} />}</>)"))
  assert.equal((main.match(/<SpeedInsights\b/g) || []).length, 1)
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(pkg.dependencies['@vercel/speed-insights'], '2.1.0')
  assert.equal(lock.packages['node_modules/@vercel/speed-insights'].version, '2.1.0')
})
