import { useState } from 'react'
import { useStore } from '../lib/store'
import { Sheet, toast } from '../components/ui'
import { APP_FOLDER_NAME } from '../lib/drive'

/**
 * Ни своей базы, ни общей. Создать новую молча нельзя: если второй человек просто
 * не успел принять приглашение, у него появится отдельная база и две половины
 * истории никогда не сойдутся. Поэтому спрашиваем.
 */
export function NoDatabasePrompt() {
  const { sync, syncNow, createDatabase, disconnect } = useStore()
  const [busy, setBusy] = useState(false)

  // Тост честный: раньше «Общая база найдена» показывался, даже когда её не нашли.
  const recheck = () => {
    setBusy(true)
    void syncNow()
      .then((ok) => toast(ok ? 'Общая база найдена' : 'Пока не видно — проверьте, что приглашение открыто'))
      .catch((error: unknown) =>
        toast(error instanceof Error ? error.message : 'Не получилось, попробуйте ещё раз'),
      )
      .finally(() => setBusy(false))
  }

  const create = () => {
    setBusy(true)
    void createDatabase()
      .then(() => toast('База создана'))
      .catch((error: unknown) =>
        toast(error instanceof Error ? error.message : 'Не получилось, попробуйте ещё раз'),
      )
      .finally(() => setBusy(false))
  }

  return (
    <Sheet title="Базы на Диске нет" onClose={() => undefined} dismissible={false}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Вошли как <strong>{sync.email}</strong>, но папки «{APP_FOLDER_NAME}» в этом аккаунте нет
        и общей папки тоже не видно.
      </p>

      <div className="stack" style={{ marginTop: 14 }}>
        <button className="btn btn-block" disabled={busy} onClick={recheck}>
          Мне открыли доступ — проверить ещё раз
        </button>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={create}>
          Создать новую базу
        </button>
        <button className="btn btn-ghost btn-block" onClick={disconnect}>
          Отключить аккаунт
        </button>
      </div>
    </Sheet>
  )
}
