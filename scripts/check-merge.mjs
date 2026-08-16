// Разовая проверка логики слияния: запускается через esbuild-сборку src/lib/db.ts.
// Не входит в приложение, нужна чтобы убедиться в поведении корзины и настроек.
import { mergeDatabases, pruneTombstones, normalizeDatabase } from '../.check/db.mjs'

let failed = 0
const check = (name, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`)
  if (!condition) failed++
}

const base = () => normalizeDatabase({})
const stamp = (id, updatedAt, extra = {}) => ({ id, createdAt: updatedAt, updatedAt, ...extra })

// 1. Очищенная корзина не возвращается при слиянии с устройством, где запись ещё есть.
{
  const cleaned = base()
  cleaned.settings.purgedAt = '2026-08-16T10:00:00.000Z'
  cleaned.settingsUpdatedAt = '2026-08-16T10:00:00.000Z'

  const other = base()
  other.recipes.r1 = stamp('r1', '2026-08-15T09:00:00.000Z', { deletedAt: '2026-08-15T09:00:00.000Z' })

  const merged = pruneTombstones(mergeDatabases(cleaned, other))
  check('очищенное надгробие не воскресает', merged.recipes.r1 === undefined)
}

// 2. Удаление, сделанное ПОСЛЕ очистки, доживает до второго устройства.
{
  const cleaned = base()
  cleaned.settings.purgedAt = '2026-08-16T10:00:00.000Z'
  cleaned.settingsUpdatedAt = '2026-08-16T10:00:00.000Z'

  const other = base()
  other.recipes.r2 = stamp('r2', '2026-08-16T12:00:00.000Z', { deletedAt: '2026-08-16T12:00:00.000Z' })

  const merged = pruneTombstones(mergeDatabases(cleaned, other))
  check('свежее удаление сохраняется', merged.recipes.r2?.deletedAt !== undefined)
}

// 3. Привязка почт не теряется, когда второй правил другие настройки позже.
{
  const a = base()
  a.settings.userEmails = { andrei: 'a@x.ru' }
  a.settingsUpdatedAt = '2026-08-16T10:00:00.000Z'

  const b = base()
  b.settings.userEmails = { sasha: 's@x.ru' }
  b.settings.theme = 'dark'
  b.settingsUpdatedAt = '2026-08-16T11:00:00.000Z'

  const merged = mergeDatabases(a, b)
  check('обе почты выжили', merged.settings.userEmails.andrei === 'a@x.ru' && merged.settings.userEmails.sasha === 's@x.ru')
  check('тема взята у свежей версии', merged.settings.theme === 'dark')
}

// 4. Выданный доступ объединяется, а не перетирается.
{
  const a = base()
  a.settings.sharedWith = ['s@x.ru']
  a.settingsUpdatedAt = '2026-08-16T12:00:00.000Z'
  const b = base()
  b.settings.sharedWith = ['third@x.ru']
  b.settingsUpdatedAt = '2026-08-16T09:00:00.000Z'

  const merged = mergeDatabases(a, b)
  check('список доступа объединён', merged.settings.sharedWith.length === 2)
}

// 5. Обычное слияние по свежести не сломано.
{
  const a = base()
  a.recipes.r3 = stamp('r3', '2026-08-16T10:00:00.000Z', { name: 'старое' })
  const b = base()
  b.recipes.r3 = stamp('r3', '2026-08-16T11:00:00.000Z', { name: 'новое' })
  check('побеждает свежая запись', mergeDatabases(a, b).recipes.r3.name === 'новое')
  check('порядок аргументов не важен', mergeDatabases(b, a).recipes.r3.name === 'новое')
}

// 6. База из старой версии открывается без потерь — данные пользователя важнее всего.
{
  const old = {
    schemaVersion: 1,
    recipes: {
      r1: {
        id: 'r1',
        name: 'Салат с рукколой',
        category: 'Закуска',
        tags: ['быстро'],
        ingredients: [{ name: 'Руккола', qty: 100, unit: 'г' }],
        steps: 'Смешать',
        timeMin: 10,
        servings: 2,
        difficulty: 1,
        chef: 'any',
        favorite: true,
        ratings: { sasha: 5 },
        createdAt: '2026-08-10T10:00:00.000Z',
        updatedAt: '2026-08-10T10:00:00.000Z',
      },
    },
    entries: {
      e1: {
        id: 'e1',
        date: '2026-08-12',
        meal: 'dinner',
        status: 'done',
        recipeId: 'r1',
        createdAt: '2026-08-12T10:00:00.000Z',
        updatedAt: '2026-08-12T10:00:00.000Z',
      },
    },
    products: {},
    comments: {},
    // Настроек новых версий здесь нет — именно так выглядит база до обновления.
    settings: { cooldownDays: 10, preferInStock: true, theme: 'system', currency: '₽' },
    settingsUpdatedAt: '2026-08-10T10:00:00.000Z',
  }

  const db = normalizeDatabase(old)
  check('рецепт пережил обновление', db.recipes.r1?.name === 'Салат с рукколой')
  check('оценки и избранное на месте', db.recipes.r1?.ratings?.sasha === 5 && db.recipes.r1?.favorite === true)
  check('ингредиенты на месте', db.recipes.r1?.ingredients?.[0]?.qty === 100)
  check('история на месте', db.entries.e1?.recipeId === 'r1')
  check('старые настройки сохранены', db.settings.cooldownDays === 10 && db.settings.currency === '₽')
  check('новые настройки получили значения', db.settings.purgedAt === null && Array.isArray(db.settings.sharedWith))
  check('раздел «Закуска» не пропал из фильтров', db.settings.categories.includes('Закуска'))

  // И самое опасное: чистка надгробий не должна ничего удалить у старой базы.
  const pruned = pruneTombstones(db)
  check('очистка ничего не выкинула', Object.keys(pruned.recipes).length === 1 && Object.keys(pruned.entries).length === 1)

  // Слияние старой базы с пустой локальной тоже ничего не теряет.
  const merged = mergeDatabases(normalizeDatabase({}), db)
  check('слияние с пустой базой сохраняет рецепт', merged.recipes.r1?.name === 'Салат с рукколой')
}

process.exit(failed === 0 ? 0 : 1)
