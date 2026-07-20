const NOTIFICATION_ICON = '/icons/padel-192.png'
const NOTIFICATION_BADGE = '/icons/padel-badge-96.png'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Bandeja Boys',
    body: 'C’è un aggiornamento per la prossima partita.',
    url: '/',
    tag: 'bandeja-update',
  }

  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: payload.tag,
    data: { url: payload.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url.startsWith(self.location.origin))
    if (existing) {
      await existing.navigate(destination)
      return existing.focus()
    }
    return self.clients.openWindow(destination)
  })())
})
