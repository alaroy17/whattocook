import type { Chef, Database, MealSlot, Recipe } from '../types'
import { alive } from './db'
import { diffDays, today, type IsoDate } from './date'
import { buildProductIndex, stockRatio } from './cost'
import { clamp, daysWord } from './util'

/** Никогда не готовили — считаем как «очень давно», чтобы такие блюда всплывали наверх. */
const NEVER_DAYS = 400

export interface CookHistory {
  lastCooked: Map<string, IsoDate>
  timesCooked: Map<string, number>
  /** Последние приготовленные категории, чтобы не предлагать три супа подряд. */
  recentCategories: Map<string, IsoDate>
}

export function buildHistory(db: Database, upTo: IsoDate = today()): CookHistory {
  const lastCooked = new Map<string, IsoDate>()
  const timesCooked = new Map<string, number>()
  const recentCategories = new Map<string, IsoDate>()
  const entries = alive(db.entries)
    .filter((entry) => entry.status === 'done' && entry.recipeId && entry.date <= upTo)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const entry of entries) {
    const id = entry.recipeId!
    // «Доедаем» обновляет давность (ели же), но готовкой не считается.
    lastCooked.set(id, entry.date)
    if (!entry.leftovers) timesCooked.set(id, (timesCooked.get(id) ?? 0) + 1)
    const category = db.recipes[id]?.category
    if (category) recentCategories.set(category, entry.date)
  }
  return { lastCooked, timesCooked, recentCategories }
}

export function daysSince(history: CookHistory, recipeId: string, date: IsoDate = today()): number | null {
  const last = history.lastCooked.get(recipeId)
  if (!last) return null
  return diffDays(last, date)
}

export interface SuggestFilters {
  category?: string
  chef?: Chef | 'all'
  maxTime?: number | null
  tag?: string
  onlyInStock?: boolean
  search?: string
  /** Не показывать постоянные блюда: на главной у них отдельный список. */
  excludeRegular?: boolean
}

export interface Suggestion {
  recipe: Recipe
  score: number
  days: number | null
  reasons: string[]
  /** Готовили совсем недавно — прячем из подсказок, но показываем в списке. */
  tooRecent: boolean
}

