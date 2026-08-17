import type { Database, Entry } from '../types'
import { alive } from './db'
import { diffDays, type IsoDate } from './date'

/**
 * Запись этого блюда на этот день, если она уже есть.
 * Нужна, чтобы кнопки «готовим сегодня» не плодили дубли:
 * одно блюдо в один день добавляется один раз, повторное нажатие
 * должно осмысленно ответить, а не создать копию.
 */
export function entryForRecipeOn(db: Database, date: IsoDate, recipeId: string): Entry | undefined {
  return alive(db.entries).find((entry) => entry.date === date && entry.recipeId === recipeId)
}

/**
 * Похоже, что это остатки: то же блюдо уже есть в календаре день-два назад —
 * готовили кастрюлю, едим второй вечер. Такая запись помечается «доедаем».
 *
 * Постоянные блюда не в счёт: омлет и салат каждый раз готовятся заново,
 * два дня подряд — это две готовки, а не одна кастрюля.
 */
export function isLikelyLeftovers(db: Database, date: IsoDate, recipeId: string): boolean {
  if (db.recipes[recipeId]?.regular) return false
  return alive(db.entries).some(
    (entry) => entry.recipeId === recipeId && entry.date < date && diffDays(entry.date, date) <= 2,
  )
}
