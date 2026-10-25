// Native fullscreen where available; immersive CSS mode on e.g. phones
// without element fullscreen support. Never exit another element's session.
export async function enterBalanceFullscreen(target, doc) {
  const request = target.requestFullscreen || target.webkitRequestFullscreen
  if (request) {
    try {
      await request.call(target)
      if ((doc.fullscreenElement || doc.webkitFullscreenElement) === target) return 'native'
    } catch { /* A denied/unsupported native request still has a usable fallback. */ }
  }
  return 'immersive'
}

export async function exitBalanceFullscreen(target, doc) {
  if (!target) return
  if (doc.fullscreenElement === target) await doc.exitFullscreen()
  else if (doc.webkitFullscreenElement === target) await doc.webkitExitFullscreen?.()
}
