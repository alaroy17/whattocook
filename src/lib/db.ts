import {
  emptyDatabase,
  DEFAULT_SETTINGS,
  TOMBSTONE_DAYS,
  type Database,
  type Syncable,
  type UserId,
} from '../types'

const LOCAL_KEY = 'wtc.db.v1'

type Collection = 'recipes' | 'entries' | 'products' | 'comments'
const COLLECTIONS: Collection[] = ['recipes', 'entries', 'products', 'comments']

/** Приводит произвольный JSON к валидной базе — на случай старых или битых файлов. */
export function normalizeDatabase(input: unknown): Database {
  const db = emptyDatabase()
  if (!input || typeof input !== 'object') return db
  const raw = input as Partial<Database>
  for (const name of COLLECTIONS) {
    const source = raw[name]
    if (!source || typeof source !== 'object') continue
    const target = db[name] as Record<string, Syncable>
    for (const [id, value] of Object.entries(source as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const item = value as Syncable
      if (!item.id) item.id = id
      if (!item.updatedAt) item.updatedAt = item.createdAt ?? new Date(0).toISOString()
      if (!item.createdAt) item.createdAt = item.updatedAt
      target[id] = item
    }
  }
  db.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
  db.settingsUpdatedAt = raw.settingsUpdatedAt ?? new Date(0).toISOString()
  return db
}

/**
 * Слияние двух версий базы. Правило простое и предсказуемое:
 * для каждой записи побеждает та версия, у которой свежее updatedAt.
 * Удаление — это тоже правка (deletedAt), поэтому оно так же доезжает до второго устройства.
 */
export function mergeDatabases(a: Database, b: Database): Database {
  const result = emptyDatabase()
  for (const name of COLLECTIONS) {
    const target = result[name] as Record<string, Syncable>
    const left = a[name] as Record<string, Syncable>
    const right = b[name] as Record<string, Syncable>
    for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const x = left[id]
      const y = right[id]
      if (!x) target[id] = y
      else if (!y) target[id] = x
      else target[id] = y.updatedAt > x.updatedAt ? y : x
    }
  }
  const settingsFromB = b.settingsUpdatedAt > a.settingsUpdatedAt
  result.settings = { ...DEFAULT_SETTINGS, ...(settingsFromB ? b.settings : a.settings) }
  result.settingsUpdatedAt = settingsFromB ? b.settingsUpdatedAt : a.settingsUpdatedAt

  /*
   * Настройки в целом берём по свежести, но три поля так терять нельзя:
   * их правят с разных устройств независимо, и «победа» одной версии целиком
   * откатила бы чужую привязку аккаунта или выданный доступ.
   */
  result.settings.userEmails = mergeUserEmails(a.settings.userEmails, b.settings.userEmails)
  result.settings.sharedWith = [
    ...new Set([...(a.settings.sharedWith ?? []), ...(b.settings.sharedWith ?? [])]),
  ]
  result.settings.purgedAt = maxIso(a.settings.purgedAt, b.settings.purgedAt)

  return result
}

/** У каждого пользователя берём последнюю известную непустую почту. */
function mergeUserEmails(
  a: Partial<Record<UserId, string>> = {},
  b: Partial<Record<UserId, string>> = {},
): Partial<Record<UserId, string>> {
  const result: Partial<Record<UserId, string>> = { ...a }
  for (const [id, email] of Object.entries(b) as [UserId, string | undefined][]) {
    if (email) result[id] = email
  }
  return result
}

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a > b ? a : b
}

/** Живые (не удалённые) записи коллекции. */
export function alive<T extends Syncable>(collection: Record<string, T>): T[] {
  return Object.values(collection).filter((item) => !item.deletedAt)
}

/**
 * Убирает надгробия: старше срока хранения либо попавшие под ручную очистку корзины.
 *
 * Очистка помечается временем в `settings.purgedAt`. Без такой отметки удалённые записи
 * возвращались бы при следующем слиянии — у второго устройства они ещё есть, и оно
 * считало бы их «отсутствующими локально», а не «стёртыми намеренно».
 *
 * Возвращает новый объект: базу нельзя менять на месте, на неё смотрит React.
 */
export function pruneTombstones(db: Database, olderThanDays = TOMBSTONE_DAYS): Database {
  const expired = new Date(Date.now() - olderThanDays * 86400000).toISOString()
  const purged = db.settings.purgedAt
  const result: Database = { ...db }
  for (const name of COLLECTIONS) {
    const source = db[name] as Record<string, Syncable>
    const kept: Record<string, Syncable> = {}
    let removed = 0
    for (const [id, item] of Object.entries(source)) {
      const drop =
        item.deletedAt && (item.deletedAt < expired || (purged != null && item.deletedAt <= purged))
      if (drop) removed++
      else kept[id] = item
    }
    if (removed > 0) (result[name] as Record<string, Syncable>) = kept
  }
  return result
}

export function loadLocal(): Database | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    return normalizeDatabase(JSON.parse(raw))
  } catch (error) {
    console.warn('Не удалось прочитать локальную копию базы', error)
    return null
  }
}

export function saveLocal(db: Database): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(db))
  } catch (error) {
    console.warn('Не удалось сохранить локальную копию базы', error)
  }
}

export function serialize(db: Database): string {
  return JSON.stringify(db, null, 1)
}
