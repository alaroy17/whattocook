/* Service worker приложения «Что готовим». Файл генерируется при сборке: __VERSION__ */
const CACHE = 'wtc-app-__VERSION__'
const PRECACHE = "__PRECACHE__"
const BASE = '__BASE__'

self.addEventListener('install', (event) => {
  // Новая версия скачивается в свой кэш и ждёт: страница сама решит, когда переключиться,
  // чтобы не менять код под работающим приложением.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('wtc-app-') && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Навигация: сначала сеть, иначе отдаём сохранённую оболочку приложения.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(BASE, copy))
          return response
        })
        .catch(() => caches.match(BASE).then((hit) => hit || caches.match(request))),
    )
    return
  }

  // Статика с хэшем в имени: отдаём из кэша, при промахе кладём в кэш.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
