import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  emptyDatabase,
  type Comment,
  type Database,
  type Entry,
  type Product,
  type Recipe,
  type Settings,
  type Syncable,
  type UserId,
  USERS,
} from '../types'
import { loadLocal, mergeDatabases, normalizeDatabase, pruneTombstones, saveLocal, serialize } from './db'
import * as drive from './drive'
import { ensureDailySnapshot } from './snapshots'
import { listPendingPhotos, uploadPendingPhoto } from './photos'
import { nowIso, uid } from './util'

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'error' | 'no-database'

export type Collection = 'recipes' | 'entries' | 'products' | 'comments'

interface SyncState {
  status: SyncStatus
  message: string
  lastSyncAt: string | null
  email: string | null
}

interface StoreValue {
  db: Database
  /** Кто сейчас пользуется приложением. Если подключён Google — определяется по почте. */
  me: UserId
  setMe: (id: UserId) => void
  /** Аккаунт Google привязан к одному из нас: переключать вручную нельзя и не нужно. */
  identityLocked: boolean
  /** Вошли в Google, но неизвестно, кто это, — надо спросить один раз. */
  needsIdentity: boolean
  sync: SyncState
  /** true — синхронизация прошла; false — не вышло (детали в sync.status/message). */
  connect: () => Promise<boolean>
  /** Открыто окно входа Google — интерфейс показывает ожидание. */
  connecting: boolean
  disconnect: () => void
  /** Войти другим Google-аккаунтом — единственный случай с выбором из списка. Возвращает почту. */
  switchAccount: () => Promise<string | null>
  syncNow: () => Promise<boolean>
  /** Создать базу на своём Диске — когда общей нет и её никто не откроет. */
  createDatabase: () => Promise<void>
  saveRecipe: (recipe: Partial<Recipe> & { id?: string }) => Recipe
  saveEntry: (entry: Partial<Entry> & { id?: string }) => Entry
  saveProduct: (product: Partial<Product> & { id?: string }) => Product
  addComment: (recipeId: string, text: string) => void
  remove: (collection: Collection, id: string) => void
  /** Вернуть удалённое: снимаем пометку об удалении. */
  restore: (collection: Collection, id: string) => void
  /** Окончательно стереть удалённое — записи исчезнут и у второго человека. */
  purge: (collection?: Collection) => void
  updateSettings: (patch: Partial<Settings>) => void
  replaceDatabase: (db: Database) => void
}

const StoreContext = createContext<StoreValue | null>(null)

const ME_KEY = 'wtc.me'

function stamp<T extends Syncable>(existing: T | undefined, patch: Partial<T>, id: string): T {
  const time = nowIso()
  return {
    ...(existing ?? ({} as T)),
    ...patch,
    id,
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  } as T
}

