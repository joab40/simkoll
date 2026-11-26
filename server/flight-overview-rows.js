import { analyticsRows } from './analytics-rows.js'

// One reader per overview request. Only queries with identical projections,
// date bounds and filters share a read.
export function createFlightOverviewReader() {
  const pending = new Map()
  return (query, readOne) => {
    const [table, filters] = query.split('?', 2)
    const params = new URLSearchParams(filters)
    const owner = params.get('profile_id').slice(3)
    params.delete('profile_id')
    const key = `${table}?${params}`
    const requests = pending.get(key) ?? []
    if (!requests.length) {
      pending.set(key, requests)
      queueMicrotask(async () => {
        pending.delete(key)
        if (requests.length > 1) {
          params.set('profile_id', `in.(${requests.map(request => request.owner).join(',')})`)
          const fields = params.get('select')
          if (fields !== '*') params.set('select', `${fields},profile_id`)
          params.set('order', `${params.get('order')},profile_id.asc`)
          try {
            const result = await analyticsRows(`${table}?${params}`)
            if (result.ok && !result.truncated) {
              const byOwner = new Map(requests.map(request => [request.owner, []]))
              for (const row of await result.json()) byOwner.get(row.profile_id)?.push(row)
              for (const request of requests) request.resolve(byOwner.get(request.owner))
              return
            }
          } catch {
            // Keep the original per-profile failure handling below.
          }
        }
        // A large or failed batch must not hide usable data for other swimmers.
        for (const request of requests) request.resolve(Promise.resolve().then(request.read))
      })
    }
    return new Promise(resolve => requests.push({ owner, resolve, read: () => readOne(query) }))
  }
}
