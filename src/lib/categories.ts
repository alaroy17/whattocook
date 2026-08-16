import type { Database, Recipe } from '../types'
import { alive } from './db'

/**
 * Разделы, которые пользователь оставил включёнными.
 * Если у блюда стоит выключенный раздел, он всё равно показывается в его карточке —
 * скрытие влияет только на фильтры и на выбор при создании.
 */
export function visibleCategories(db: Database): string[] {
  const enabled = db.settings.categories ?? []
  return enabled.length > 0 ? enabled : uniqueCategories(alive(db.recipes))
}

export function uniqueCategories(recipes: Recipe[]): string[] {
  const set = new Set<string>()
  for (const recipe of recipes) if (recipe.category) set.add(recipe.category)
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

/** Список для выпадашки в форме блюда: включённые разделы плюс текущий, даже если он скрыт. */
export function categoryOptions(db: Database, current?: string): string[] {
  const list = visibleCategories(db)
  return current && !list.includes(current) ? [current, ...list] : list
}

/** Разделы, в которых реально есть блюда — чтобы не показывать пустые фильтры. */
export function categoriesWithRecipes(db: Database): string[] {
  const counts = new Map<string, number>()
  for (const recipe of alive(db.recipes)) {
    if (recipe.archived) continue
    counts.set(recipe.category, (counts.get(recipe.category) ?? 0) + 1)
  }
  return visibleCategories(db).filter((category) => (counts.get(category) ?? 0) > 0)
}
