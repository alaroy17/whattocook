import { UNITS, type RecipeIngredient } from '../types'

/**
 * Ингредиенты строкой — чтобы можно было просто накидать список продуктов,
 * а не заполнять три поля на каждую позицию.
 *
 * Понимает: «Помидоры», «Помидоры 2 шт», «Мука — 200 г», «Соль, по вкусу»,
 * «2 шт помидоры». Количество и единица необязательны.
 */

const UNIT_WORDS = new Map<string, string>()
for (const unit of UNITS) {
  if (unit) UNIT_WORDS.set(unit.toLowerCase().replace(/\.$/, ''), unit)
}
// Частые написания, которые люди и нейросети используют вместо наших сокращений.
const UNIT_ALIASES: Record<string, string> = {
  'грамм': 'г', 'граммов': 'г', 'гр': 'г', 'g': 'г',
  'килограмм': 'кг', 'kg': 'кг',
  'миллилитров': 'мл', 'ml': 'мл',
  'литр': 'л', 'литров': 'л', 'l': 'л',
  'штук': 'шт', 'штуки': 'шт', 'шт': 'шт', 'pcs': 'шт',
  'упаковка': 'упак.', 'упаковки': 'упак.', 'упак': 'упак.', 'пачка': 'упак.', 'пачки': 'упак.',
  'банки': 'банка', 'банок': 'банка',
  'столовая ложка': 'ст.л.', 'ст л': 'ст.л.', 'стл': 'ст.л.', 'ложка': 'ст.л.',
  'чайная ложка': 'ч.л.', 'ч л': 'ч.л.', 'чл': 'ч.л.',
  'стакан': 'стак.', 'стакана': 'стак.', 'стаканов': 'стак.',
  'зубчик': 'зуб.', 'зубчика': 'зуб.', 'зубчиков': 'зуб.',
  'щепотка': 'щеп.', 'щепотки': 'щеп.',
  'пучка': 'пучок', 'пучков': 'пучок',
}

function normalizeUnit(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!key) return null
  return UNIT_WORDS.get(key) ?? UNIT_ALIASES[key] ?? null
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
/** Количество бывает диапазоном: «2-3 шт». Берём нижнюю границу. */
const NUMBER_RANGE = String.raw`\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?`

function firstNumber(range: string): number {
  const match = range.match(new RegExp(NUMBER))
  return Number((match?.[0] ?? range).replace(',', '.'))
}

/** Пометки, которые пишут через запятую: «Соль, по вкусу». */
const COMMA_NOTES = /,\s*(по вкусу|по желанию|опционально|для подачи|для украшения)\s*$/i

export function parseIngredientLine(line: string): RecipeIngredient | null {
  /*
   * Убираем маркеры списка: «-», «•», «1.», «2)». Важно не тронуть само число
   * количества — иначе «200 г творога» превращается в «г творога».
   */
  let rest = line.trim().replace(/^(?:[-–—•*+]+\s*|\d+[.)]\s+)/, '').trim()
  if (!rest) return null

  // Хвост в скобках или после запятой считаем пометкой: «по вкусу», «опционально».
  let note: string | undefined
  const noteMatch = rest.match(/[(（]([^)）]*)[)）]\s*$/)
  if (noteMatch) {
    note = noteMatch[1].trim()
    rest = rest.slice(0, noteMatch.index).trim()
  }
  const commaNote = rest.match(COMMA_NOTES)
  if (commaNote) {
    note = note ? `${commaNote[1]}, ${note}` : commaNote[1]
    rest = rest.slice(0, commaNote.index).trim()
  }

  let qty: number | null = null
  let unit = ''

  const take = (value: string, measure: string | null) => {
    qty = firstNumber(value)
    unit = measure ?? ''
  }

  // «Мука — 200 г» / «Мука 200 г» / «Яйца 2-3 шт»
  const trailing = rest.match(
    new RegExp(String.raw`^(.*?)[\s,—–]*(${NUMBER_RANGE})\s*([а-яёa-z.]*)\s*$`, 'i'),
  )
  // «200 г муки» / «2 шт помидоры»
  const leading = rest.match(new RegExp(String.raw`^(${NUMBER_RANGE})\s*([а-яёa-z.]*)\s+(.+)$`, 'i'))

  if (trailing && trailing[1].trim()) {
    const measure = normalizeUnit(trailing[3])
    if (measure || !trailing[3]) {
      take(trailing[2], measure)
      rest = trailing[1].trim()
    }
  } else if (leading) {
    const measure = normalizeUnit(leading[2])
    if (measure || !leading[2]) {
      take(leading[1], measure)
      rest = leading[3].trim()
    }
  }

  const name = rest.replace(/[\s,:—–-]+$/, '').trim()
  if (!name) return null
  return { name, qty, unit, ...(note ? { note } : {}) }
}

export function parseIngredientList(text: string): RecipeIngredient[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((item): item is RecipeIngredient => item !== null)
}

export function ingredientsToText(ingredients: RecipeIngredient[]): string {
  return ingredients
    .map((item) => {
      const amount = [item.qty ?? '', item.unit ?? ''].join(' ').trim()
      const note = item.note ? ` (${item.note})` : ''
      return amount ? `${item.name} — ${amount}${note}` : `${item.name}${note}`
    })
    .join('\n')
}
