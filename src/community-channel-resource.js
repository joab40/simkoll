// A component-owned, in-memory resource. No shared/global or persistent cache:
// a different login cannot inherit another user's private messages.
export function createCommunityChannelResource({ request, code, url, onChange, merge = (_current, next) => next }) {
  let state = { data: null, loading: true, refreshing: false, error: '' }, pending = null, controller = null, disposed = false
  const notify = next => { state = next; onChange(state) }
  return {
    activate() { disposed = false },
    refresh({ force = false } = {}) {
      if (disposed) return Promise.resolve()
      if (force) { controller?.abort(); pending = null }
      if (pending) return pending
      const current = new AbortController(); controller = current
      notify({ ...state, refreshing: true })
      const task = Promise.resolve().then(() => {
        if (current.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return request(url, code, { retry: false, signal: current.signal })
      }).then(data => {
        if (!disposed && !current.signal.aborted) notify({ data: merge(state.data, data), loading: false, refreshing: false, error: '' })
        return data
      }, error => {
        if (!disposed && !current.signal.aborted) notify({ ...state, loading: false, refreshing: false, error: error.message })
        throw error
      }).finally(() => { if (pending === task) pending = null })
      pending = task
      return task
    },
    update(updater) { if (!disposed) { controller?.abort(); pending = null; notify({ ...state, data: updater(state.data) }) } },
    dispose() { disposed = true; controller?.abort(); pending = null },
  }
}
