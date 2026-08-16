import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import * as drive from '../lib/drive'
import { Confirm, Field, Segmented, toast } from '../components/ui'
import { CATEGORIES, emptyDatabase } from '../types'
import { alive, mergeDatabases, normalizeDatabase, serialize } from '../lib/db'
import { uniqueCategories } from '../lib/categories'
import { buildSeedDatabase } from '../lib/seed'
import { daysWord } from '../lib/util'
import { IconCheck, IconChevronRight, IconCloud, IconPlus, IconRefresh } from '../components/Icons'

const HELP_URL = 'https://console.cloud.google.com/apis/credentials'

/**
 * Включение и порядок разделов. Скрытый раздел исчезает из фильтров и из формы блюда,
 * но уже сохранённые блюда с ним остаются на месте.
 */
function CategoryManager() {
  const { db, updateSettings } = useStore()
  const [draft, setDraft] = useState('')

  const enabled = db.settings.categories ?? []
  const used = useMemo(() => uniqueCategories(alive(db.recipes)), [db.recipes])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const recipe of alive(db.recipes)) map.set(recipe.category, (map.get(recipe.category) ?? 0) + 1)
    return map
  }, [db.recipes])

  const rest = [...new Set([...CATEGORIES, ...used])]
    .filter((category) => !enabled.includes(category))
    .sort((a, b) => a.localeCompare(b, 'ru'))

  const toggle = (category: string, on: boolean) => {
    updateSettings({
      categories: on ? [...enabled, category] : enabled.filter((item) => item !== category),
    })
  }

  const move = (index: number, delta: number) => {
    const next = [...enabled]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    updateSettings({ categories: next })
  }

  const row = (category: string, on: boolean, index: number) => (
    <div className="cat-row" key={category}>
      <input type="checkbox" checked={on} onChange={(event) => toggle(category, event.target.checked)} />
      <span className="grow">
        {category}
        {counts.get(category) ? <span className="small muted"> · {counts.get(category)}</span> : null}
      </span>
      {on && (
        <>
          <button className="order-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Выше">
            <IconChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button
            className="order-btn"
            disabled={index === enabled.length - 1}
            onClick={() => move(index, 1)}
            aria-label="Ниже"
          >
            <IconChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      {enabled.map((category, index) => row(category, true, index))}
      {rest.length > 0 && <div className="group-title">Скрытые</div>}
      {rest.map((category) => row(category, false, -1))}

      <div className="row" style={{ marginTop: 12 }}>
        <input
          className="input input-sm grow"
          placeholder="Свой раздел"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const value = draft.trim()
            if (!value || enabled.includes(value)) return
            updateSettings({ categories: [...enabled, value] })
            setDraft('')
          }}
        />
        <button
          className="btn btn-sm"
          disabled={!draft.trim() || enabled.includes(draft.trim())}
          onClick={() => {
            updateSettings({ categories: [...enabled, draft.trim()] })
            setDraft('')
          }}
        >
          <IconPlus size={15} />
        </button>
      </div>
    </>
  )
}

