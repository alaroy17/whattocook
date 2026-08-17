import type { Database, Product, Recipe, RecipeIngredient } from '../types'
import { addDays, today } from './date'
import { normalizeName, nowIso, uid } from './util'

type SeedRecipe = {
  name: string
  category: string
  tags: string[]
  timeMin: number
  servings: number
  difficulty: 1 | 2 | 3
  chef: 'sasha' | 'andrei' | 'any'
  ingredients: [string, number | null, string][]
  steps: string
  /** Сколько дней назад готовили в последний раз (для демонстрации подсказок). */
  cookedDaysAgo: number[]
  /** Постоянное блюдо и его привычный ритм в днях. */
  regularEveryDays?: number
}

const RECIPES: SeedRecipe[] = [
  {
    name: 'Говядина по-бургундски',
    category: 'Основное',
    tags: ['мясо', 'на выходные'],
    timeMin: 150,
    servings: 4,
    difficulty: 3,
    chef: 'andrei',
    ingredients: [
      ['Говядина', 800, 'г'],
      ['Морковь', 2, 'шт'],
      ['Лук репчатый', 2, 'шт'],
      ['Красное сухое вино', 400, 'мл'],
      ['Томатная паста', 1, 'ст.л.'],
      ['Чеснок', 3, 'зуб.'],
    ],
    steps: 'Обжарить мясо крупными кусками до корочки.\nДобавить овощи, влить вино, тушить под крышкой 2 часа.\nВ конце выпарить соус до густоты.',
    cookedDaysAgo: [96],
  },
  {
    name: 'Борщ',
    category: 'Суп',
    tags: ['на неделю'],
    timeMin: 120,
    servings: 6,
    difficulty: 2,
    chef: 'sasha',
    ingredients: [
      ['Говядина', 500, 'г'],
      ['Свёкла', 2, 'шт'],
      ['Капуста белокочанная', 300, 'г'],
      ['Картофель', 4, 'шт'],
      ['Морковь', 1, 'шт'],
      ['Лук репчатый', 1, 'шт'],
      ['Томатная паста', 2, 'ст.л.'],
    ],
    steps: 'Сварить бульон.\nСвёклу и морковь потушить с томатной пастой.\nДобавить в бульон картофель и капусту, затем зажарку. Дать настояться час.',
    cookedDaysAgo: [34, 71],
  },
  {
    name: 'Паста карбонара',
    category: 'Основное',
    tags: ['быстро', 'паста'],
    timeMin: 25,
    servings: 2,
    difficulty: 1,
    chef: 'andrei',
    ingredients: [
      ['Спагетти', 200, 'г'],
      ['Бекон', 150, 'г'],
      ['Яйца', 3, 'шт'],
      ['Пармезан', 60, 'г'],
      ['Чёрный перец', null, 'щеп.'],
    ],
    steps: 'Обжарить бекон.\nЖелтки смешать с тёртым пармезаном.\nГорячую пасту снять с огня, вмешать яичную смесь и бекон.',
    cookedDaysAgo: [9, 26, 44],
  },
  {
    name: 'Куриный суп с лапшой',
    category: 'Суп',
    tags: ['быстро'],
    timeMin: 45,
    servings: 4,
    difficulty: 1,
    chef: 'sasha',
    ingredients: [
      ['Курица', 500, 'г'],
      ['Лапша', 100, 'г'],
      ['Морковь', 1, 'шт'],
      ['Лук репчатый', 1, 'шт'],
      ['Картофель', 2, 'шт'],
    ],
    steps: 'Сварить бульон на курице, добавить овощи и лапшу.',
    cookedDaysAgo: [17],
  },
  {
    name: 'Овощное рагу',
    category: 'Основное',
    tags: ['постное', 'овощи'],
    timeMin: 50,
    servings: 4,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Кабачок', 1, 'шт'],
      ['Баклажан', 1, 'шт'],
      ['Перец болгарский', 2, 'шт'],
      ['Помидоры', 3, 'шт'],
      ['Лук репчатый', 1, 'шт'],
    ],
    steps: 'Овощи нарезать крупно, обжарить по очереди, соединить и тушить 25 минут.',
    cookedDaysAgo: [58],
  },
  {
    name: 'Сырники',
    category: 'Завтрак',
    tags: ['выходные'],
    timeMin: 30,
    servings: 2,
    difficulty: 1,
    chef: 'sasha',
    ingredients: [
      ['Творог', 400, 'г'],
      ['Яйца', 1, 'шт'],
      ['Мука', 3, 'ст.л.'],
      ['Сахар', 2, 'ст.л.'],
    ],
    steps: 'Смешать творог с яйцом, сахаром и мукой. Сформировать сырники и обжарить на среднем огне.',
    cookedDaysAgo: [12, 33],
  },
  {
    name: 'Овсяная каша',
    category: 'Завтрак',
    tags: ['быстро'],
    timeMin: 15,
    servings: 2,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Овсяные хлопья', 100, 'г'],
      ['Молоко', 500, 'мл'],
      ['Масло сливочное', 20, 'г'],
      ['Сахар', 1, 'ст.л.'],
    ],
    steps: 'Хлопья залить молоком, довести до кипения и варить 7 минут, помешивая.\nСнять с огня, добавить масло и дать постоять пару минут под крышкой.',
    cookedDaysAgo: [7],
  },
  {
    name: 'Яичница',
    category: 'Завтрак',
    tags: ['быстро'],
    timeMin: 10,
    servings: 2,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Яйца', 4, 'шт'],
      ['Масло сливочное', 10, 'г'],
      ['Соль', null, ''],
    ],
    steps: 'Разогреть сковороду со сливочным маслом.\nРазбить яйца и жарить на среднем огне, пока не схватится белок. Посолить.',
    cookedDaysAgo: [9, 23],
  },
  {
    name: 'Запечённый лосось с овощами',
    category: 'Основное',
    tags: ['рыба', 'полезное'],
    timeMin: 40,
    servings: 2,
    difficulty: 1,
    chef: 'andrei',
    ingredients: [
      ['Лосось', 400, 'г'],
      ['Брокколи', 300, 'г'],
      ['Лимон', 1, 'шт'],
      ['Оливковое масло', 2, 'ст.л.'],
    ],
    steps: 'Рыбу и овощи сбрызнуть маслом и лимоном, запекать 20 минут при 200°.',
    cookedDaysAgo: [63],
  },
  {
    name: 'Плов',
    category: 'Основное',
    tags: ['мясо', 'на неделю'],
    timeMin: 90,
    servings: 6,
    difficulty: 2,
    chef: 'andrei',
    ingredients: [
      ['Баранина', 700, 'г'],
      ['Рис', 500, 'г'],
      ['Морковь', 4, 'шт'],
      ['Лук репчатый', 2, 'шт'],
      ['Зира', 1, 'ч.л.'],
    ],
    steps: 'Обжарить мясо с луком и морковью, залить водой, выложить рис, готовить под крышкой до готовности.',
    cookedDaysAgo: [120],
  },
  {
    name: 'Салат с тунцом',
    category: 'Салат',
    tags: ['быстро'],
    timeMin: 15,
    servings: 2,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Тунец консервированный', 1, 'шт'],
      ['Салат листовой', 100, 'г'],
      ['Помидоры', 2, 'шт'],
      ['Оливки', 50, 'г'],
    ],
    steps: 'Всё нарезать, смешать, заправить оливковым маслом.',
    cookedDaysAgo: [21],
  },
  {
    name: 'Салат с рукколой, помидорами и моцареллой',
    category: 'Салат',
    tags: ['быстро', 'каждую неделю'],
    timeMin: 10,
    servings: 2,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Руккола', 100, 'г'],
      ['Помидоры черри', 250, 'г'],
      ['Моцарелла', 200, 'г'],
      ['Оливковое масло', 2, 'ст.л.'],
      ['Бальзамический уксус', 1, 'ст.л.'],
    ],
    steps: 'Помидоры разрезать пополам, моцареллу порвать руками, смешать с рукколой и заправить.',
    cookedDaysAgo: [4, 11, 18, 25],
    regularEveryDays: 6,
  },
  {
    name: 'Шарлотка',
    category: 'Выпечка',
    tags: ['десерт'],
    timeMin: 60,
    servings: 6,
    difficulty: 1,
    chef: 'sasha',
    ingredients: [
      ['Яблоки', 4, 'шт'],
      ['Яйца', 4, 'шт'],
      ['Мука', 200, 'г'],
      ['Сахар', 180, 'г'],
    ],
    steps: 'Взбить яйца с сахаром, вмешать муку, выложить на яблоки, печь 40 минут при 180°.',
    cookedDaysAgo: [77],
  },
  {
    name: 'Курица терияки',
    category: 'Основное',
    tags: ['быстро', 'азия'],
    timeMin: 30,
    servings: 3,
    difficulty: 1,
    chef: 'andrei',
    ingredients: [
      ['Куриное филе', 600, 'г'],
      ['Соевый соус', 60, 'мл'],
      ['Мёд', 2, 'ст.л.'],
      ['Чеснок', 2, 'зуб.'],
      ['Рис', 200, 'г'],
    ],
    steps: 'Обжарить филе, влить соус из соевого соуса, мёда и чеснока, выпарить до глазури. Подавать с рисом.',
    cookedDaysAgo: [5, 29],
  },
  {
    name: 'Курица с картошкой в духовке',
    category: 'Основное',
    tags: ['мясо', 'на выходные'],
    timeMin: 75,
    servings: 4,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Курица', 1000, 'г'],
      ['Картофель', 6, 'шт'],
      ['Лук репчатый', 1, 'шт'],
      ['Оливковое масло', 2, 'ст.л.'],
      ['Соль', null, ''],
    ],
    steps: 'Курицу натереть солью и специями, картофель нарезать дольками, перемешать с маслом и луком.\nЗапекать при 200° около часа до румяной корочки.',
    cookedDaysAgo: [42],
  },
  {
    name: 'Хумус',
    category: 'Закуска',
    tags: ['постное'],
    timeMin: 20,
    servings: 4,
    difficulty: 1,
    chef: 'sasha',
    ingredients: [
      ['Нут', 400, 'г'],
      ['Тахини', 3, 'ст.л.'],
      ['Лимон', 1, 'шт'],
      ['Чеснок', 2, 'зуб.'],
    ],
    steps: 'Пробить нут блендером с тахини, лимонным соком и чесноком до гладкости.',
    cookedDaysAgo: [88],
  },
  {
    name: 'Омлет с помидорами',
    category: 'Завтрак',
    tags: ['быстро'],
    timeMin: 12,
    servings: 2,
    difficulty: 1,
    chef: 'any',
    ingredients: [
      ['Яйца', 4, 'шт'],
      ['Помидоры', 2, 'шт'],
      ['Молоко', 60, 'мл'],
    ],
    steps: 'Взбить яйца с молоком, вылить на сковороду с помидорами, готовить под крышкой 6 минут.',
    cookedDaysAgo: [3, 11, 19],
    regularEveryDays: 5,
  },
  {
    name: 'Ризотто с грибами',
    category: 'Основное',
    tags: ['вегетарианское'],
    timeMin: 45,
    servings: 3,
    difficulty: 2,
    chef: 'andrei',
    ingredients: [
      ['Рис арборио', 300, 'г'],
      ['Шампиньоны', 400, 'г'],
      ['Лук репчатый', 1, 'шт'],
      ['Белое сухое вино', 100, 'мл'],
      ['Пармезан', 50, 'г'],
    ],
    steps: 'Обжарить лук и грибы, всыпать рис, влить вино, затем частями бульон. В конце вмешать пармезан.',
    cookedDaysAgo: [49],
  },
]