/**
 * Почту запоминаем на устройстве (drive.saveEmail). Иначе до первого ответа Google
 * «кто вы» вычислить не из чего, и имя в шапке прыгало: локальный выбор → привязка
 * по почте → снова локальный выбор, если очередной запрос почты не удался.
 */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => loadLocal() ?? emptyDatabase())
  const [localMe, setLocalMe] = useState<UserId>(() => (localStorage.getItem(ME_KEY) as UserId) || 'andrei')
  const [connecting, setConnecting] = useState(false)
  const [sync, setSync] = useState<SyncState>(() => {
    const lastSyncAt = localStorage.getItem('wtc.lastSyncAt')
    return {
      // Уже синхронизировались раньше — при загрузке сразу «syncing», без кадра «offline»:
      // runSync стартует немедленно, а мигающие статусы в шапке выглядят как поломка.
      status: drive.getClientId() ? (lastSyncAt ? 'syncing' : 'offline') : 'unconfigured',
      message: '',
      lastSyncAt,
      email: drive.getSavedEmail(),
    }
  })

  const dbRef = useRef(db)
  dbRef.current = db
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncing = useRef(false)
  const schedulePushRef = useRef<() => void>(() => {})

  const applyDb = useCallback((next: Database) => {
    dbRef.current = next
    setDb(next)
    saveLocal(next)
  }, [])

  /** Единственная точка изменения базы: обновляет состояние, локальную копию и планирует отправку. */
  const mutate = useCallback(
    (recipe: (draft: Database) => void) => {
      const next: Database = {
        ...dbRef.current,
        recipes: { ...dbRef.current.recipes },
        entries: { ...dbRef.current.entries },
        products: { ...dbRef.current.products },
        comments: { ...dbRef.current.comments },
        settings: { ...dbRef.current.settings },
      }
      recipe(next)
      applyDb(next)
      schedulePushRef.current()
    },
    [applyDb],
  )

  const runSync = useCallback(
    async (interactive: boolean): Promise<boolean> => {
      if (!drive.getClientId()) {
        setSync((s) => ({ ...s, status: 'unconfigured', message: '' }))
        return false
      }
      if (syncing.current) return false
      syncing.current = true
      setSync((s) => ({ ...s, status: 'syncing', message: '' }))
      try {
        await drive.getAccessToken(interactive)
        const file = await drive.resolveDbFile()

        /*
         * Скачиваем, сливаем, отправляем. Перед отправкой проверяем, не записал ли
         * файл кто-то ещё (поле version растёт при каждой записи): если записал —
         * начинаем заново, иначе его правки были бы затёрты нашей версией.
         */
        let merged = pruneTombstones(dbRef.current)
        let baseline = file.version
        for (let attempt = 0; attempt < 3; attempt++) {
          const remote = normalizeDatabase(await drive.downloadJson(file.id))
          // Локальную версию берём заново: пока шёл запрос, пользователь мог что-то поменять.
          merged = pruneTombstones(mergeDatabases(dbRef.current, remote))
          const mergedText = serialize(merged)
          if (mergedText === serialize(remote)) break

          const current = await drive.getFileMeta(file.id)
          if (current.version !== baseline) {
            baseline = current.version
            continue
          }
          await drive.uploadJson(file.id, mergedText)
          break
        }

        // И ещё раз: правка могла прийти уже во время загрузки — тогда доотправим следующим заходом.
        const changedDuringUpload = serialize(dbRef.current) !== serialize(merged)
        applyDb(changedDuringUpload ? mergeDatabases(dbRef.current, merged) : merged)
        if (changedDuringUpload) schedulePushRef.current()
        const at = nowIso()
        localStorage.setItem('wtc.lastSyncAt', at)
        // Ежедневная копия базы — в фоне, синхронизацию не задерживает.
        void ensureDailySnapshot(merged).catch(() => {})
        // Фото, добавленные без сети, доезжают на Диск при первой возможности.
        void flushPendingPhotosRef.current()

        /*
         * Источник правды о почте — хранилище устройства, не замыкание:
         * после «Сменить аккаунт» замыкание ещё держало старую почту и молча
         * возвращало прежний аккаунт. Неудачный запрос известную почту не затирает.
         */
        let email = drive.getSavedEmail()
        if (!email) {
          email = await drive.fetchUserInfo().then((info) => info.email).catch(() => null)
        }
        if (email) drive.saveEmail(email)
        setSync({ status: 'idle', message: '', lastSyncAt: at, email })
        return true
      } catch (error) {
        // Базы нет ни своей, ни общей — спрашиваем пользователя, а не создаём вторую молча.
        if (error instanceof drive.NoDatabaseError) {
          const email = await drive.fetchUserInfo().then((info) => info.email).catch(() => null)
          if (email) drive.saveEmail(email)
          setSync((s) => ({ ...s, status: 'no-database', message: '', email: email ?? s.email }))
          return false
        }
        /*
         * Просто нет сети — это не «Ошибка синхронизации» и не «вход истёк»:
         * запуск в самолёте показывал красный статус и плашку входа на ровном месте.
         */
        const noNetwork =
          !navigator.onLine ||
          (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
        if (noNetwork) {
          setSync((s) => ({ ...s, status: 'offline', message: '' }))
          return false
        }
        const message = error instanceof Error ? error.message : String(error)
        const needsLogin = error instanceof drive.DriveError && error.needsInteraction
        setSync((s) => ({
          ...s,
          status: needsLogin && !interactive ? 'offline' : 'error',
          message: needsLogin && !interactive ? '' : message,
        }))
        return false
      } finally {
        syncing.current = false
      }
    },
    [applyDb],
  )

  const runSyncRef = useRef(runSync)
  runSyncRef.current = runSync

  /** Загружает отложенные фото и переписывает ссылки в рецептах на настоящие id. */
  const flushingPhotos = useRef(false)
  const flushPendingPhotos = useCallback(async () => {
    if (flushingPhotos.current) return
    const queue = listPendingPhotos()
    if (queue.length === 0) return
    flushingPhotos.current = true
    try {
      for (const pending of queue) {
        try {
          const photoId = await uploadPendingPhoto(pending.id)
          if (!photoId) continue
          mutate((draft) => {
            let attached = false
            for (const [id, recipe] of Object.entries(draft.recipes)) {
              if (recipe.photoId === pending.id) {
                draft.recipes[id] = { ...recipe, photoId, updatedAt: nowIso() }
                attached = true
              }
            }
            /*
             * Ссылку из рецепта могла вытеснить параллельная правка второго
             * человека (LWW по записям). Фото от этого пропадать не должно —
             * прикрепляем по запомненному рецепту поверх его правки.
             */
            if (!attached && pending.recipeId) {
              const recipe = draft.recipes[pending.recipeId]
              if (recipe && !recipe.deletedAt) {
                draft.recipes[pending.recipeId] = { ...recipe, photoId, updatedAt: nowIso() }
              }
            }
          })
        } catch {
          // Сеть снова пропала — остаток очереди подождёт следующей синхронизации.
          break
        }
      }
    } finally {
      flushingPhotos.current = false
    }
  }, [mutate])
  const flushPendingPhotosRef = useRef(flushPendingPhotos)
  flushPendingPhotosRef.current = flushPendingPhotos

  const schedulePush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      // Наличие токена не проверяем: он живёт час, а приложение на телефоне —
      // сутками. runSync сам тихо обновит токен, а если не выйдет — уйдёт в offline.
      if (drive.getClientId()) void runSyncRef.current(false)
    }, 2500)
  }, [])
  schedulePushRef.current = schedulePush

  // Первая синхронизация и периодическое обновление, пока вкладка открыта.
  useEffect(() => {
    if (!drive.getClientId()) return
    void runSyncRef.current(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSyncRef.current(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onVisible, 90_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])

  /*
   * Тихое продление входа. Окно Google браузер разрешает открывать только
   * в ответ на действие пользователя, поэтому попытка при загрузке блокируется —
   * из-за этого и казалось, что «надо логиниться каждый раз». Ловим первое
   * касание после запуска: окно открывается с правами жеста, Google видит живую
   * сессию и закрывает его сам за долю секунды.
   */
  const retryAt = useRef(0)
  useEffect(() => {
    const onGesture = () => {
      if (!drive.getClientId() || drive.hasToken()) return
      if (!localStorage.getItem('wtc.lastSyncAt')) return
      if (Date.now() < retryAt.current) return
      retryAt.current = Date.now() + 5 * 60_000
      void runSyncRef.current(false)
    }
    window.addEventListener('pointerdown', onGesture, true)
    return () => window.removeEventListener('pointerdown', onGesture, true)
  }, [])

  /** Аккаунт, под которым вошли, сопоставляем с Сашей или Андреем. */
  const boundUser = useMemo<UserId | null>(() => {
    const email = sync.email?.trim().toLowerCase()
    if (!email) return null
    const map = db.settings.userEmails ?? {}
    return USERS.find((user) => map[user.id]?.trim().toLowerCase() === email)?.id ?? null
  }, [sync.email, db.settings.userEmails])

  const me = boundUser ?? localMe
  const needsIdentity = Boolean(sync.email) && !boundUser

  /*
   * Вычисленную по почте личность запоминаем и как локальный выбор.
   * Тогда даже кадры до прихода почты показывают того же человека,
   * что и в прошлый раз, — имя в шапке не «переключается» при загрузке.
   */
  useEffect(() => {
    if (boundUser && boundUser !== localMe) {
      localStorage.setItem(ME_KEY, boundUser)
      setLocalMe(boundUser)
    }
  }, [boundUser, localMe])

  const value = useMemo<StoreValue>(() => {
    const setMe = (id: UserId) => {
      localStorage.setItem(ME_KEY, id)
      setLocalMe(id)
      // Если мы вошли в Google — запоминаем, что этот аккаунт принадлежит этому человеку.
      const email = sync.email?.trim()
      if (!email) return
      mutate((draft) => {
        const map: Partial<Record<UserId, string>> = { ...draft.settings.userEmails }
        const at: Partial<Record<UserId, string>> = { ...draft.settings.userEmailsAt }
        const when = nowIso()
        /*
         * Снятая привязка — пустая строка со свежей отметкой, а не удаление ключа:
         * удалённый ключ слияние «воскрешало» старым значением со второго устройства,
         * и «Это не я» откатывалось при первой же синхронизации.
         */
        for (const user of USERS) {
          if (user.id !== id && map[user.id]?.trim().toLowerCase() === email.toLowerCase()) {
            map[user.id] = ''
            at[user.id] = when
          }
        }
        map[id] = email
        at[id] = when
        draft.settings = { ...draft.settings, userEmails: map, userEmailsAt: at }
        draft.settingsUpdatedAt = when
      })
    }

    return {
      db,
      me,
      setMe,
      identityLocked: boundUser !== null,
      needsIdentity,
      sync,
      connect: async () => {
        // Флаг «ждём окно Google» — чтобы страница показывала, что происходит.
        setConnecting(true)
        try {
          return await runSyncRef.current(true)
        } finally {
          setConnecting(false)
        }
      },
      connecting,
      disconnect: () => {
        drive.signOut()
        drive.forgetFile()
        localStorage.removeItem('wtc.google.email')
        setSync((s) => ({ ...s, status: 'offline', email: null, message: '' }))
      },
      switchAccount: async () => {
        // Сначала выбор аккаунта: если человек закрыл окно — ничего не трогаем.
        await drive.switchAccount()
        drive.forgetFile()
        localStorage.removeItem('wtc.google.email')
        const info = await drive.fetchUserInfo().catch(() => null)
        if (info?.email) drive.saveEmail(info.email)
        setSync((s) => ({ ...s, email: info?.email ?? null }))
        await runSyncRef.current(false)
        return info?.email ?? null
      },
      syncNow: () => runSyncRef.current(false),
      createDatabase: async () => {
        await drive.createDbFile(serialize(pruneTombstones(dbRef.current)))
        await runSyncRef.current(false)
      },
      saveRecipe: (patch) => {
        const id = patch.id ?? uid('r')
        let saved!: Recipe
        mutate((draft) => {
          saved = stamp<Recipe>(draft.recipes[id], patch as Partial<Recipe>, id)
          draft.recipes[id] = saved
        })
        return saved
      },
      saveEntry: (patch) => {
        const id = patch.id ?? uid('e')
        let saved!: Entry
        mutate((draft) => {
          saved = stamp<Entry>(draft.entries[id], patch as Partial<Entry>, id)
          draft.entries[id] = saved
        })
        return saved
      },
      saveProduct: (patch) => {
        const id = patch.id ?? uid('p')
        let saved!: Product
        mutate((draft) => {
          saved = stamp<Product>(draft.products[id], patch as Partial<Product>, id)
          draft.products[id] = saved
        })
        return saved
      },
      addComment: (recipeId, text) => {
        const id = uid('c')
        mutate((draft) => {
          draft.comments[id] = stamp<Comment>(undefined, { recipeId, author: me, text }, id)
        })
      },
      remove: (collection, id) => {
        mutate((draft) => {
          const item = (draft[collection] as Record<string, Syncable>)[id]
          if (!item) return
          const at = nowIso()
          ;(draft[collection] as Record<string, Syncable>)[id] = { ...item, deletedAt: at, updatedAt: at }
        })
      },
      restore: (collection, id) => {
        mutate((draft) => {
          const item = (draft[collection] as Record<string, Syncable>)[id]
          if (!item) return
          const restored = { ...item, updatedAt: nowIso() }
          delete restored.deletedAt
          ;(draft[collection] as Record<string, Syncable>)[id] = restored
        })
      },
      purge: (collection) => {
        mutate((draft) => {
          const names: Collection[] = collection
            ? [collection]
            : ['recipes', 'entries', 'products', 'comments']
          /*
           * Отметка очистки — по самому свежему УВИДЕННОМУ надгробию, а не по часам.
           * purgedAt = «сейчас» стирал бы и удаления, сделанные вторым телефоном
           * офлайн, которых очищавший никогда не видел, — блюдо воскресало у обоих.
           */
          let latestSeen = ''
          for (const name of names) {
            const target = draft[name] as Record<string, Syncable>
            for (const [id, item] of Object.entries(target)) {
              if (item.deletedAt) {
                if (item.deletedAt > latestSeen) latestSeen = item.deletedAt
                delete target[id]
              }
            }
          }
          if (latestSeen) {
            const current = draft.settings.purgedAt
            draft.settings = {
              ...draft.settings,
              purgedAt: current && current > latestSeen ? current : latestSeen,
            }
            draft.settingsUpdatedAt = nowIso()
          }
        })
      },
      updateSettings: (patch) => {
        mutate((draft) => {
          draft.settings = { ...draft.settings, ...patch }
          draft.settingsUpdatedAt = nowIso()
        })
      },
      replaceDatabase: (next) => {
        applyDb(next)
        schedulePush()
      },
    }
  }, [db, me, boundUser, needsIdentity, sync, connecting, mutate, applyDb, schedulePush])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore вызван вне StoreProvider')
  return value
}
