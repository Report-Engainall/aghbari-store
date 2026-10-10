/* Aghbari Commerce: public app-shell cache only; never cache API/customer data. */
const CACHE_PREFIX = 'aghbari-shell-'
const CACHE_NAME = CACHE_PREFIX + 'v1'
const SHELL_URLS = ['/', '/index.html', '/logo.svg', '/manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(SHELL_URLS.map(async path => {
      try {
        const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' })
        if (response.ok && response.type !== 'opaque') await cache.put(path, response)
      } catch {
        // Offline-first install is best-effort; a later successful navigation stores the shell.
      }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/index.html', response.clone())
        }
        return response
      } catch {
        const shell = await caches.match('/index.html') || await caches.match('/')
        return shell || new Response('التطبيق غير متاح دون اتصال. أعد الاتصال وحاول مجدداً.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })())
    return
  }

  // Vite emits content-hashed files in /assets/. Cache these immutable resources and
  // the two small public branding files only. Everything else, including database/API
  // paths, is deliberately left to the browser's normal network path.
  const hashedAsset = url.pathname.startsWith('/assets/')
  const shellStatic = url.pathname === '/logo.svg' || url.pathname === '/manifest.webmanifest'
  if (!hashedAsset && !shellStatic) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    if (cached && hashedAsset) return cached
    try {
      const response = await fetch(request)
      if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone())
      return response
    } catch {
      return cached || new Response('', { status: 503 })
    }
  })())
})