function averageRating(recipe: Recipe): number | null {
  const values = Object.values(recipe.ratings ?? {}).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Оценка «насколько уместно приготовить это сегодня».
 * Основной вес — сколько дней не готовили; дальше оценки, избранное, наличие продуктов
 * и штраф за повтор той же категории пару дней назад.
 */
export function scoreRecipes(
  db: Database,
  filters: SuggestFilters = {},
  date: IsoDate = today(),
): Suggestion[] {
  const history = buildHistory(db, date)
  const index = buildProductIndex(alive(db.products))
  const cooldown = db.settings.cooldownDays
  const search = filters.search?.trim().toLowerCase()

  const result: Suggestion[] = []
  for (const recipe of alive(db.recipes)) {
    if (recipe.archived) continue
    if (filters.excludeRegular && recipe.regular) continue
    if (filters.category && recipe.category !== filters.category) continue
    if (filters.chef && filters.chef !== 'all' && recipe.chef !== filters.chef && recipe.chef !== 'any') continue
    if (filters.tag && !recipe.tags.includes(filters.tag)) continue
    if (filters.maxTime && (recipe.timeMin ?? 999) > filters.maxTime) continue
    if (search) {
      const haystack = [
        recipe.name,
        recipe.category,
        recipe.steps,
        ...recipe.tags,
        ...recipe.ingredients.map((i) => i.name),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) continue
    }

    const days = daysSince(history, recipe.id, date)
    const effectiveDays = days ?? NEVER_DAYS
    const reasons: string[] = []

    /**
     * Постоянные блюда (салат к ужину, омлет) живут по своему ритму: для них
     * «пора» наступает через привычный интервал, а не через месяцы.
     */
    const interval = recipe.regular ? Math.max(1, recipe.regularEveryDays || 7) : null
    let score: number
    if (interval) {
      score = clamp(effectiveDays / interval, 0, 2) * 55
      if (days != null && days >= interval) reasons.push('пора по расписанию')
    } else {
      score = (clamp(effectiveDays, 0, 240) / 240) * 100
    }

    if (days == null) {
      score += 25
      reasons.push('ещё ни разу не готовили')
    } else if (!interval && days >= 30) {
      reasons.push(`не готовили ${daysWord(days)}`)
    }

    const rating = averageRating(recipe)
    if (rating != null) {
      score += (rating - 3) * 15
      if (rating >= 4.5) reasons.push('высокая оценка')
    }
    if (recipe.favorite) {
      score += 12
      reasons.push('в избранном')
    }

    const ratio = stockRatio(recipe, index)
    if (db.settings.preferInStock || filters.onlyInStock) {
      score += ratio * 25
      if (ratio === 1 && recipe.ingredients.length > 0) reasons.push('все продукты дома')
      else if (ratio >= 0.75) reasons.push('почти всё есть дома')
    }
    if (filters.onlyInStock && ratio < 0.999) continue

    const sameCategoryAt = recipe.category ? history.recentCategories.get(recipe.category) : undefined
    if (sameCategoryAt && diffDays(sameCategoryAt, date) <= 2) score -= 18

    if (recipe.timeMin != null && recipe.timeMin <= 20) {
      score += 6
      reasons.push(`быстро — ${recipe.timeMin} мин`)
    }
    if (recipe.difficulty === 3) score -= 5

    // Для постоянных блюд карантин короткий — иначе салат «раз в три дня» никогда не всплывёт.
    const quiet = interval ? Math.max(1, Math.round(interval / 2)) : cooldown
    const tooRecent = days != null && days < quiet
    if (tooRecent) score -= 200

    result.push({ recipe, score, days, reasons: reasons.slice(0, 3), tooRecent })
  }

  return result.sort((a, b) => b.score - a.score)
}

/** Случайное блюдо: не совсем равномерно — блюда с высоким счётом выпадают чаще. */
export function pickRandom(suggestions: Suggestion[], fair = false): Suggestion | null {
  const pool = suggestions.filter((s) => !s.tooRecent)
  // Всё готовили на днях — честно ничего не предлагаем, а не подсовываем вчерашнее.
  if (pool.length === 0) return null
  if (fair) return pool[Math.floor(Math.random() * pool.length)]
  const top = pool.slice(0, Math.min(25, pool.length))
  const min = Math.min(...top.map((s) => s.score))
  const weights = top.map((s) => (s.score - min + 10) ** 1.5)
  const total = weights.reduce((sum, w) => sum + w, 0)
  let ticket = Math.random() * total
  for (let i = 0; i < top.length; i++) {
    ticket -= weights[i]
    if (ticket <= 0) return top[i]
  }
  return top[top.length - 1]
}

/**
 * Куда записать блюдо, если приём пищи не выбирали явно.
 *
 * Для блюда решает раздел, а не время суток: плов, добавленный утром, — это план
 * на ужин, а не «завтрак, потому что сейчас утро». Время суток используется только
 * для свободной записи без блюда («Записать…») — там человек фиксирует то, что ест
 * прямо сейчас.
 */
export function guessMeal(category: string | undefined, at: Date = new Date()): MealSlot {
  if (category === 'Завтрак') return 'breakfast'
  if (category === 'Суп' || category === 'Обед') return 'lunch'
  if (
    category === 'Десерт' ||
    category === 'Выпечка' ||
    category === 'Закуска' ||
    category === 'Перекус' ||
    category === 'Напиток'
  )
    return 'snack'
  if (category !== undefined) return 'dinner'
  const hour = at.getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  return 'dinner'
}

export interface RegularItem {
  recipe: Recipe
  days: number | null
  interval: number
  /** Пора приготовить снова. */
  due: boolean
}

/** Постоянные блюда — то, что едят регулярно и добавляют в историю в одно нажатие. */
export function regularRecipes(db: Database, date: IsoDate = today()): RegularItem[] {
  const history = buildHistory(db, date)
  return alive(db.recipes)
    .filter((recipe) => recipe.regular && !recipe.archived)
    .map((recipe) => {
      const days = daysSince(history, recipe.id, date)
      const interval = Math.max(1, recipe.regularEveryDays || 7)
      return { recipe, days, interval, due: days == null || days >= interval }
    })
    .sort((a, b) => (b.days ?? 999) / b.interval - (a.days ?? 999) / a.interval)
}

