import { useState } from 'react'
import { useStore } from '../lib/store'
import { IconCloud } from './Icons'
import { toast } from './ui'

/**
 * Приглашение подключить Диск на главном экране.
 *
 * Без него на новом устройстве приложение выглядело так, будто ничего настраивать
 * не нужно: единственным намёком была серая строчка «Google Drive не подключён»
 * в шапке, а вход прятался в «Ещё → Настройки».
 */
export function ConnectNotice() {
  const { sync, connect } = useStore()
  const [busy, setBusy] = useState(false)

  const connected = sync.status === 'idle' || sync.status === 'syncing'
  if (connected || sync.status === 'no-database') return null

  // На этом устройстве вход уже был — значит сессия истекла, а не «ничего не настроено».
  const expired = sync.lastSyncAt !== null

  const signIn = () => {
    setBusy(true)
    void connect()
      .catch((error: unknown) =>
        toast(error instanceof Error ? error.message : 'Не удалось войти в Google'),
      )
      .finally(() => setBusy(false))
  }

  /*
   * Пока открыто окно Google, страница должна показывать, чего она ждёт:
   * иначе окно выглядит как случайно всплывшая вкладка, а приложение —
   * как будто ничего не происходит.
   */
  if (busy) {
    return (
      <div className="notice">
        <IconCloud size={20} />
        <div className="grow small">
          <strong>Ждём подтверждения в окне Google</strong>
          <div className="muted">Выберите аккаунт в открывшемся окне. Если оно закрылось — войдите ещё раз.</div>
        </div>
        <button className="btn btn-sm" onClick={() => setBusy(false)}>
          Отмена
        </button>
      </div>
    )
  }

  return (
    <div className="notice">
      <IconCloud size={20} />
      <div className="grow small">
        <strong>{expired ? 'Вход в Google истёк' : 'Общая база не подключена'}</strong>
        <div className="muted">
          {expired
            ? 'Правки сохраняются здесь и уедут после входа'
            : 'Сейчас рецепты видны только на этом устройстве'}
        </div>
      </div>
      <button className="btn btn-sm btn-primary" onClick={signIn}>
        Войти
      </button>
    </div>
  )
}
