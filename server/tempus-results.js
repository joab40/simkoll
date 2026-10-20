const origin = 'https://www.tempusopen.se'

export function parseTempusPage(html) {
  const match = String(html).match(/data-page="([^\"]+)"/)
  if (!match) throw new Error('Tempus-resultaten kunde inte läsas.')
  let page
  try { page = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#(?:0*39|x27);/gi, "'").replace(/&amp;/g, '&').replace(/\\\//g, '/')) } catch { throw new Error('Tempus-resultaten hade ett oväntat format.') }
  if (!page.props || ![page.props.results_short, page.props.results_long].some((list) => Array.isArray(list?.data))) throw new Error('Tempus-resultaten hade ett oväntat format.')
  return page.props
}

function nextPage(list) {
  if (!list) return null
  return list.next_page_url || (!Array.isArray(list.links) && list.links?.next) || (Array.isArray(list.links) ? list.links.find((link) => /next|nästa|&raquo;|»|›/i.test(String(link.label)))?.url : null) || null
}

export async function fetchTempusResults(tempusId, { toDate = new Date().toISOString().slice(0, 10), fetcher = fetch, maxPages = 40, deadline = Date.now() + 25000 } = {}) {
  if (!/^\d{1,12}$/.test(String(tempusId))) throw new Error('Ogiltigt Tempus-ID.')
  const path = `/swimmers/${tempusId}/swimming`
  const initial = new URL(path, origin)
  initial.search = new URLSearchParams({ best_time_only: '0', from_date: '2000-01-01', to_date: toDate }).toString()
  const queue = [initial.href], visited = new Set(), results = new Map(), warnings = new Set()
  let swimmer = {}, pages = 0
  while (queue.length && pages < maxPages && Date.now() < deadline) {
    const address = queue.shift()
    if (visited.has(address)) continue
    visited.add(address); pages += 1
    let props
    try {
      const response = await fetcher(address, { signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - Date.now()))) })
      if (!response.ok) throw new Error(`Tempus svarade HTTP ${response.status}.`)
      props = parseTempusPage(await response.text())
    } catch (error) {
      if (pages === 1) throw error
      warnings.add('En resultatsida kunde inte hämtas. Historiken är ofullständig.')
      continue
    }
    if (pages === 1) swimmer = props.swimmer || {}
    for (const list of [props.results_short, props.results_long]) {
      for (const item of list?.data || []) {
        if (!item.event_name || !item.result_date || !item.swim_time) continue
        const key = JSON.stringify([item.event_name, item.pool_type_name, item.result_date, item.swim_time, item.competition_name])
        results.set(key, item)
      }
      const next = nextPage(list)
      if (next) {
        let target
        try { target = new URL(next, origin) } catch { warnings.add('En sidlänk från Tempus kunde inte läsas.'); continue }
        // Public result links may paginate, but must never cause authenticated
        // server requests to arbitrary hosts or to another swimmer's page.
        if (target.origin !== origin || target.pathname !== path) { warnings.add('En oväntad sidlänk från Tempus utelämnades.'); continue }
        target.searchParams.set('best_time_only', '0')
        target.searchParams.set('from_date', '2000-01-01')
        target.searchParams.set('to_date', toDate)
        if (visited.has(target.href)) warnings.add('Tempus upprepade en sidlänk. Historiken kan vara ofullständig.')
        else if (!queue.includes(target.href)) queue.push(target.href)
      } else if (Number(list?.current_page ?? list?.meta?.current_page) < Number(list?.last_page ?? list?.meta?.last_page)) {
        warnings.add('Tempus anger fler sidor men saknar nästa sidlänk. Historiken är ofullständig.')
      }
    }
  }
  if (queue.length) warnings.add('Tempus-hämtningen nådde sin tids- eller sidgräns. Historiken är ofullständig.')
  return { swimmer, results: [...results.values()], complete: warnings.size === 0, warnings: [...warnings], pages }
}

export const tempusResultRows = (profileId, results) => results.map((item) => ({ profile_id: profileId, event: item.event_name, competition_name: item.competition_name || null, pool: item.pool_type_name || null, result_date: item.result_date, swim_time: item.swim_time, result_time: item.result_time != null && item.result_time !== '' && Number.isFinite(Number(item.result_time)) ? Number(item.result_time) : null, aqua_points: item.aqua_points != null && item.aqua_points !== '' && Number.isFinite(Number(item.aqua_points)) ? Number(item.aqua_points) : null, source: 'tempus', synced_at: new Date().toISOString() }))

export function newTempusBests(rows, previousBest, toDate = new Date().toISOString().slice(0, 10)) {
  const cutoff = new Date(Date.parse(`${toDate}T12:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10)
  const importedBest = new Map()
  for (const row of rows) if (Number.isFinite(row.result_time)) {
    const key = `${row.event}|${row.pool || ''}`
    importedBest.set(key, Math.min(importedBest.get(key) ?? Infinity, row.result_time))
  }
  // Newly recovered historical records must not send old congratulations or
  // earn PB points. Initial imports establish a baseline, not a new record.
  return rows.filter((row) => {
    const key = `${row.event}|${row.pool || ''}`, previous = previousBest.get(key)
    return previous != null && Number.isFinite(row.result_time) && row.result_time < previous && row.result_time === importedBest.get(key) && row.result_date >= cutoff && row.result_date <= toDate
  })
}

export async function storeTempusRows(request, rows) {
  // Batches also support a long, unpaginated history without a 500-result cut-off.
  let saved = 0
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250)
    const result = await request('competition_results?on_conflict=profile_id,event,pool,result_date,swim_time,competition_name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) })
    if (!result.ok) return { saved, ok: false, status: result.status }
    saved += batch.length
  }
  return { saved, ok: true }
}
