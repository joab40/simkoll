// Each caller owns its refresh loop: nothing is cached across profiles/sessions.
// A focus + visibility event pair must not launch the same request twice.
export function createVisibleRefresh(task, { visible = () => !document.hidden, now = Date.now, minInterval = 1500, errorInterval = 0, maxErrorInterval = 1800000 } = {}) {
  let pending = null, lastStarted = -Infinity, disposed = false, failures = 0, retryAt = -Infinity
  return {
    refresh() {
      if (disposed || !visible()) return Promise.resolve()
      if (pending) return pending
      if (now() < retryAt || now() - lastStarted < minInterval) return Promise.resolve()
      lastStarted = now()
      pending = Promise.resolve().then(() => { if (!disposed && visible()) return task() }).then((result) => {
        failures = 0; retryAt = -Infinity
        return result
      }, (error) => {
        failures += 1
        retryAt = now() + Math.min(maxErrorInterval, errorInterval * 2 ** Math.min(failures - 1, 20))
        throw error
      }).finally(() => { pending = null })
      return pending
    },
    dispose() { disposed = true },
  }
}

export function startVisiblePolling(task, interval = 30000, { target = window, visibilityTarget = document, now = Date.now, events = ['focus', 'simkoll-home-open'] } = {}) {
  const refresh = createVisibleRefresh(task, { visible: () => !visibilityTarget.hidden, now, errorInterval: interval })
  const run = () => { void refresh.refresh().catch(() => {}) }
  run()
  const timer = target.setInterval(run, interval)
  events.forEach(event => target.addEventListener(event, run))
  visibilityTarget.addEventListener('visibilitychange', run)
  return () => {
    refresh.dispose()
    target.clearInterval(timer)
    events.forEach(event => target.removeEventListener(event, run))
    visibilityTarget.removeEventListener('visibilitychange', run)
  }
}
