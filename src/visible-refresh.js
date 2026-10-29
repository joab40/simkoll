// Each caller owns its refresh loop: nothing is cached across profiles/sessions.
// A focus + visibility event pair must not launch the same request twice.
export function createVisibleRefresh(task, { visible = () => !document.hidden, now = Date.now, minInterval = 1500 } = {}) {
  let pending = null, lastStarted = -Infinity, disposed = false
  return {
    refresh() {
      if (disposed || !visible()) return Promise.resolve()
      if (pending) return pending
      if (now() - lastStarted < minInterval) return Promise.resolve()
      lastStarted = now()
      pending = Promise.resolve().then(() => { if (!disposed && visible()) return task() }).finally(() => { pending = null })
      return pending
    },
    dispose() { disposed = true },
  }
}

export function startVisiblePolling(task, interval = 30000, { target = window, visibilityTarget = document } = {}) {
  const refresh = createVisibleRefresh(task)
  const run = () => { void refresh.refresh().catch(() => {}) }
  run()
  const timer = target.setInterval(run, interval)
  target.addEventListener('focus', run)
  target.addEventListener('simkoll-home-open', run)
  visibilityTarget.addEventListener('visibilitychange', run)
  return () => {
    refresh.dispose()
    target.clearInterval(timer)
    target.removeEventListener('focus', run)
    target.removeEventListener('simkoll-home-open', run)
    visibilityTarget.removeEventListener('visibilitychange', run)
  }
}
