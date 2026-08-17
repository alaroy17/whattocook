/**
 * Установка приложения на телефон.
 *
 * Браузер предлагает установку сам, но кнопку прячет в меню — второй человек
 * её попросту не нашёл. Поэтому перехватываем событие готовности к установке
 * и показываем свою кнопку внутри приложения.
 *
 * Событие прилетает один раз и рано, поэтому слушатель ставится в main.tsx
 * до отрисовки, а результат хранится здесь.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Без preventDefault Chrome покажет свою мини-плашку и событие пропадёт.
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Приложение уже открыто как установленное — предлагать установку незачем. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone и iPad: кнопки установки в браузере нет, только «Поделиться». */
export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function canPrompt(): boolean {
  return deferred !== null
}

/** Показывает системное окно установки. true — человек согласился. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  const choice = await event.userChoice
  return choice.outcome === 'accepted'
}
