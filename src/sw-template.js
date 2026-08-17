/* Service worker приложения «Что готовим». Файл генерируется при сборке: __VERSION__ */
const CACHE = 'wtc-app-__VERSION__'
const PRECACHE = "__PRECACHE__"
const BASE = '__BASE__'

self.addEventListener('install', (event) => {
  // Новая версия скачивается в свой кэш и ждёт: страница сама решит, когда переключиться,
  // чтобы не менять код под работающим приложением. cache: 'reload' — мимо HTTP-кэша,
  // иначе в прекэш мог попасть залежавшийся index.html и «Обновить» давало старую оболочку.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      /*
       * По одному файлу: cache.addAll атомарен, и единственный недокачанный
       * ассет отменял установку целиком — офлайн-режим молча не включался.
       * Оболочка обязательна, остальное — как получится.
       */
      Promise.all(
        PRECACHE.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((response) => (response.ok ? cache.put(url, response) : null))
            .catch(() => null),
        ),
      ).then(() =>
        caches.match(BASE).then((hit) => {
          if (!hit) throw new Error('Не удалось сохранить оболочку приложения')
        }),
      ),
    ),
  )
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
          // Ошибочный ответ (404 в окно выкладки, 5xx) кэшировать нельзя:
          // он перезаписал бы рабочую оболочку, и офлайн-запуск открывал бы страницу ошибки.
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(BASE, copy))
          }
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
