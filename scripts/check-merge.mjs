// Разовая проверка логики слияния: запускается через esbuild-сборку src/lib/db.ts.
// Не входит в приложение, нужна чтобы убедиться в поведении корзины и настроек.
import {
  mergeDatabases,
  pruneTombstones,
  normalizeDatabase,
  serialize,
  dedupeQuickEntries,
  materializeIngredientProducts,
  dedupeProducts,
} from '../.check/db.mjs'
import { removeSeedArtifacts } from '../.check/seed.mjs'

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

// 3б. Перепривязка («Это не я») побеждает старую привязку с удалённой стороны.
{
  const remote = base()
  remote.settings.userEmails = { sasha: 'x@x.ru' }
  remote.settings.userEmailsAt = { sasha: '2026-08-16T10:00:00.000Z' }
  remote.settingsUpdatedAt = '2026-08-16T10:00:00.000Z'

  // Локально Андрей забрал почту себе: у Саши снята (пустая строка), у него — свежая.
  const local = base()
  local.settings.userEmails = { sasha: '', andrei: 'x@x.ru' }
  local.settings.userEmailsAt = { sasha: '2026-08-16T12:00:00.000Z', andrei: '2026-08-16T12:00:00.000Z' }
  local.settingsUpdatedAt = '2026-08-16T12:00:00.000Z'

  const m1 = mergeDatabases(local, remote)
  const m2 = mergeDatabases(remote, local)
  check(
    'перепривязка не откатывается remote-стороной',
    m1.settings.userEmails.andrei === 'x@x.ru' && m1.settings.userEmails.sasha === '',
  )
  check(
    'перепривязка не зависит от порядка сторон',
    m2.settings.userEmails.andrei === 'x@x.ru' && m2.settings.userEmails.sasha === '',
  )
}

// 3в. Санитайзер: битый импорт не роняет базу, а старым привязкам даётся давность настроек.
{
  const db = normalizeDatabase({
    recipes: { r1: { name: 'Тест' }, r2: { ingredients: 'мусор' } },
    entries: {
      e1: { meal: 'dinner' },
      e2: { date: '2026-08-10', status: 'weird' },
      e5: { date: '2026-08-10', meal: 'dinner', leftovers: true },
      e6: { date: '2026-08-10', meal: 'dinner', leftovers: 'мусор' },
    },
    settings: { userEmails: { sasha: 's@x.ru' } },
    settingsUpdatedAt: '2026-08-01T00:00:00.000Z',
  })
  check('рецепту без ingredients дали пустой список', Array.isArray(db.recipes.r1?.ingredients))
  check('рецепту без tags дали пустой список', Array.isArray(db.recipes.r1?.tags))
  check('запись без даты отброшена', db.entries.e1 === undefined)
  check('кривой статус приведён к done', db.entries.e2?.status === 'done')
  check('флажок «доедаем» пережил санитайзер', db.entries.e5?.leftovers === true)
  check('мусор вместо флажка отброшен', db.entries.e6?.leftovers === undefined)
  check('рецепт без имени отброшен', db.recipes.r2 === undefined)
  check('старой привязке проставлена давность', db.settings.userEmailsAt.sasha === '2026-08-01T00:00:00.000Z')
}