export function SettingsPage() {
  const { db, sync, connect, disconnect, syncNow, updateSettings, replaceDatabase } = useStore()
  const [clientId, setClientIdValue] = useState(drive.getClientId())
  const [shareEmail, setShareEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showHelp, setShowHelp] = useState(!drive.getClientId())

  const connected = sync.status === 'idle' || sync.status === 'syncing'

  const doConnect = async () => {
    drive.setClientId(clientId)
    setBusy(true)
    try {
      await connect()
      toast('Google Drive подключён')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось подключиться')
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () => {
    const blob = new Blob([serialize(db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `what-to-cook-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = normalizeDatabase(JSON.parse(await file.text()))
      replaceDatabase(mergeDatabases(db, parsed))
      toast('Данные добавлены')
    } catch {
      toast('Не получилось прочитать файл')
    }
  }

  return (
    <>
      <TopBar title="Настройки" back showUser={false} />
      <main className="content">
        <section className="section">
          <div className="section-head">
            <h2>Google Drive</h2>
            <button className="link" onClick={() => setShowHelp((value) => !value)}>
              {showHelp ? 'Свернуть' : 'Как настроить'}
            </button>
          </div>

          <div className="card">
            <div className="row-between">
              <span className="row" style={{ gap: 8 }}>
                <IconCloud size={18} />
                {connected ? sync.email ?? 'Подключено' : 'Не подключено'}
              </span>
              {connected && <span className="badge badge-good">на связи</span>}
            </div>

            {sync.lastSyncAt && (
              <div className="small muted" style={{ marginTop: 6 }}>
                Последняя синхронизация: {new Date(sync.lastSyncAt).toLocaleString('ru-RU')}
              </div>
            )}
            {sync.status === 'error' && sync.message && (
              <div className="small" style={{ marginTop: 6, color: '#b0432f' }}>
                {sync.message}
              </div>
            )}

            {showHelp && (
              <div className="small muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                1. Откройте <a href={HELP_URL} target="_blank" rel="noreferrer">Google Cloud Console</a> и создайте проект.
                <br />
                2. Включите Google Drive API.
                <br />
                3. В разделе «Credentials» создайте OAuth client ID типа Web application и добавьте адрес этого
                сайта в Authorized JavaScript origins.
                <br />
                4. На экране согласия выберите тип External, добавьте оба ваших Google-адреса в Test users и
                область доступа <code>.../auth/drive</code>.
                <br />
                5. Скопируйте Client ID сюда.
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <Field label="Client ID" hint="Заканчивается на .apps.googleusercontent.com">
                <input
                  className="input"
                  value={clientId}
                  onChange={(event) => setClientIdValue(event.target.value)}
                  placeholder="1234567890-abc.apps.googleusercontent.com"
                />
              </Field>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary grow" disabled={busy || !clientId.trim()} onClick={() => void doConnect()}>
                {connected ? 'Переподключить' : 'Подключить'}
              </button>
              {connected && (
                <button className="btn" onClick={() => void syncNow()}>
                  <IconRefresh size={16} /> Обновить
                </button>
              )}
            </div>

            {connected && (
              <>
                <div className="divider" />
                <Field
                  label="Открыть доступ второму человеку"
                  hint={`Поделимся папкой «${drive.APP_FOLDER_NAME}» целиком и пришлём приглашение на его Google-почту`}
                >
                  <div className="row">
                    <input
                      className="input grow"
                      value={shareEmail}
                      placeholder="почта@gmail.com"
                      onChange={(event) => setShareEmail(event.target.value)}
                    />
                    <button
                      className="btn"
                      disabled={!shareEmail.includes('@')}
                      onClick={() => {
                        void drive
                          .shareWith(shareEmail)
                          .then(() => {
                            toast('Доступ открыт')
                            setShareEmail('')
                          })
                          .catch((error: unknown) =>
                            toast(error instanceof Error ? error.message : 'Не удалось открыть доступ'),
                          )
                      }}
                    >
                      <IconCheck size={16} />
                    </button>
                  </div>
                </Field>
                <button className="btn btn-block" style={{ marginTop: 10 }} onClick={disconnect}>
                  Отключить аккаунт
                </button>
              </>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Разделы</h2>
            <span className="small muted">что видно в фильтрах</span>
          </div>
          <div className="card">
            <CategoryManager />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Подсказки</h2>
          </div>
          <div className="card">
            <Field
              label={`Не предлагать блюдо ${db.settings.cooldownDays} дней после приготовления`}
            >
              <input
                type="range"
                min={0}
                max={45}
                value={db.settings.cooldownDays}
                onChange={(event) => updateSettings({ cooldownDays: Number(event.target.value) })}
                style={{ accentColor: 'var(--accent)' }}
              />
            </Field>
            <label className="switch">
              <span>
                Учитывать, что есть дома
                <div className="small muted">Блюда из имеющихся продуктов поднимаются выше</div>
              </span>
              <input
                type="checkbox"
                checked={db.settings.preferInStock}
                onChange={(event) => updateSettings({ preferInStock: event.target.checked })}
              />
            </label>
            <div className="divider" />
            <Field
              label={
                db.settings.fridgeRemindDays
                  ? `Напоминать проверить холодильник раз в ${daysWord(db.settings.fridgeRemindDays)}`
                  : 'Не напоминать про холодильник'
              }
            >
              <input
                type="range"
                min={0}
                max={21}
                value={db.settings.fridgeRemindDays}
                onChange={(event) => updateSettings({ fridgeRemindDays: Number(event.target.value) })}
                style={{ accentColor: 'var(--accent)' }}
              />
            </Field>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Внешний вид</h2>
          </div>
          <div className="card">
            <Segmented
              value={db.settings.theme}
              onChange={(value) => updateSettings({ theme: value })}
              options={[
                { id: 'system', label: 'Как в системе' },
                { id: 'light', label: 'Светлая' },
                { id: 'dark', label: 'Тёмная' },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Field label="Валюта">
                <input
                  className="input"
                  style={{ width: 90 }}
                  value={db.settings.currency}
                  onChange={(event) => updateSettings({ currency: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Данные</h2>
          </div>
          <div className="card stack">
            <button className="btn btn-block" onClick={exportJson}>
              Скачать резервную копию
            </button>
            <label className="btn btn-block">
              Загрузить из файла
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => void importJson(event.target.files?.[0])}
              />
            </label>
            <button
              className="btn btn-block"
              onClick={() => {
                replaceDatabase(buildSeedDatabase(db))
                toast('Примеры добавлены')
              }}
            >
              Добавить примеры рецептов
            </button>
            <button className="btn btn-block btn-danger" onClick={() => setConfirmReset(true)}>
              Очистить всё на этом устройстве
            </button>
          </div>
        </section>

        <div className="small muted" style={{ textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          На Диске: папка «{drive.APP_FOLDER_NAME}»
          <br />
          {drive.DB_FILE_NAME} и подпапка «{drive.PHOTO_FOLDER_NAME}»
        </div>
      </main>

      {confirmReset && (
        <Confirm
          title="Очистить данные?"
          text="Локальная копия будет удалена. Если Google Drive подключён, данные вернутся при следующей синхронизации."
          confirmLabel="Очистить"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            replaceDatabase(emptyDatabase())
            setConfirmReset(false)
            toast('Локальные данные очищены')
          }}
        />
      )}
    </>
  )
}
