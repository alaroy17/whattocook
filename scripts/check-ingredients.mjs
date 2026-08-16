// Проверка разбора ингредиентов, введённых строкой.
import { parseIngredientLine } from '../.check/ingredientText.mjs'

let failed = 0
const check = (input, expected) => {
  const got = parseIngredientLine(input)
  const ok =
    got &&
    got.name === expected.name &&
    (got.qty ?? null) === (expected.qty ?? null) &&
    (got.unit ?? '') === (expected.unit ?? '') &&
    (got.note ?? '') === (expected.note ?? '')
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(input)} → ${JSON.stringify(got)}`)
  if (!ok) failed++
}

check('Помидоры', { name: 'Помидоры' })
check('  — Руккола  ', { name: 'Руккола' })
check('Моцарелла — 200 г', { name: 'Моцарелла', qty: 200, unit: 'г' })
check('Мука 200 гр', { name: 'Мука', qty: 200, unit: 'г' })
check('Яйца 3 шт', { name: 'Яйца', qty: 3, unit: 'шт' })
check('Молоко 1,5 л', { name: 'Молоко', qty: 1.5, unit: 'л' })
check('200 г творога', { name: 'творога', qty: 200, unit: 'г' })
check('2 упаковки макарон', { name: 'макарон', qty: 2, unit: 'упак.' })
check('Соль (по вкусу)', { name: 'Соль', note: 'по вкусу' })
check('Оливковое масло — 2 ст.л.', { name: 'Оливковое масло', qty: 2, unit: 'ст.л.' })
check('Чеснок 3 зубчика', { name: 'Чеснок', qty: 3, unit: 'зуб.' })
check('1. Помидоры черри', { name: 'Помидоры черри' })
check('Сыр 2', { name: 'Сыр', qty: 2, unit: '' })
// Числа в самом названии не должны съедаться как количество
check('Молоко 3.2%', { name: 'Молоко 3.2%' })
// Диапазон — берём нижнюю границу
check('Яйца 2-3 шт', { name: 'Яйца', qty: 2, unit: 'шт' })
check('2-3 зубчика чеснока', { name: 'чеснока', qty: 2, unit: 'зуб.' })
// Пометка через запятую
check('Соль, по вкусу', { name: 'Соль', note: 'по вкусу' })
check('Зелень, для подачи', { name: 'Зелень', note: 'для подачи' })

process.exit(failed === 0 ? 0 : 1)
