import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchTempusResults, parseTempusPage, tempusResultRows, storeTempusRows, newTempusBests } from '../server/tempus-results.js'
const row = (id = 1) => ({ event_name: '100 m frisim', result_date: `2026-01-${String(id % 28 + 1).padStart(2, '0')}`, swim_time: `${id}:00`, pool_type_name: '25m', result_time: id * 100, competition_name: 'Testtävling' })
const page = (props) => new Response(`<div data-page="${JSON.stringify({ props }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`)
test('Tempus histories with more than 500 results are preserved and stored in bounded batches', async () => {
  const result = await fetchTempusResults('123', { fetcher: async () => page({ results_short: { data: Array.from({ length: 701 }, (_, index) => row(index + 1)) }, results_long: { data: [] } }) })
  assert.equal(result.results.length, 701)
  assert.equal(result.complete, true)
  const batchSizes = []
  const stored = await storeTempusRows(async (_, options) => { batchSizes.push(JSON.parse(options.body).length); return new Response(null, { status: 201 }) }, tempusResultRows('profile', result.results))
  assert.deepEqual(batchSizes, [250, 250, 201])
  assert.equal(stored.saved, 701)
})
test('next-page links for both pools are followed with filters preserved and duplicate results merged', async () => {
  const visited = []
  const result = await fetchTempusResults('123', { fetcher: async (url) => {
    const parsed = new URL(url); visited.push(url)
    assert.equal(parsed.searchParams.get('best_time_only'), '0')
    if (!parsed.searchParams.has('short_page') && !parsed.searchParams.has('long_page')) return page({ results_short: { data: [row(1)], next_page_url: '/swimmers/123/swimming?short_page=2' }, results_long: { data: [], links: { next: '/swimmers/123/swimming?long_page=2' } } })
    return page({ results_short: { data: [row(1), row(parsed.searchParams.has('short_page') ? 2 : 3)] }, results_long: { data: [] } })
  } })
  assert.equal(visited.length, 3)
  assert.equal(result.results.length, 3)
  assert.equal(result.complete, true)
})
test('failed, unsafe and truncated pagination are explicitly incomplete without arbitrary outbound requests', async () => {
  const unsafe = await fetchTempusResults('123', { fetcher: async () => page({ results_short: { data: [row()], next_page_url: 'https://other.invalid/private' } }) })
  assert.equal(unsafe.pages, 1)
  assert.equal(unsafe.complete, false)
  const capped = await fetchTempusResults('123', { maxPages: 1, fetcher: async () => page({ results_short: { data: [row()], next_page_url: '/swimmers/123/swimming?page=2' } }) })
  assert.equal(capped.complete, false)
  let request = 0
  const failed = await fetchTempusResults('123', { fetcher: async () => ++request === 1 ? page({ results_short: { data: [row()], next_page_url: '/swimmers/123/swimming?page=2' } }) : new Response(null, { status: 503 }) })
  assert.equal(failed.complete, false)
  assert.equal(failed.results.length, 1)
  assert.throws(() => parseTempusPage('<html>Login</html>'))
})
test('old records and initial imports do not trigger PB awards; newly discovered faster historical records count in the baseline', () => {
  const previous = new Map([['100 frisim|25m', 6000]])
  const recent = { event: '100 frisim', pool: '25m', result_time: 5900, result_date: '2026-10-18' }
  const old = { ...recent, result_time: 5800, result_date: '2026-01-01' }
  assert.equal(newTempusBests([recent], previous, '2026-10-19').length, 1)
  assert.equal(newTempusBests([old], previous, '2026-10-19').length, 0)
  assert.equal(newTempusBests([recent, old], previous, '2026-10-19').length, 0)
  assert.equal(newTempusBests([recent], new Map(), '2026-10-19').length, 0)
})
