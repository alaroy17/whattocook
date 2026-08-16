import type { Recipe } from '../types'
import { type ProductIndex, ingredientCost } from './cost'
import { formatAmount, normalizeName } from './util'

export interface ShoppingItem {
  key: string
  name: string
  qty: number | null
  unit: string
  group: string
  cost: number | null
  inStock: boolean
  /** Для каких блюд нужен продукт — видно, если что-то решишь вычеркнуть. */
  usedIn: string[]
  notes: string[]
}

const COMPATIBLE: Record<string, { base: string; factor: number }> = {
  'г': { base: 'г', factor: 1 },
  'кг': { base: 'г', factor: 1000 },
  'мл': { base: 'мл', factor: 1 },
  'л': { base: 'мл', factor: 1000 },
}

/** «1200 г» читается хуже, чем «1,2 кг». */
function prettify(qty: number, unit: string): { qty: number; unit: string } {
  if (unit === 'г' && qty >= 1000) return { qty: Math.round((qty / 1000) * 100) / 100, unit: 'кг' }
  if (unit === 'мл' && qty >= 1000) return { qty: Math.round((qty / 1000) * 100) / 100, unit: 'л' }
  return { qty: Math.round(qty * 100) / 100, unit }
}

export function buildShoppingList(
  items: { recipe: Recipe; multiplier?: number }[],
  index: ProductIndex,
): ShoppingItem[] {
  const map = new Map<string, ShoppingItem & { rawQty: number | null; rawUnit: string }>()

  for (const { recipe, multiplier = 1 } of items) {
    for (const ingredient of recipe.ingredients) {
      if (!ingredient.name.trim()) continue
      const normalized = normalizeName(ingredient.name)
      const rule = COMPATIBLE[ingredient.unit]
      const baseUnit = rule?.base ?? ingredient.unit
      const key = `${normalized}|${baseUnit}`
      const qty = ingredient.qty == null ? null : ingredient.qty * (rule?.factor ?? 1) * multiplier
      const product = index.get(normalized)
      const cost = ingredientCost(
        { ...ingredient, qty: ingredient.qty == null ? null : ingredient.qty * multiplier },
        index,
      )

      const existing = map.get(key)
      if (existing) {
        existing.rawQty = existing.rawQty == null || qty == null ? existing.rawQty ?? qty : existing.rawQty + qty
        existing.cost = existing.cost == null || cost == null ? existing.cost ?? cost : existing.cost + cost
        if (!existing.usedIn.includes(recipe.name)) existing.usedIn.push(recipe.name)
        if (ingredient.note && !existing.notes.includes(ingredient.note)) existing.notes.push(ingredient.note)
      } else {
        map.set(key, {
          key,
          name: ingredient.name.trim(),
          qty: null,
          unit: baseUnit,
          group: product?.group ?? 'Прочее',
          cost,
          inStock: Boolean(product?.inStock),
          usedIn: [recipe.name],
          notes: ingredient.note ? [ingredient.note] : [],
          rawQty: qty,
          rawUnit: baseUnit,
        })
      }
    }
  }

  return [...map.values()]
    .map((item) => {
      const pretty = item.rawQty == null ? null : prettify(item.rawQty, item.rawUnit)
      return {
        key: item.key,
        name: item.name,
        qty: pretty?.qty ?? null,
        unit: pretty?.unit ?? item.unit,
        group: item.group,
        cost: item.cost,
        inStock: item.inStock,
        usedIn: item.usedIn,
        notes: item.notes,
      }
    })
    .sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.name.localeCompare(b.name, 'ru'))
}

export function groupShoppingList(items: ShoppingItem[]): { group: string; items: ShoppingItem[] }[] {
  const groups = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const list = groups.get(item.group) ?? []
    list.push(item)
    groups.set(item.group, list)
  }
  return [...groups.entries()].map(([group, list]) => ({ group, items: list }))
}

const CHECKED_KEY = 'wtc.shopping.checked'

/**
 * Вычеркнутое хранится по неделям, а не одним слотом: одна общая запись затиралась
 * при листании недель — заглянул в следующую неделю, вернулся, а отметки текущей
 * пропали. Держим несколько последних недель.
 */
type CheckedStore = Record<string, string[]>

function loadStore(): CheckedStore {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKED_KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return {}
    // Прежний формат — { weekStart, keys } одной недели.
    const legacy = raw as { weekStart?: string; keys?: string[] }
    if (typeof legacy.weekStart === 'string' && Array.isArray(legacy.keys)) {
      return { [legacy.weekStart]: legacy.keys }
    }
    const store: CheckedStore = {}
    for (const [week, keys] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(keys)) store[week] = keys.filter((k): k is string => typeof k === 'string')
    }
    return store
  } catch {
    return {}
  }
}

export function loadChecked(weekStart: string): Set<string> {
  return new Set(loadStore()[weekStart] ?? [])
}

export function saveChecked(weekStart: string, checked: Set<string>): void {
  const store = loadStore()
  store[weekStart] = [...checked]
  // Старые недели не нужны — оставляем шесть последних.
  const weeks = Object.keys(store).sort().reverse().slice(0, 6)
  const trimmed: CheckedStore = {}
  for (const week of weeks) trimmed[week] = store[week]
  localStorage.setItem(CHECKED_KEY, JSON.stringify(trimmed))
}

/** Текст для отправки в мессенджер — «скинь мне список». */
export function shoppingListToText(groups: { group: string; items: ShoppingItem[] }[]): string {
  return groups
    .map(({ group, items }) => {
      const lines = items.map((item) => {
        const amount = item.qty != null ? formatAmount(item.qty, item.unit) : ''
        return `• ${item.name}${amount ? ` — ${amount}` : ''}`
      })
      return `${group}\n${lines.join('\n')}`
    })
    .join('\n\n')
}
