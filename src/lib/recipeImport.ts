import { CATEGORIES, UNITS, type Database, type Recipe, type RecipeIngredient } from '../types'
import { visibleCategories } from './categories'
import { parseIngredientLine } from './ingredientText'

/**
 * Импорт рецепта через нейросеть: приложение выдаёт готовый запрос, человек
 * скармливает его любому чату вместе со ссылкой или текстом рецепта, а ответ
 * вставляет обратно. Разбор намеренно снисходительный — модели любят обрамлять
 * JSON пояснениями и markdown-заборчиками.
 */

export function buildImportPrompt(db: Database): string {
  const categories = visibleCategories(db)
  const units = UNITS.filter(Boolean)
  return `Разбери рецепт и верни ТОЛЬКО JSON без пояснений и без markdown.

Формат — объект (или массив объектов, если рецептов несколько):
{
  "name": "название блюда",
  "category": "один из: ${categories.join(', ')}",
  "timeMin": число минут или null,
  "servings": число порций или null,
  "difficulty": 1 | 2 | 3,
  "tags": ["короткие метки"],
  "ingredients": [
    { "name": "продукт", "qty": число или null, "unit": "одна из: ${units.join(', ')}, либо пустая строка", "note": "по вкусу и т.п., необязательно" }
  ],
  "steps": "как готовить, шаги с новой строки",
  "sourceUrl": "ссылка на исходный рецепт, если есть"
}

Правила:
- Если количество не указано или оно не важно — ставь qty: null и unit: "". Не выдумывай граммы.
- Названия продуктов — в именительном падеже, единственном числе: «Помидоры», «Куриное филе».
- category выбирай строго из списка выше. Если не подходит ничего — ставь "${categories[0] ?? 'Основное'}".
- difficulty: 1 просто, 2 средне, 3 заморочно.
- Ничего не добавляй от себя: если данных нет, ставь null.

Рецепт:
`
}

export interface ImportedRecipe {
  name: string
  category: string
  timeMin: number | null
  servings: number | null
  difficulty: 1 | 2 | 3
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: string
  sourceUrl?: string
}

export interface ImportResult {
  recipes: ImportedRecipe[]
  error: string | null
}

/** Вытаскивает JSON из ответа модели: она часто оборачивает его в ```json или в текст. */
function extractJson(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  if (candidate.startsWith('{') || candidate.startsWith('[')) return candidate

  // JSON где-то посреди текста — берём от первой скобки до последней парной.
  const start = candidate.search(/[[{]/)
  if (start < 0) return null
  const opener = candidate[start]
  const closer = opener === '[' ? ']' : '}'
  const end = candidate.lastIndexOf(closer)
  return end > start ? candidate.slice(start, end + 1) : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    // Берём первое число, а не склейку всех цифр: «2-3 порции» — это 2, а не 23.
    const match = value.match(/\d+(?:[.,]\d+)?/)
    if (match) {
      const parsed = Number(match[0].replace(',', '.'))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function normalizeIngredient(raw: unknown): RecipeIngredient | null {
  // Модель могла вернуть строкой — разбираем так же, как ручной ввод списком.
  if (typeof raw === 'string') return parseIngredientLine(raw)
  if (!raw || typeof raw !== 'object') return null

  const item = raw as Record<string, unknown>
  const name = String(item.name ?? '').trim()
  if (!name) return null

  const unit = String(item.unit ?? '').trim()
  const known = (UNITS as readonly string[]).includes(unit) ? unit : ''
  const note = String(item.note ?? '').trim()

  return {
    name,
    qty: asNumber(item.qty),
    unit: known,
    ...(note ? { note } : {}),
  }
}

function normalizeRecipe(raw: unknown, allowedCategories: string[]): ImportedRecipe | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = String(item.name ?? '').trim()
  if (!name) return null

  const category = String(item.category ?? '').trim()
  const known =
    allowedCategories.find((option) => option.toLowerCase() === category.toLowerCase()) ??
    (CATEGORIES as readonly string[]).find((option) => option.toLowerCase() === category.toLowerCase()) ??
    allowedCategories[0] ??
    'Основное'

  const difficultyRaw = asNumber(item.difficulty) ?? 1
  const difficulty = (difficultyRaw >= 3 ? 3 : difficultyRaw >= 2 ? 2 : 1) as 1 | 2 | 3

  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.map(normalizeIngredient).filter((value): value is RecipeIngredient => value !== null)
    : []

  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
    : []

  const steps = Array.isArray(item.steps)
    ? item.steps.map((step) => String(step).trim()).filter(Boolean).join('\n')
    : String(item.steps ?? '').trim()

  const sourceUrl = String(item.sourceUrl ?? '').trim()

  return {
    name,
    category: known,
    timeMin: asNumber(item.timeMin),
    servings: asNumber(item.servings),
    difficulty,
    tags,
    ingredients,
    steps,
    ...(sourceUrl ? { sourceUrl } : {}),
  }
}

export function parseImportedRecipes(text: string, db: Database): ImportResult {
  const json = extractJson(text)
  if (!json) {
    return { recipes: [], error: 'Не нашли JSON в ответе. Скопируйте ответ модели целиком.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { recipes: [], error: 'JSON не разобрался — возможно, ответ скопирован не полностью.' }
  }

  const allowed = visibleCategories(db)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const recipes = list
    .map((entry) => normalizeRecipe(entry, allowed))
    .filter((value): value is ImportedRecipe => value !== null)

  if (recipes.length === 0) {
    return { recipes: [], error: 'В ответе нет ни одного рецепта с названием.' }
  }
  return { recipes, error: null }
}

/** Заготовка для сохранения — остальные поля проставит saveRecipe. */
export function toRecipeDraft(imported: ImportedRecipe): Partial<Recipe> {
  return {
    name: imported.name,
    category: imported.category,
    tags: imported.tags,
    ingredients: imported.ingredients,
    steps: imported.steps,
    timeMin: imported.timeMin,
    servings: imported.servings,
    difficulty: imported.difficulty,
    chef: 'any',
    favorite: false,
    ratings: {},
    sourceUrl: imported.sourceUrl,
  }
}
