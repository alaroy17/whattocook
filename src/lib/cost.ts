import type { Product, Recipe, RecipeIngredient } from '../types'
import { normalizeName } from './util'

export type ProductIndex = Map<string, Product>

export function buildProductIndex(products: Product[]): ProductIndex {
  const index: ProductIndex = new Map()
  for (const product of products) index.set(normalizeName(product.name), product)
  return index
}

/** Приводим единицы к базовым, чтобы «200 г» и цена «за кг» сходились. */
const BASE: Record<string, { base: string; factor: number }> = {
  'г': { base: 'г', factor: 1 },
  'кг': { base: 'г', factor: 1000 },
  'мл': { base: 'мл', factor: 1 },
  'л': { base: 'мл', factor: 1000 },
  'шт': { base: 'шт', factor: 1 },
}

function toBase(qty: number, unit: string): { qty: number; base: string } | null {
  const rule = BASE[unit]
  if (!rule) return null
  return { qty: qty * rule.factor, base: rule.base }
}

/** Цена ингредиента, если продукт есть в каталоге и единицы совместимы. */
export function ingredientCost(ingredient: RecipeIngredient, index: ProductIndex): number | null {
  if (ingredient.qty == null) return null
  const product = index.get(normalizeName(ingredient.name))
  if (!product || product.price == null) return null
  if (product.unit === ingredient.unit) return ingredient.qty * product.price
  const left = toBase(ingredient.qty, ingredient.unit)
  const right = toBase(1, product.unit)
  if (!left || !right || left.base !== right.base) return null
  return (left.qty / right.qty) * product.price
}

export interface RecipeCost {
  total: number
  known: number
  unknown: string[]
}

export function recipeCost(recipe: Recipe, index: ProductIndex, multiplier = 1): RecipeCost {
  let total = 0
  let known = 0
  const unknown: string[] = []
  for (const ingredient of recipe.ingredients) {
    const cost = ingredientCost(ingredient, index)
    if (cost == null) unknown.push(ingredient.name)
    else {
      total += cost * multiplier
      known++
    }
  }
  return { total, known, unknown }
}

/**
 * Во сколько раз масштабировать рецепт, если готовим на другое число порций.
 * Без указанных порций в рецепте пересчитывать не от чего — множитель 1.
 */
export function servingsMultiplier(recipe: Recipe, servings: number | null | undefined): number {
  if (!recipe.servings || !servings || servings <= 0) return 1
  return servings / recipe.servings
}

export function scaleIngredient(ingredient: RecipeIngredient, multiplier: number): RecipeIngredient {
  if (multiplier === 1 || ingredient.qty == null) return ingredient
  return { ...ingredient, qty: roundQty(ingredient.qty * multiplier) }
}

/** Человеческое округление: 583,33 г — это 580 г, а 2,33 шт — 2,5. */
function roundQty(value: number): number {
  if (value >= 100) return Math.round(value / 10) * 10
  if (value >= 10) return Math.round(value)
  const half = Math.round(value * 2) / 2
  if (half > 0) return half
  // Микроколичество не должно округляться в ноль: 0,2 ч.л. — это не «ничего».
  const fine = Math.round(value * 100) / 100
  return fine > 0 ? fine : value
}

/** Доля ингредиентов, которые уже есть дома. */
export function stockRatio(recipe: Recipe, index: ProductIndex): number {
  if (recipe.ingredients.length === 0) return 1
  let inStock = 0
  for (const ingredient of recipe.ingredients) {
    const product = index.get(normalizeName(ingredient.name))
    if (product?.inStock) inStock++
  }
  return inStock / recipe.ingredients.length
}

export function missingIngredients(recipe: Recipe, index: ProductIndex): RecipeIngredient[] {
  return recipe.ingredients.filter((ingredient) => !index.get(normalizeName(ingredient.name))?.inStock)
}
