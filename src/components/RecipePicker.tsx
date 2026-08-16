import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { Sheet, SearchInput, Empty } from './ui'
import { RecipeRow } from './RecipeRow'
import { buildHistory, daysSince } from '../lib/suggest'
import type { Recipe } from '../types'

export function RecipePicker({
  title = 'Выбрать блюдо',
  header,
  onPick,
  onClose,
  onFreeText,
}: {
  title?: string
  /** Дополнительный блок над поиском — например выбор приёма пищи. */
  header?: ReactNode
  onPick: (recipe: Recipe) => void
  onClose: () => void
  onFreeText?: (text: string) => void
}) {
  const { db } = useStore()
  const [query, setQuery] = useState('')
  const history = useMemo(() => buildHistory(db), [db])

  const list = useMemo(() => {
    const search = query.trim().toLowerCase()
    return alive(db.recipes)
      .filter((recipe) => !recipe.archived)
      .filter((recipe) => !search || recipe.name.toLowerCase().includes(search) || recipe.category.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [db.recipes, query])

  return (
    <Sheet title={title} onClose={onClose}>
      {header}
      <SearchInput value={query} onChange={setQuery} placeholder="Название или категория" />
      {onFreeText && query.trim() && (
        <button
          className="btn btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            onFreeText(query.trim())
            onClose()
          }}
        >
          Записать как «{query.trim()}» без рецепта
        </button>
      )}
      <div className="card-flat" style={{ marginTop: 12 }}>
        {list.length === 0 ? (
          <Empty title="Ничего не найдено" text="Попробуйте другое слово или добавьте новое блюдо" />
        ) : (
          list.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              days={daysSince(history, recipe.id)}
              onClick={() => {
                onPick(recipe)
                onClose()
              }}
            />
          ))
        )}
      </div>
    </Sheet>
  )
}
