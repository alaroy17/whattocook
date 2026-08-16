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
import { nowIso, uid } from './util'

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'error'

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
  connect: () => Promise<void>
  disconnect: () => void
  syncNow: () => Promise<void>
  saveRecipe: (recipe: Partial<Recipe> & { id?: string }) => Recipe
  saveEntry: (entry: Partial<Entry> & { id?: string }) => Entry
  saveProduct: (product: Partial<Product> & { id?: string }) => Product
  addComment: (recipeId: string, text: string) => void
  remove: (collection: 'recipes' | 'entries' | 'products' | 'comments', id: string) => void
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => loadLocal() ?? emptyDatabase())
  const [localMe, setLocalMe] = useState<UserId>(() => (localStorage.getItem(ME_KEY) as UserId) || 'andrei')
  const [sync, setSync] = useState<SyncState>({
    status: drive.getClientId() ? 'offline' : 'unconfigured',
    message: '',
    lastSyncAt: localStorage.getItem('wtc.lastSyncAt'),
    email: null,
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
    async (interactive: boolean) => {
      if (!drive.getClientId()) {
        setSync((s) => ({ ...s, status: 'unconfigured', message: '' }))
        return
      }
      if (syncing.current) return
      syncing.current = true
      setSync((s) => ({ ...s, status: 'syncing', message: '' }))
      try {
        await drive.getAccessToken(interactive)
        const file = await drive.resolveDbFile(serialize(pruneTombstones(dbRef.current)))
        const remoteRaw = await drive.downloadJson(file.id)
        const remote = normalizeDatabase(remoteRaw)

        // Локальную версию берём заново: пока шёл запрос, пользователь мог что-то поменять.
        const merged = pruneTombstones(mergeDatabases(dbRef.current, remote))
        const mergedText = serialize(merged)
        if (mergedText !== serialize(remote)) {
          await drive.uploadJson(file.id, mergedText)
        }

        // И ещё раз: правка могла прийти уже во время загрузки — тогда доотправим следующим заходом.
        const changedDuringUpload = serialize(dbRef.current) !== serialize(merged)
        applyDb(changedDuringUpload ? mergeDatabases(dbRef.current, merged) : merged)
        if (changedDuringUpload) schedulePushRef.current()
        const at = nowIso()
        localStorage.setItem('wtc.lastSyncAt', at)
        let email = sync.email
        if (!email) {
          email = await drive.fetchUserInfo().then((info) => info.email).catch(() => null)
        }
        setSync({ status: 'idle', message: '', lastSyncAt: at, email })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const needsLogin = error instanceof drive.DriveError && error.needsInteraction
        setSync((s) => ({
          ...s,
          status: needsLogin && !interactive ? 'offline' : 'error',
          message: needsLogin && !interactive ? '' : message,
        }))
      } finally {
        syncing.current = false
      }
    },
    [applyDb, sync.email],
  )

  const runSyncRef = useRef(runSync)
  runSyncRef.current = runSync

  const schedulePush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      if (drive.getClientId() && drive.hasToken()) void runSyncRef.current(false)
    }, 2500)
  }, [])
  schedulePushRef.current = schedulePush

  // Первая синхронизация и периодическое обновление, пока вкладка открыта.
  useEffect(() => {
    if (!drive.getClientId()) return
    void runSyncRef.current(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && drive.hasToken()) void runSyncRef.current(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onVisible, 90_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
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

  const value = useMemo<StoreValue>(() => {
    const setMe = (id: UserId) => {
      localStorage.setItem(ME_KEY, id)
      setLocalMe(id)
      // Если мы вошли в Google — запоминаем, что этот аккаунт принадлежит этому человеку.
      const email = sync.email?.trim()
      if (!email) return
      mutate((draft) => {
        const map: Partial<Record<UserId, string>> = { ...draft.settings.userEmails }
        for (const user of USERS) {
          if (map[user.id]?.trim().toLowerCase() === email.toLowerCase()) delete map[user.id]
        }
        map[id] = email
        draft.settings = { ...draft.settings, userEmails: map }
        draft.settingsUpdatedAt = nowIso()
      })
    }

    return {
      db,
      me,
      setMe,
      identityLocked: boundUser !== null,
      needsIdentity,
      sync,
      connect: () => runSyncRef.current(true),
      disconnect: () => {
        drive.signOut()
        drive.forgetFile()
        setSync((s) => ({ ...s, status: 'offline', email: null, message: '' }))
      },
      syncNow: () => runSyncRef.current(false),
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
          ;(draft[collection] as Record<string, Syncable>)[id] = {
            ...item,
            deletedAt: nowIso(),
            updatedAt: nowIso(),
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
  }, [db, me, boundUser, needsIdentity, sync, mutate, applyDb, schedulePush])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore вызван вне StoreProvider')
  return value
}