const PRODUCTS: [string, string, string, number, number][] = [
  // название, отдел, единица, кол-во в упаковке, цена упаковки
  ['Говядина', 'Мясо и птица', 'г', 1000, 780],
  ['Курица', 'Мясо и птица', 'г', 1000, 260],
  ['Куриное филе', 'Мясо и птица', 'г', 1000, 420],
  ['Баранина', 'Мясо и птица', 'г', 1000, 890],
  ['Бекон', 'Мясо и птица', 'г', 200, 220],
  ['Лосось', 'Рыба', 'г', 1000, 1450],
  ['Яйца', 'Молочное и яйца', 'шт', 10, 120],
  ['Молоко', 'Молочное и яйца', 'мл', 1000, 95],
  ['Творог', 'Молочное и яйца', 'г', 500, 180],
  ['Пармезан', 'Молочное и яйца', 'г', 200, 460],
  ['Картофель', 'Овощи и зелень', 'шт', 10, 90],
  ['Морковь', 'Овощи и зелень', 'шт', 10, 70],
  ['Лук репчатый', 'Овощи и зелень', 'шт', 10, 60],
  ['Свёкла', 'Овощи и зелень', 'шт', 5, 60],
  ['Капуста белокочанная', 'Овощи и зелень', 'г', 1000, 45],
  ['Помидоры', 'Овощи и зелень', 'шт', 6, 190],
  ['Кабачок', 'Овощи и зелень', 'шт', 1, 70],
  ['Баклажан', 'Овощи и зелень', 'шт', 1, 90],
  ['Перец болгарский', 'Овощи и зелень', 'шт', 3, 150],
  ['Брокколи', 'Заморозка', 'г', 400, 160],
  ['Шампиньоны', 'Овощи и зелень', 'г', 400, 170],
  ['Чеснок', 'Овощи и зелень', 'зуб.', 20, 60],
  ['Яблоки', 'Фрукты', 'шт', 6, 150],
  ['Лимон', 'Фрукты', 'шт', 3, 90],
  ['Рис', 'Бакалея', 'г', 900, 130],
  ['Рис арборио', 'Бакалея', 'г', 500, 240],
  ['Спагетти', 'Бакалея', 'г', 500, 110],
  ['Лапша', 'Бакалея', 'г', 400, 90],
  ['Мука', 'Бакалея', 'г', 2000, 130],
  ['Сахар', 'Бакалея', 'г', 1000, 75],
  ['Овсяные хлопья', 'Бакалея', 'г', 400, 120],
  ['Масло сливочное', 'Молочное и яйца', 'г', 180, 250],
  ['Соль', 'Бакалея', 'г', 1000, 25],
  ['Нут', 'Бакалея', 'г', 500, 130],
  ['Оливки', 'Бакалея', 'г', 300, 180],
  ['Тунец консервированный', 'Бакалея', 'шт', 1, 140],
  ['Соевый соус', 'Специи и соусы', 'мл', 500, 190],
  ['Томатная паста', 'Специи и соусы', 'ст.л.', 20, 90],
  ['Оливковое масло', 'Специи и соусы', 'ст.л.', 60, 650],
  ['Мёд', 'Специи и соусы', 'ст.л.', 30, 400],
  ['Тахини', 'Специи и соусы', 'ст.л.', 25, 450],
  ['Красное сухое вино', 'Напитки', 'мл', 750, 690],
  ['Белое сухое вино', 'Напитки', 'мл', 750, 690],
  ['Руккола', 'Овощи и зелень', 'г', 125, 160],
  ['Помидоры черри', 'Овощи и зелень', 'г', 250, 220],
  ['Моцарелла', 'Молочное и яйца', 'г', 125, 190],
  ['Бальзамический уксус', 'Специи и соусы', 'ст.л.', 16, 320],
  ['Салат листовой', 'Овощи и зелень', 'г', 150, 130],
]

