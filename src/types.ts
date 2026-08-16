/** Двое пользователей приложения. Идентификаторы зашиты — это семейное приложение. */
export type UserId = 'sasha' | 'andrei'

export const USERS: { id: UserId; name: string; short: string; figure: 'female' | 'male' }[] = [
  { id: 'sasha', name: 'Саша', short: 'С', figure: 'female' },
  { id: 'andrei', name: 'Андрей', short: 'А', figure: 'male' },
]

export function userName(id: string | undefined | null): string {
  if (id === 'both') return 'Вместе'
  if (id === 'outside') return 'Не готовили'
  return USERS.find((u) => u.id === id)?.name ?? '—'
}

/** Кто отвечает за блюдо. */
export type Chef = UserId | 'any'
/** Кто фактически готовил конкретный раз. */
export type Cook = UserId | 'both' | 'outside'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: { id: MealSlot; name: string }[] = [
  { id: 'breakfast', name: 'Завтрак' },
  { id: 'lunch', name: 'Обед' },
  { id: 'dinner', name: 'Ужин' },
  { id: 'snack', name: 'Перекус' },
]

export const CATEGORIES = [
  'Завтрак',
  'Суп',
  'Основное',
  'Гарнир',
  'Салат',
  'Закуска',
  'Выпечка',
  'Десерт',
  'Напиток',
  'Заготовка',
] as const
export type Category = (typeof CATEGORIES)[number]

/** Разделы, включённые у новой пары: редкие (выпечка, заготовки) по умолчанию скрыты. */
export const DEFAULT_CATEGORIES: string[] = ['Завтрак', 'Суп', 'Основное', 'Гарнир', 'Салат', 'Десерт']

/** Цвет раздела — им кодируются дни в календаре. */
const CATEGORY_PALETTE = [
  '#c1613f',
  '#6c8a5a',
  '#3a7a8c',
  '#8e5aa8',
  '#b3822f',
  '#8c5a4a',
  '#4a6ea8',
  '#a4544f',
  '#5b8f7d',
  '#96702f',
]

export function categoryColor(category: string | undefined): string {
  if (!category) return '#9a8e7f'
  const known = (CATEGORIES as readonly string[]).indexOf(category)
  if (known >= 0) return CATEGORY_PALETTE[known % CATEGORY_PALETTE.length]
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) % 1000
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}

/** Категории продуктов — используются для группировки списка покупок. */
export const PRODUCT_GROUPS = [
  'Овощи и зелень',
  'Фрукты',
  'Мясо и птица',
  'Рыба',
  'Молочное и яйца',
  'Бакалея',
  'Хлеб',
  'Заморозка',
  'Специи и соусы',
  'Напитки',
  'Прочее',
] as const
export type ProductGroup = (typeof PRODUCT_GROUPS)[number]

export const UNITS = ['г', 'кг', 'мл', 'л', 'шт', 'ст.л.', 'ч.л.', 'стак.', 'пучок', 'зуб.', 'щеп.'] as const

/** Общие поля всех сущностей: нужны для слияния изменений двух устройств. */
export interface Syncable {
  id: string
  createdAt: string
  updatedAt: string
  /** Мягкое удаление: запись остаётся как «надгробие», чтобы удаление доехало до второго устройства. */
  deletedAt?: string
}

export interface RecipeIngredient {
  name: string
  qty: number | null
  unit: string
  /** «по вкусу», «опционально» и т.п. */
  note?: string
}

export interface Recipe extends Syncable {
  name: string
  category: Category | string
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: string
  /** Время приготовления в минутах. */
  timeMin: number | null
  /** 1 — просто, 2 — средне, 3 — заморочно. */
  difficulty: 1 | 2 | 3
  chef: Chef
  favorite: boolean
  ratings: Partial<Record<UserId, number>>
  servings: number | null
  sourceUrl?: string
  /** id файла фотографии в Google Drive. */
  photoId?: string
  /** Блюдо не предлагать в подсказках, но историю сохранить. */
  archived?: boolean
  /**
   * Постоянное блюдо, которое едят регулярно (салат, омлет).
   * Для таких «давно не готовили» считается не от нуля, а от привычного интервала.
   */
  regular?: boolean
  /** Раз во сколько дней его обычно едят. */
  regularEveryDays?: number | null
}

/**
 * Одна запись в календаре. Планы и факты — одна сущность:
 * запланировали (status = planned), приготовили — отметили (status = done).
 */
export interface Entry extends Syncable {
  /** YYYY-MM-DD */
  date: string
  meal: MealSlot
  status: 'planned' | 'done'
  recipeId?: string
  /** Свободный текст, если ели что-то вне списка рецептов (доставка, кафе). */
  title?: string
  cook?: Cook
  note?: string
  ratings?: Partial<Record<UserId, number>>
  /** Фактическая стоимость, если хочется поправить расчётную. */
  cost?: number | null
}

export interface Product extends Syncable {
  name: string
  group: ProductGroup | string
  /** Единица, в которой указана цена. */
  unit: string
  /** Цена за одну единицу (за 1 г, 1 шт и т.д.) — считается из объёма упаковки. */
  price: number | null
  /** Как купили в последний раз: 900 г за 320 ₽. Хранится для удобства пересчёта. */
  packQty?: number | null
  packPrice?: number | null
  /** Есть дома. */
  inStock?: boolean
  stockUpdatedAt?: string
}

export interface Comment extends Syncable {
  recipeId: string
  author: UserId
  text: string
}

export interface Settings {
  /** Сколько дней блюдо считается «недавним» и не предлагается. */
  cooldownDays: number
  /** Учитывать наличие продуктов дома в подсказках. */
  preferInStock: boolean
  theme: 'system' | 'light' | 'dark'
  currency: string
  /** Разделы, которые видны в фильтрах и в форме блюда. Порядок задаёт пользователь. */
  categories: string[]
  /** Через сколько дней напоминать проверить холодильник. 0 — не напоминать. */
  fridgeRemindDays: number
  /** Когда в последний раз подтверждали, что список продуктов дома актуален. */
  fridgeReviewedAt: string | null
  /**
   * Какой Google-аккаунт кому принадлежит. Заполняется один раз при первом входе,
   * дальше приложение само понимает, кто им пользуется, — переключать вручную не нужно.
   */
  userEmails: Partial<Record<UserId, string>>
  /** Кому уже открыли доступ к папке на Диске — чтобы не гадать, ушло приглашение или нет. */
  sharedWith: string[]
  /**
   * Момент последней очистки корзины. Всё, что удалили до него, стирается
   * окончательно — и на втором устройстве тоже.
   */
  purgedAt: string | null
}

/** Сколько дней удалённое лежит в корзине, прежде чем исчезнуть навсегда. */
export const TOMBSTONE_DAYS = 120

export const DEFAULT_SETTINGS: Settings = {
  cooldownDays: 10,
  preferInStock: true,
  theme: 'system',
  currency: '₽',
  categories: DEFAULT_CATEGORIES,
  fridgeRemindDays: 7,
  fridgeReviewedAt: null,
  userEmails: {},
  sharedWith: [],
  purgedAt: null,
}

export interface Database {
  schemaVersion: 1
  recipes: Record<string, Recipe>
  entries: Record<string, Entry>
  products: Record<string, Product>
  comments: Record<string, Comment>
  settings: Settings
  settingsUpdatedAt: string
}

export function emptyDatabase(): Database {
  return {
    schemaVersion: 1,
    recipes: {},
    entries: {},
    products: {},
    comments: {},
    settings: { ...DEFAULT_SETTINGS },
    settingsUpdatedAt: new Date(0).toISOString(),
  }
}
