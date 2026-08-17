import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { SwipeRow } from './SwipeRow'
import { Thumb } from './RecipeRow'
import { Avatar, toast } from './ui'
import { IconCheck } from './Icons'
import { MEAL_SLOTS, type Entry } from '../types'
import { classNames, formatMoney } from '../lib/util'

/**
 * Строка записи — одна и та же в «Сегодня» и календаре, с одними правилами:
 * тап — открыть рецепт, кружок слева — статус, свайп влево — изменить/удалить.
 */
export function EntryRow({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const { db, saveEntry, remove, restore } = useStore()
  const navigate = useNavigate()

  const recipe = entry.recipeId ? db.recipes[entry.recipeId] : undefined
  const title = recipe?.name ?? entry.title ?? 'Без названия'
  const meal = MEAL_SLOTS.find((slot) => slot.id === entry.meal)?.name

  return (
    <SwipeRow
      actions={[
        { label: 'Изменить', kind: 'normal', onClick: onEdit },
        {
          label: 'Удалить',
          kind: 'danger',
          onClick: () => {
            remove('entries', entry.id)
            toast('Запись удалена', { label: 'Отменить', onClick: () => restore('entries', entry.id) })
          },
        },
      ]}
    >
      <div
        className="recipe-row"
        onClick={() => (recipe && !recipe.deletedAt ? navigate(`/recipes/${recipe.id}`) : onEdit())}
      >
        <button
          className={classNames('status-toggle', entry.status === 'done' && 'done')}
          aria-label={entry.status === 'done' ? 'Приготовлено' : 'Отметить приготовленным'}
          onClick={(event) => {
            event.stopPropagation()
            saveEntry({ id: entry.id, status: entry.status === 'done' ? 'planned' : 'done' })
          }}
        >
          {entry.status === 'done' && <IconCheck size={15} />}
        </button>
        <Thumb photoId={recipe?.photoId} />
        <div className="grow">
          <div className={classNames('recipe-title ellipsis', entry.status === 'done' && 'done-title')}>
            {title}
          </div>
          <div className="meta">
            {meal && <span>{meal}</span>}
            {entry.leftovers && <span>доедаем</span>}
            {entry.servings ? <span>{entry.servings} порц.</span> : null}
            {entry.cost != null && <span>{formatMoney(entry.cost, db.settings.currency)}</span>}
          </div>
          {entry.note && <div className="small muted ellipsis">{entry.note}</div>}
        </div>
        {entry.cook && <Avatar id={entry.cook} />}
      </div>
    </SwipeRow>
  )
}