const IN_STOCK = new Set([
  'Яйца',
  'Молоко',
  'Масло сливочное',
  'Соль',
  'Овсяные хлопья',
  'Картофель',
  'Морковь',
  'Лук репчатый',
  'Чеснок',
  'Рис',
  'Мука',
  'Сахар',
  'Спагетти',
  'Оливковое масло',
  'Помидоры',
])

/**
 * Заполняет базу примерами. Повторный вызов ничего не дублирует:
 * то, что уже есть с таким названием, пропускается.
 */
export function buildSeedDatabase(base: Database): Database {
  const time = nowIso()
  const next: Database = {
    ...base,
    recipes: { ...base.recipes },
    entries: { ...base.entries },
    products: { ...base.products },
    comments: { ...base.comments },
    settings: { ...base.settings, categories: [...base.settings.categories] },
  }

  const existingProducts = new Set(
    Object.values(next.products)
      .filter((product) => !product.deletedAt)
      .map((product) => normalizeName(product.name)),
  )
  const existingRecipes = new Set(
    Object.values(next.recipes)
      .filter((recipe) => !recipe.deletedAt)
      .map((recipe) => normalizeName(recipe.name)),
  )

  for (const [name, group, unit, packQty, packPrice] of PRODUCTS) {
    if (existingProducts.has(normalizeName(name))) continue
    const id = uid('p')
    const product: Product = {
      id,
      name,
      group,
      unit,
      packQty,
      packPrice,
      price: packPrice / packQty,
      inStock: IN_STOCK.has(name),
      createdAt: time,
      updatedAt: time,
    }
    next.products[id] = product
  }

  for (const item of RECIPES) {
    if (existingRecipes.has(normalizeName(item.name))) continue
    const id = uid('r')
    const ingredients: RecipeIngredient[] = item.ingredients.map(([name, qty, unit]) => ({ name, qty, unit }))
    const recipe: Recipe = {
      id,
      name: item.name,
      category: item.category,
      tags: item.tags,
      ingredients,
      steps: item.steps,
      timeMin: item.timeMin,
      servings: item.servings,
      difficulty: item.difficulty,
      chef: item.chef,
      favorite: item.cookedDaysAgo.length > 2,
      ratings: { sasha: 4 + (item.cookedDaysAgo.length > 1 ? 1 : 0), andrei: 4 },
      regular: item.regularEveryDays != null,
      regularEveryDays: item.regularEveryDays ?? null,
      createdAt: time,
      updatedAt: time,
    }
    next.recipes[id] = recipe

    // Разделы примеров включаем, иначе их не будет видно в фильтрах.
    if (!next.settings.categories.includes(item.category)) {
      next.settings = { ...next.settings, categories: [...next.settings.categories, item.category] }
      next.settingsUpdatedAt = time
    }

    for (const daysAgo of item.cookedDaysAgo) {
      const entryId = uid('e')
      next.entries[entryId] = {
        id: entryId,
        date: addDays(today(), -daysAgo),
        meal: item.category === 'Завтрак' ? 'breakfast' : item.category === 'Суп' ? 'lunch' : 'dinner',
        status: 'done',
        recipeId: id,
        cook: item.chef === 'any' ? 'both' : item.chef,
        createdAt: time,
        updatedAt: time,
        cost: null,
      }
    }
  }

  return next
}
