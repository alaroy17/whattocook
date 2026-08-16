import {
  emptyDatabase,
  DEFAULT_SETTINGS,
  MEAL_SLOTS,
  TOMBSTONE_DAYS,
  USERS,
  type Database,
  type Entry,
  type Recipe,
  type Syncable,
  type UserId,
} from '../types'

const LOCAL_KEY = 'wtc.db.v1'

type Collection = 'recipes' | 'entries' | 'products' | 'comments'
const COLLECTIONS: Collection[] = ['recipes', 'entries', 'products', 'comments']

/*
 * Санитайзеры полей. Без них импорт битого JSON («Загрузить из файла», правленный
 * вручную или чужой файл) сохранял запись без ingredients/tags — первый же рендер
 * главной падал на .length, ErrorBoundary ловил белый экран, а испорченная база
 * успевала уехать на Диск и уронить второй телефон.
 */
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const strOpt = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function ratings(value: unknown): Partial<Record<UserId, number>> {
  const result: Partial<Record<UserId, number>> = {}
  if (value && typeof value === 'object') {
    for (const user of USERS) {
      const rating = (value as Record<string, unknown>)[user.id]
      if (typeof rating === 'number' && Number.isFinite(rating)) result[user.id] = rating
    }
  }
  return result
}

function sanitizeRecipe(item: Record<string, unknown>): Partial<Recipe> | null {
  const name = str(item.name).trim()
  if (!name) return null
  const difficultyRaw = num(item.difficulty) ?? 1
  return {
    name,
    category: str(item.category, 'Основное') || 'Основное',
    tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
    ingredients: Array.isArray(item.ingredients)
      ? item.ingredients
          .map((raw) => {
            if (!raw || typeof raw !== 'object') return null
            const ing = raw as Record<string, unknown>
            const ingName = str(ing.name).trim()
            if (!ingName) return null
            const note = strOpt(ing.note)
            return { name: ingName, qty: num(ing.qty), unit: str(ing.unit), ...(note ? { note } : {}) }
          })
          .filter((ing): ing is NonNullable<typeof ing> => ing !== null)
      : [],
    steps: str(item.steps),
    timeMin: num(item.timeMin),
    servings: num(item.servings),
    difficulty: (difficultyRaw >= 3 ? 3 : difficultyRaw >= 2 ? 2 : 1) as 1 | 2 | 3,
    chef: item.chef === 'sasha' || item.chef === 'andrei' || item.chef === 'any' ? item.chef : 'any',
    favorite: item.favorite === true,
    ratings: ratings(item.ratings),
    regular: item.regular === true,
    regularEveryDays: num(item.regularEveryDays),
    photoId: strOpt(item.photoId),
    sourceUrl: strOpt(item.sourceUrl),
    ...(item.archived === true ? { archived: true } : {}),
  }
}

