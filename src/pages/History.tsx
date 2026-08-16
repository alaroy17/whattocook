import { useCallback, useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { listSnapshots, restoreSnapshot } from '../lib/snapshots'
import type { SnapshotMeta } from '../lib/drive'
import { Confirm, Empty, toast } from '../components/ui'
import { IconRefresh } from '../components/Icons'
import { formatDate } from '../lib/date'
import { alive } from '../lib/db'

export function History() {
  const { db, sync, replaceDatabase } = useStore()
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null)
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState<SnapshotMeta | null>(null)
  const [busy, setBusy] = useState(false)

  const connected = sync.status === 'idle' || sync.status === 'syncing'

  const load = useCallback(() => {
    if (!connected) return
    setError('')
    listSnapshots()
      .then(setSnapshots)
      .catch((problem: unknown) => {
        setSnapshots([])
        setError(problem instanceof Error ? problem.message : 'Не удалось получить список копий')
      })
  }, [connected])

  useEffect(load, [load])

  const currentRecipes = alive(db.recipes).length
  const currentEntries = alive(db.entries).length

  return (
    <>
      <TopBar
        title="История версий"
        back
        showUser={false}
        subtitle={snapshots ? `${snapshots.length} копий на Диске` : undefined}
        actions={
          connected ? (
            <button className="icon-btn" onClick={load} aria-label="Обновить список">
              <IconRefresh />
            </button>
          ) : undefined
        }
      />
      <main className="content">
        {!connected ? (
          <Empty
            title="Нужен Google Drive"
            text="Копии базы хранятся в папке «История» рядом с самой базой — без подключения их негде взять"
          />
        ) : (
          <>
            <div className="small muted" style={{ marginBottom: 12, lineHeight: 1.6 }}>
              Раз в сутки приложение само сохраняет копию базы на Диск. Восстановление вернёт то,
              что после выбранной даты удалили или потеряли. Всё, что появилось или менялось
              позже, остаётся нетронутым — свежие правки не откатываются.
            </div>

            {error && (
              <div className="small" style={{ color: '#b0432f', marginBottom: 10 }}>
                {error}
              </div>
            )}

            <div className="card" style={{ marginBottom: 12 }}>
              <div className="row-between">
                <span>Сейчас</span>
                <span className="small muted">
                  {currentRecipes} блюд · {currentEntries} записей
                </span>
              </div>
            </div>

            {snapshots === null ? (
              <div className="small muted">Загружаем…</div>
            ) : snapshots.length === 0 ? (
              <Empty
                title="Копий пока нет"
                text="Первая появится при следующей синхронизации"
              />
            ) : (
              <div className="card-flat">
                {snapshots.map((snapshot) => (
                  <div className="shop-item" key={snapshot.id} style={{ cursor: 'default' }}>
                    <span className="grow shop-name">
                      {formatDate(snapshot.date, { year: true })}
                      <div className="small muted">
                        {snapshot.recipes} блюд · {snapshot.entries} записей
                      </div>
                    </span>
                    <button className="btn btn-sm" onClick={() => setRestoring(snapshot)}>
                      Восстановить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {restoring && (
        <Confirm
          title={`Восстановить копию от ${formatDate(restoring.date)}?`}
          text={`В копии ${restoring.recipes} блюд и ${restoring.entries} записей. Вернётся то, что после этой даты удалили или потеряли. Записи, изменённые позже, останутся в свежем виде — правки не откатятся.`}
          confirmLabel={busy ? 'Восстанавливаем…' : 'Восстановить'}
          onCancel={() => setRestoring(null)}
          onConfirm={() => {
            setBusy(true)
            void restoreSnapshot(restoring.id, db)
              .then(({ db: restored, restored: count }) => {
                replaceDatabase(restored)
                toast(count === 0 ? 'Всё на месте, возвращать нечего' : `Вернулось записей: ${count}`)
                setRestoring(null)
              })
              .catch((problem: unknown) =>
                toast(problem instanceof Error ? problem.message : 'Не удалось восстановить'),
              )
              .finally(() => setBusy(false))
          }}
        />
      )}
    </>
  )
}
