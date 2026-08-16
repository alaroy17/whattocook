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

process.exit(failed === 0 ? 0 : 1)