function sanitizeEntry(item: Record<string, unknown>): Partial<Entry> | null {
  const date = str(item.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const meal = MEAL_SLOTS.some((slot) => slot.id === item.meal) ? (item.meal as Entry['meal']) : 'dinner'
  const cook =
    item.cook === 'sasha' || item.cook === 'andrei' || item.cook === 'both' || item.cook === 'outside'
      ? item.cook
      : undefined
  const title = strOpt(item.title)
  const note = strOpt(item.note)
  return {
    date,
    meal,
    status: item.status === 'planned' ? 'planned' : 'done',
    recipeId: strOpt(item.recipeId),
    ...(title ? { title } : {}),
    ...(cook ? { cook } : {}),
    ...(note ? { note } : {}),
    ratings: ratings(item.ratings),
    cost: num(item.cost),
    servings: num(item.servings),
  }
}

function sanitizeProduct(item: Record<string, unknown>): Record<string, unknown> | null {
  const name = str(item.name).trim()
  if (!name) return null
  return {
    name,
    group: str(item.group, 'Прочее') || 'Прочее',
    unit: str(item.unit),
    price: num(item.price),
    packQty: num(item.packQty),
    packPrice: num(item.packPrice),
    inStock: item.inStock === true,
    ...(strOpt(item.stockUpdatedAt) ? { stockUpdatedAt: str(item.stockUpdatedAt) } : {}),
  }
}

function sanitizeComment(item: Record<string, unknown>): Record<string, unknown> | null {
  const text = str(item.text).trim()
  const recipeId = str(item.recipeId)
  if (!text || !recipeId) return null
  return {
    text,
    recipeId,
    author: item.author === 'sasha' || item.author === 'andrei' ? item.author : 'andrei',
  }
}

const SANITIZERS: Record<Collection, (item: Record<string, unknown>) => Record<string, unknown> | null> = {
  recipes: sanitizeRecipe as (item: Record<string, unknown>) => Record<string, unknown> | null,
  entries: sanitizeEntry as (item: Record<string, unknown>) => Record<string, unknown> | null,
  products: sanitizeProduct,
  comments: sanitizeComment,
}

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
      const item = value as Record<string, unknown>
      const clean = SANITIZERS[name](item)
      if (!clean) continue
      const updatedAt = str(item.updatedAt) || str(item.createdAt) || new Date(0).toISOString()
      const deletedAt = strOpt(item.deletedAt)
      target[id] = {
        ...clean,
        id: str(item.id) || id,
        createdAt: str(item.createdAt) || updatedAt,
        updatedAt,
        ...(deletedAt ? { deletedAt } : {}),
      } as Syncable
    }
  }
  db.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
  db.settingsUpdatedAt = str(raw.settingsUpdatedAt) || new Date(0).toISOString()

  /*
   * Отметки времени привязок появились позже самих привязок: старым значениям
   * даём давность настроек, чтобы свежая перепривязка честно побеждала их.
   */
  if (!db.settings.userEmailsAt || typeof db.settings.userEmailsAt !== 'object') {
    db.settings.userEmailsAt = {}
  }
  for (const user of USERS) {
    if (db.settings.userEmails?.[user.id] !== undefined && !db.settings.userEmailsAt[user.id]) {
      db.settings.userEmailsAt[user.id] = db.settingsUpdatedAt
    }
  }

  /*
   * База, созданная до появления настройки разделов, о ней не знает. Если просто
   * подставить список по умолчанию, редкие разделы (выпечка, закуски) окажутся
   * выключены — и уже внесённые блюда пропадут из фильтров. Поэтому к умолчанию
   * добавляем все разделы, которые реально встречаются в рецептах.
   */
  if (!Array.isArray(raw.settings?.categories)) {
    const used = new Set<string>()
    for (const recipe of Object.values(db.recipes)) {
      if (!recipe.deletedAt && recipe.category) used.add(recipe.category)
    }
    db.settings.categories = [
      ...db.settings.categories,
      ...[...used].filter((category) => !db.settings.categories.includes(category)),
    ]
  }

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
  const bindings = mergeUserBindings(a.settings, b.settings)
  result.settings.userEmails = bindings.emails
  result.settings.userEmailsAt = bindings.at
  result.settings.sharedWith = [
    ...new Set([...(a.settings.sharedWith ?? []), ...(b.settings.sharedWith ?? [])]),
  ]
  result.settings.purgedAt = maxIso(a.settings.purgedAt, b.settings.purgedAt)

  return result
}

/**
 * Привязки почт сливаются по каждому человеку отдельно, по времени последней правки.
 * Прежний вариант «непустое значение второй стороны побеждает» приводил к тому,
 * что перепривязку («Это не я») удалённая копия откатывала при каждой синхронизации,
 * а после смены Google-аккаунта окно «Кто вы?» возвращалось бесконечно.
 */
function mergeUserBindings(
  a: { userEmails?: Partial<Record<UserId, string>>; userEmailsAt?: Partial<Record<UserId, string>> },
  b: { userEmails?: Partial<Record<UserId, string>>; userEmailsAt?: Partial<Record<UserId, string>> },
): { emails: Partial<Record<UserId, string>>; at: Partial<Record<UserId, string>> } {
  const emails: Partial<Record<UserId, string>> = {}
  const at: Partial<Record<UserId, string>> = {}
  for (const user of USERS) {
    const id = user.id
    const aVal = a.userEmails?.[id]
    const bVal = b.userEmails?.[id]
    const aAt = a.userEmailsAt?.[id] ?? ''
    const bAt = b.userEmailsAt?.[id] ?? ''

    let value = bAt > aAt ? bVal : aVal
    let when = bAt > aAt ? bAt : aAt
    // Выбранная сторона про этого человека ничего не знает — берём другую.
    if (value === undefined && (bVal !== undefined || aVal !== undefined)) {
      value = bVal !== undefined ? bVal : aVal
      when = bVal !== undefined ? bAt : aAt
    }

    if (value !== undefined) emails[id] = value
    if (when) at[id] = when
  }
  return { emails, at }
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

/**
 * Сериализация со стабильным порядком ключей. Два устройства строят объект базы
 * в разном порядке вставки; без сортировки одинаковое содержимое давало разные
 * строки, сравнение «есть ли изменения» всегда срабатывало, и телефоны
 * бесконечно перезаливали файл друг за другом.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function serialize(db: Database): string {
  return JSON.stringify(sortKeys(db), null, 1)
}
