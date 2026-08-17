import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import type { Chef } from '../types'
import { scoreRecipes, type SuggestFilters } from '../lib/suggest'
import { RecipeRow } from '../components/RecipeRow'
import { Chips, Empty, SearchInput, Sheet, UserPicker } from '../components/ui'
import { RecipeEditor } from '../components/RecipeEditor'
import { RecipeImport } from '../components/RecipeImport'
import { IconFilter, IconImport, IconPlus } from '../components/Icons'
import { buildProductIndex, recipeCost } from '../lib/cost'
import { alive } from '../lib/db'
import { classNames, countOf, formatMoney } from '../lib/util'
import { categoriesWithRecipes } from '../lib/categories'

type Sort = 'forgotten' | 'name' | 'rating' | 'cost'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'forgotten', label: 'Давно не готовили' },
  { id: 'name', label: 'По алфавиту' },
  { id: 'rating', label: 'По оценке' },
  { id: 'cost', label: 'Сначала дешёвые' },
]

interface Extra {
  chef: Chef | 'all'
  onlyFavorite: boolean
  onlyInStock: boolean
  onlyRegular: boolean
}

const NO_EXTRA: Extra = { chef: 'all', onlyFavorite: false, onlyInStock: false, onlyRegular: false }

export function Recipes() {
  const { db } = useStore()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('forgotten')
  const [extra, setExtra] = useState<Extra>(NO_EXTRA)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  const index = useMemo(() => buildProductIndex(alive(db.products)), [db.products])
  const categories = useMemo(() => categoriesWithRecipes(db), [db])

  const activeExtra =
    (extra.chef !== 'all' ? 1 : 0) +
    (extra.onlyFavorite ? 1 : 0) +
    (extra.onlyInStock ? 1 : 0) +
    (extra.onlyRegular ? 1 : 0)

  const list = useMemo(() => {
    const filters: SuggestFilters = {
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      chef: extra.chef,
      onlyInStock: extra.onlyInStock || undefined,
    }
    let result = scoreRecipes(db, filters)
    // Поиск смотрит и в заметки к блюду — «где мы писали про меньше соли».
    if (filters.search) {
      const query = filters.search.toLowerCase()
      const matchedByComment = new Set(
        alive(db.comments)
          .filter((comment) => comment.text.toLowerCase().includes(query))
          .map((comment) => comment.recipeId),
      )
      if (matchedByComment.size > 0) {
        const found = new Set(result.map((item) => item.recipe.id))
        const extra = scoreRecipes(db, { ...filters, search: undefined }).filter(
          (item) => matchedByComment.has(item.recipe.id) && !found.has(item.recipe.id),
        )
        result = [...result, ...extra]
      }
    }
    if (extra.onlyFavorite) result = result.filter((item) => item.recipe.favorite)
    if (extra.onlyRegular) result = result.filter((item) => item.recipe.regular)

    const sorted = [...result]
    if (sort === 'name') sorted.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name, 'ru'))
    if (sort === 'rating') {
      const average = (item: (typeof sorted)[number]) => {
        const values = Object.values(item.recipe.ratings ?? {}).filter(
          (value): value is number => typeof value === 'number',
        )
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
      }
      sorted.sort((a, b) => average(b) - average(a))
    }
    if (sort === 'cost') {
      const price = (item: (typeof sorted)[number]) => {
        const cost = recipeCost(item.recipe, index)
        return cost.known > 0 ? cost.total : Number.POSITIVE_INFINITY
      }
      sorted.sort((a, b) => price(a) - price(b))
    }
    if (sort === 'forgotten') sorted.sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    return sorted
  }, [db, search, category, sort, extra, index])

  const total = alive(db.recipes).length

  return (
    <>
      <TopBar
        title="Рецепты"
        subtitle={countOf(total, 'dish')}
        actions={
          <button className="icon-btn" onClick={() => setImporting(true)} aria-label="Импорт рецепта">
            <IconImport />
          </button>
        }
      />
      <main className="content with-fab">
        <SearchInput value={search} onChange={setSearch} placeholder="Блюдо, продукт или тег" />

        {categories.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <Chips
              value={category}
              onChange={setCategory}
              options={[{ id: 'all', label: 'Все' }, ...categories.map((item) => ({ id: item, label: item }))]}
            />
          </div>
        )}

        <div className="filter-bar">
          <button
            className={classNames('filter-btn', activeExtra > 0 && 'on')}
            onClick={() => setFiltersOpen(true)}
          >
            <IconFilter size={15} />
            Фильтры
            {activeExtra > 0 && <span className="filter-count">{activeExtra}</span>}
          </button>
          <select className="plain grow" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="small muted">{list.length}</span>
        </div>

        <div className="card-flat" style={{ marginTop: 12 }}>
          {list.length === 0 ? (
            <Empty
              title={total === 0 ? 'Здесь пока пусто' : 'Ничего не подошло'}
              text={
                total === 0
                  ? 'Добавьте первое блюдо — дальше приложение само начнёт подсказывать'
                  : 'Попробуйте снять фильтры или изменить запрос'
              }
              action={
                total === 0 ? (
                  <div className="stack">
                    <button className="btn btn-primary" onClick={() => setCreating(true)}>
                      <IconPlus size={16} /> Добавить блюдо
                    </button>
                    <button className="btn" onClick={() => setImporting(true)}>
                      <IconImport size={16} /> Импорт через чат-бот
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    onClick={() => {
                      setExtra(NO_EXTRA)
                      setCategory('all')
                      setSearch('')
                    }}
                  >
                    Сбросить фильтры
                  </button>
                )
              }
            />
          ) : (
            list.map((item) => {
              const cost = recipeCost(item.recipe, index)
              return (
                <RecipeRow
                  key={item.recipe.id}
                  recipe={item.recipe}
                  days={item.days}
                  right={
                    cost.known > 0 ? (
                      <span className="small muted">{formatMoney(cost.total, db.settings.currency)}</span>
                    ) : undefined
                  }
                />
              )
            })
          )}
        </div>
      </main>

      <button className="fab" onClick={() => setCreating(true)} aria-label="Добавить блюдо">
        <IconPlus size={24} />
      </button>

      {filtersOpen && (
        <Sheet
          title="Фильтры"
          onClose={() => setFiltersOpen(false)}
          actions={
            activeExtra > 0 ? (
              <button className="btn btn-sm btn-ghost" onClick={() => setExtra(NO_EXTRA)}>
                Сбросить
              </button>
            ) : undefined
          }
        >
          <div className="stack">
            <div className="field">
              <label>Кто готовит</label>
              <UserPicker
                value={extra.chef === 'all' ? 'any' : extra.chef}
                onChange={(value) =>
                  setExtra((previous) => ({ ...previous, chef: value === 'any' ? 'all' : (value as Chef) }))
                }
                allowAny
              />
            </div>

            <label className="switch">
              <span>Только избранное</span>
              <input
                type="checkbox"
                checked={extra.onlyFavorite}
                onChange={(event) => setExtra((p) => ({ ...p, onlyFavorite: event.target.checked }))}
              />
            </label>
            <label className="switch">
              <span>
                Только постоянные
                <div className="small muted">Блюда, которые вы едите регулярно</div>
              </span>
              <input
                type="checkbox"
                checked={extra.onlyRegular}
                onChange={(event) => setExtra((p) => ({ ...p, onlyRegular: event.target.checked }))}
              />
            </label>
            <label className="switch">
              <span>
                Всё есть дома
                <div className="small muted">Можно приготовить без похода в магазин</div>
              </span>
              <input
                type="checkbox"
                checked={extra.onlyInStock}
                onChange={(event) => setExtra((p) => ({ ...p, onlyInStock: event.target.checked }))}
              />
            </label>

            <button className="btn btn-primary btn-block" onClick={() => setFiltersOpen(false)}>
              Показать {list.length}
            </button>
          </div>
        </Sheet>
      )}

      {creating && <RecipeEditor onClose={() => setCreating(false)} />}
      {importing && <RecipeImport onClose={() => setImporting(false)} />}
    </>
  )
}
