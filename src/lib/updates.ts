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
/** Пользователь явно нажал «Обновить» — перезагружаемся даже без прежнего контроллера. */
let userRequestedUpdate = false

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
/*
 * Если воркер успел активироваться сам, события controllerchange не будет —
 * страница осталась бы с висящей плашкой. Поэтому есть запасная перезагрузка.
 */
export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload()
    return
  }
  userRequestedUpdate = true
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  // Запасной вариант: событие не пришло — перезагружаемся сами.
  setTimeout(() => {
    if (!reloading) {
      reloading = true
      window.location.reload()
    }
  }, 2500)
}

export function registerServiceWorker(url: string): void {
  if (!('serviceWorker' in navigator)) return

  /*
   * При самой первой установке воркер тоже берёт управление (clients.claim),
   * и без этой проверки страница перезагружалась бы прямо посреди первого визита.
   * Перезагрузка нужна только когда контроллер сменился, то есть при обновлении.
   */
  const hadController = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    if (!hadController && !userRequestedUpdate) return
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
