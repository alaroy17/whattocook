import type { Database, Entry } from '../types'
import { alive } from './db'
import type { IsoDate } from './date'

/**
 * Запись этого блюда на этот день, если она уже есть.
 * Нужна, чтобы кнопки «готовим сегодня» не плодили дубли:
 * одно блюдо в один день добавляется один раз, повторное нажатие
 * должно осмысленно ответить, а не создать копию.
 */
export function entryForRecipeOn(db: Database, date: IsoDate, recipeId: string): Entry | undefined {
  return alive(db.entries).find((entry) => entry.date === date && entry.recipeId === recipeId)
}
