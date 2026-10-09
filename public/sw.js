// Only notifications: never cache HTML, API responses or signed-in user data.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Simkoll', {
    body: payload.body || 'Du har fått ett nytt meddelande. Öppna Simkoll för att läsa.',
    icon: '/assets/simkoll-192.png', badge: '/assets/simkoll-192.png',
    tag: payload.tag || 'simkoll-message',
    data: { screen: payload.screen || 'home', ownerKey: payload.ownerKey || '' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { screen, ownerKey } = event.notification.data || {}
  const query = new URLSearchParams({ push: screen || 'home', pushOwner: ownerKey || '' })
  const url = `${self.location.origin}/?${query}`
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin)
    if (client) {
      client.postMessage({ type: 'simkoll-push-open', screen, ownerKey })
      return client.focus()
    }
    return self.clients.openWindow(url)
  })())
})
