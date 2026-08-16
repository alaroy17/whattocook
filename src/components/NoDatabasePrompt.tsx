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

  const run = (action: () => Promise<void>, done: string) => {
    setBusy(true)
    void action()
      .then(() => toast(done))
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
        <button
          className="btn btn-block"
          disabled={busy}
          onClick={() => run(syncNow, 'Общая база найдена')}
        >
          Мне открыли доступ — проверить ещё раз
        </button>
        <div className="small muted">
          Выберите это, если второй человек уже отправил приглашение. Письмо со ссылкой нужно
          сначала открыть — папка появится в «Доступные мне».
        </div>

        <div className="divider" />

        <button
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => run(createDatabase, 'База создана')}
        >
          Создать новую базу
        </button>
        <div className="small muted">
          Подходит, если вы первый и настраиваете приложение с нуля. Если общая база уже
          существует, вторая приведёт к тому, что рецепты разъедутся на две половины.
        </div>

        <button className="btn btn-ghost btn-block" onClick={disconnect}>
          Отключить аккаунт
        </button>
      </div>
    </Sheet>
  )
}