// 3г. Стабильная сериализация: одинаковое содержимое — одинаковая строка.
{
  const a = normalizeDatabase({
    recipes: { r1: { name: 'Борщ', category: 'Суп' } },
    settings: { theme: 'dark', currency: '₽' },
  })
  const shuffled = JSON.parse(JSON.stringify(a))
  // Пересобираем объект с другим порядком ключей.
  const reordered = { settings: shuffled.settings, recipes: shuffled.recipes, ...shuffled }
  check('порядок ключей не влияет на сериализацию', serialize(a) === serialize(reordered))
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

// 7. Дубли одновременного «Готовим сегодня» с двух телефонов схлопываются.
{
  const db = normalizeDatabase({
    entries: {
      e1: { date: '2026-08-17', meal: 'dinner', status: 'planned', recipeId: 'r1', createdAt: '2026-08-17T10:00:00.000Z', updatedAt: '2026-08-17T10:00:00.000Z' },
      e2: { date: '2026-08-17', meal: 'dinner', status: 'done', recipeId: 'r1', createdAt: '2026-08-17T10:00:01.000Z', updatedAt: '2026-08-17T10:00:01.000Z' },
      // Запись с заметкой — не «голая», трогать нельзя.
      e3: { date: '2026-08-17', meal: 'dinner', status: 'done', recipeId: 'r2', note: 'вкусно', createdAt: '2026-08-17T10:00:00.000Z', updatedAt: '2026-08-17T10:00:00.000Z' },
      e4: { date: '2026-08-17', meal: 'dinner', status: 'planned', recipeId: 'r2', createdAt: '2026-08-17T10:00:02.000Z', updatedAt: '2026-08-17T10:00:02.000Z' },
    },
  })
  const deduped = dedupeQuickEntries(db, '2026-08-17T11:00:00.000Z')
  const aliveOnes = Object.values(deduped.entries).filter((e) => !e.deletedAt)
  const r1 = aliveOnes.filter((e) => e.recipeId === 'r1')
  check('дубль схлопнут, остался один', r1.length === 1)
  check('выжила запись со статусом «готово»', r1[0]?.status === 'done')
  check('записи с содержимым не тронуты', aliveOnes.filter((e) => e.recipeId === 'r2').length === 2)
}

// 8. Продукты досоздаются из ингредиентов, не дублируя каталог и не воскрешая удалённое.
{
  const at = '2026-08-17T12:00:00.000Z'
  const db = normalizeDatabase({
    recipes: {
      r1: {
        name: 'Каша',
        ingredients: [
          { name: 'Овсяные хлопья', qty: 100, unit: 'г' },
          { name: 'Молоко', qty: 500, unit: 'мл' },
          { name: 'Соль', qty: null, unit: '' },
        ],
        createdAt: at,
        updatedAt: at,
      },
    },
    products: {
      p1: { name: 'Молоко', group: 'Молочное и яйца', unit: 'мл', price: 0.1, createdAt: at, updatedAt: at },
      p2: { name: 'Соль', group: 'Бакалея', unit: 'г', price: null, deletedAt: at, createdAt: at, updatedAt: at },
    },
  })
  const filled = materializeIngredientProducts(db, at)
  const names = Object.values(filled.products).filter((p) => !p.deletedAt).map((p) => p.name)
  check('недостающий продукт досоздан из рецепта', names.includes('Овсяные хлопья'))
  check('существующий продукт не задублирован', names.filter((n) => n === 'Молоко').length === 1)
  check('удалённый продукт не воскрешён', !names.includes('Соль'))
  check('повторный вызов ничего не меняет', materializeIngredientProducts(filled, at) === filled)
}

// 9. Дубли продуктов с двух устройств схлопываются, полезные поля выживают.
{
  const at = '2026-08-17T12:00:00.000Z'
  const db = normalizeDatabase({
    products: {
      pa: { name: 'Соль', group: 'Прочее', unit: 'г', price: null, inStock: true, createdAt: at, updatedAt: at },
      pb: { name: 'соль', group: 'Бакалея', unit: 'г', price: 0.03, createdAt: at, updatedAt: at },
      pc: { name: 'Перец', group: 'Прочее', unit: 'г', price: null, createdAt: at, updatedAt: at },
    },
  })
  const deduped = dedupeProducts(db, '2026-08-17T13:00:00.000Z')
  const aliveOnes = Object.values(deduped.products).filter((p) => !p.deletedAt)
  const salt = aliveOnes.filter((p) => p.name.toLowerCase() === 'соль')
  check('дубль продукта схлопнут', salt.length === 1)
  check('выжил продукт с ценой', salt[0]?.price === 0.03)
  check('«есть дома» перенесено с дубля', salt[0]?.inStock === true)
  check('продукт без дублей не тронут', aliveOnes.some((p) => p.name === 'Перец'))
}

// 10. Очистка корзины не воскрешает удаление, сделанное офлайн ДО неё.
{
  const cleaned = base()
  cleaned.settings.purgedAt = '2026-08-16T11:00:00.000Z'
  cleaned.settingsUpdatedAt = '2026-08-16T11:00:00.000Z'
  cleaned.recipes.r9 = stamp('r9', '2026-08-10T09:00:00.000Z', { name: 'Плов' })

  // Второй телефон удалил то же блюдо офлайн раньше очистки — очищавший этого не видел.
  const offline = base()
  offline.recipes.r9 = stamp('r9', '2026-08-16T10:00:00.000Z', {
    name: 'Плов',
    deletedAt: '2026-08-16T10:00:00.000Z',
  })

  const m1 = pruneTombstones(mergeDatabases(cleaned, offline))
  const m2 = pruneTombstones(mergeDatabases(offline, cleaned))
  check('офлайн-удаление переживает чужую очистку', m1.recipes.r9?.deletedAt !== undefined)
  check('и не зависит от порядка сторон', m2.recipes.r9?.deletedAt !== undefined)
}

// 11. Ничья по updatedAt разрешается одинаково с обеих сторон — иначе вечная перезаливка.
{
  const a = base()
  a.recipes.r10 = stamp('r10', '2026-08-16T10:00:00.000Z', { name: 'Первый' })
  const b = base()
  b.recipes.r10 = stamp('r10', '2026-08-16T10:00:00.000Z', { name: 'Второй' })
  check(
    'ничья по времени разрешается детерминированно',
    mergeDatabases(a, b).recipes.r10.name === mergeDatabases(b, a).recipes.r10.name,
  )
  const s1 = base()
  s1.settings.sharedWith = ['b@x.ru', 'a@x.ru']
  const s2 = base()
  s2.settings.sharedWith = ['a@x.ru', 'b@x.ru']
  check(
    'список доступа сходится по порядку',
    serialize(mergeDatabases(s1, s2)) === serialize(mergeDatabases(s2, s1)),
  )
}

// 12. Флажок «доедаем» переезжает на выжившего, «кто готовил» не считается голым.
{
  const at = '2026-08-17T12:00:00.000Z'
  const db = normalizeDatabase({
    entries: {
      e1: { date: '2026-08-17', meal: 'dinner', status: 'planned', recipeId: 'r1', createdAt: at, updatedAt: at },
      e2: { date: '2026-08-17', meal: 'dinner', status: 'planned', recipeId: 'r1', leftovers: true, createdAt: at, updatedAt: at },
      e3: { date: '2026-08-17', meal: 'lunch', status: 'done', recipeId: 'r2', cook: 'sasha', createdAt: at, updatedAt: at },
      e4: { date: '2026-08-17', meal: 'lunch', status: 'done', recipeId: 'r2', createdAt: at, updatedAt: at },
    },
  })
  const deduped = dedupeQuickEntries(db, '2026-08-17T13:00:00.000Z')
  const aliveOnes = Object.values(deduped.entries).filter((e) => !e.deletedAt)
  const r1 = aliveOnes.filter((e) => e.recipeId === 'r1')
  check('дубль схлопнут, «доедаем» сохранился', r1.length === 1 && r1[0]?.leftovers === true)
  check('запись с «кто готовил» не схлопнута', aliveOnes.filter((e) => e.recipeId === 'r2').length === 2)
}

// 13. Вычистка сида бьёт по отпечатку, а не по имени: настоящая запись задним числом цела.
{
  const seedTime = '2026-05-01T10:00:00.000Z'
  const db = normalizeDatabase({
    recipes: {
      r1: { name: 'Борщ', category: 'Суп', ratings: { sasha: 5, andrei: 4 }, favorite: true, createdAt: seedTime, updatedAt: seedTime },
    },
    entries: {
      // Выдуманная сидом: создана тем же мгновением, что и рецепт.
      fake: { date: '2026-04-01', meal: 'lunch', status: 'done', recipeId: 'r1', createdAt: seedTime, updatedAt: seedTime },
      // Настоящая: «в прошлую среду был борщ», записана пользователем позже.
      real: { date: '2026-08-10', meal: 'lunch', status: 'done', recipeId: 'r1', createdAt: '2026-08-17T09:00:00.000Z', updatedAt: '2026-08-17T09:00:00.000Z' },
    },
  })
  const cleaned = removeSeedArtifacts(db)
  check('выдуманная запись получила надгробие', cleaned.entries.fake?.deletedAt !== undefined)
  check('надгробие датировано временем сида', (cleaned.entries.fake?.deletedAt ?? '') < '2026-05-01T10:00:01.000Z')
  check('настоящая запись задним числом цела', cleaned.entries.real?.deletedAt === undefined)
  check('оценки сида сняты', Object.keys(cleaned.recipes.r1?.ratings ?? {}).length === 0)
  check('повторный прогон ничего не меняет', removeSeedArtifacts(cleaned) === cleaned)
}

// 14. Настоящие оценки пользователя вычистка не трогает, даже у пример-рецепта.
{
  const time = '2026-05-01T10:00:00.000Z'
  const db = normalizeDatabase({
    recipes: {
      r1: { name: 'Борщ', category: 'Суп', ratings: { sasha: 3 }, createdAt: time, updatedAt: time },
    },
  })
  const cleaned = removeSeedArtifacts(db)
  check('чужая оценка не снята', cleaned.recipes.r1?.ratings?.sasha === 3)
}

// 15. Строки с диапазоном и запятой-пометкой (через полный normalizeDatabase не проверить —
// это parseIngredientLine, он гоняется в check-ingredients).

process.exit(failed === 0 ? 0 : 1)
