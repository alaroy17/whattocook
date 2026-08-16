/**
 * Обновление установленного PWA.
 *
 * Каждая сборка кладёт файлы в кэш с новым именем (`wtc-app-<метка сборки>`), а старые
 * версии удаляются при активации. Но установленное приложение может неделями работать
 * на старом коде, поэтому здесь: периодическая проверка обновлений, уведомление приложения
 * и переключение на новую версию по нажатию пользователя.
 */

let listener: ((ready: boolean) => void) | null = null
let waitingWorker: ServiceWorker | null = null
let reloading = false

export function onUpdateReady(callback: (ready: boolean) => void): () => void {
  listener = callback
  callback(Boolean(waitingWorker))
  return () => {
    listener = null
  }
}

function announce(worker: ServiceWorker | null) {
  waitingWorker = worker
  listener?.(Boolean(worker))
}

/** Переключиться на скачанную версию: сообщаем воркеру и перезагружаем страницу. */
export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload()
    return
  }
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
}

export function registerServiceWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Новый воркер взял управление — перезагружаемся один раз, чтобы код и кэш совпали.
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(url)
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          announce(registration.waiting)
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            // Есть контроллер — значит это обновление, а не первая установка.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              announce(installing)
            }
          })
        })

        const check = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', check)
        // Приложение может быть открыто сутками — проверяем и по таймеру.
        setInterval(check, 60 * 60 * 1000)
      })
      .catch(() => {
        /* офлайн-режим просто не включится */
      })
  })
}
