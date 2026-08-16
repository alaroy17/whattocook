import { useState } from 'react'
import { MEAL_SLOTS, USERS, type Cook, type Entry, type MealSlot, type Recipe } from '../types'
import { useStore } from '../lib/store'
import { Avatar, Confirm, Field, Segmented, Sheet, Stars, UserPicker, toast } from './ui'
import { RecipePicker } from './RecipePicker'
import { buildProductIndex, recipeCost, servingsMultiplier } from '../lib/cost'
import { alive } from '../lib/db'
import { formatDate } from '../lib/date'
import { countOf } from '../lib/util'
import { IconTrash } from './Icons'

export function EntryEditor({
  entry,
  defaults,
  onClose,
}: {
  entry?: Entry
  defaults?: Partial<Entry>
  onClose: () => void
}) {
  const { db, saveEntry, remove, restore } = useStore()
  const initial = entry ?? defaults ?? {}
  const [date, setDate] = useState(initial.date ?? '')
  const [meal, setMeal] = useState<MealSlot>(initial.meal ?? 'dinner')
  const [status, setStatus] = useState<'planned' | 'done'>(initial.status ?? 'done')
  const [recipeId, setRecipeId] = useState(initial.recipeId)
  const [title, setTitle] = useState(initial.title ?? '')
  const [cook, setCook] = useState<Cook | undefined>(initial.cook)
  const [note, setNote] = useState(initial.note ?? '')
  const [ratings, setRatings] = useState(initial.ratings ?? {})
  const [cost, setCost] = useState(initial.cost != null ? String(initial.cost) : '')
  const [servings, setServings] = useState(initial.servings != null ? String(initial.servings) : '')
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const recipe: Recipe | undefined = recipeId ? db.recipes[recipeId] : undefined
  const index = buildProductIndex(alive(db.products))
  const estimated = recipe
    ? recipeCost(recipe, index, servingsMultiplier(recipe, servings ? Number(servings) : null))
    : null

  const submit = () => {
    if (!date) {
      toast('Укажите дату')
      return
    }
    if (!recipeId && !title.trim()) {
      toast('Выберите блюдо или впишите название')
      return
    }
    const parsedCost = Number(cost.replace(',', '.'))
    saveEntry({
      id: entry?.id,
      date,
      meal,
      status,
      recipeId,
      title: recipeId ? undefined : title.trim(),
      cook,
      note: note.trim() || undefined,
      ratings,
      cost: cost.trim() && Number.isFinite(parsedCost) ? parsedCost : null,
      servings: servings.trim() ? Number(servings) : null,
    })
    onClose()
  }

  return (
    <>
      <Sheet
        title={entry ? 'Запись' : status === 'planned' ? 'Запланировать' : 'Что ели'}
        onClose={onClose}
        actions={
          entry ? (
            <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Удалить">
              <IconTrash />
            </button>
          ) : undefined
        }
      >
        <div className="stack">
          <div className="row">
            <div className="grow">
              <Field label="Дата">
                <input
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <div className="grow">
              <Field label="Приём пищи">
                <select
                  className="input"
                  value={meal}
                  onChange={(e) => setMeal(e.target.value as MealSlot)}
                >
                  {MEAL_SLOTS.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <Field label="Статус">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { id: 'planned', label: 'Планируем' },
                { id: 'done', label: 'Приготовили' },
              ]}
            />
          </Field>

          <div className="field">
            <label>Блюдо</label>
            <button className="btn btn-block" onClick={() => setPicking(true)}>
              {recipe ? recipe.name : title || 'Выбрать из рецептов'}
            </button>
            {(recipe || title) && (
              <button
                className="btn btn-sm btn-ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => {
                  setRecipeId(undefined)
                  setTitle('')
                }}
              >
                Очистить
              </button>
            )}
          </div>

          {recipe?.servings != null && (
            <Field
              label="Порций"
              hint={`В рецепте ${countOf(recipe.servings, 'serving')} — количество в списке покупок пересчитается`}
            >
              <input
                className="input"
                inputMode="numeric"
                placeholder={String(recipe.servings)}
                value={servings}
                onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          )}

          <Field label="Кто готовил">
            <UserPicker value={cook} onChange={(value) => setCook(value as Cook)} allowBoth />
          </Field>

          {status === 'done' && (
            <div className="field">
              <label>Как получилось</label>
              {USERS.map((user) => (
                <div className="row-between" key={user.id} style={{ padding: '3px 0' }}>
                  <span className="row" style={{ gap: 7 }}>
                    <Avatar id={user.id} />
                    {user.name}
                  </span>
                  <Stars
                    value={ratings[user.id]}
                    onChange={(value) => setRatings((r) => ({ ...r, [user.id]: value || undefined }))}
                  />
                </div>
              ))}
            </div>
          )}

          <Field label="Комментарий" hint="Например: в следующий раз меньше соли">
            <textarea
              className="input"
              style={{ minHeight: 70 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <Field
            label="Стоимость"
            hint={
              estimated && estimated.known > 0
                ? `По каталогу цен примерно ${Math.round(estimated.total)} ${db.settings.currency}`
                : 'Необязательно'
            }
          >
            <input
              className="input"
              inputMode="decimal"
              placeholder={estimated && estimated.known > 0 ? String(Math.round(estimated.total)) : ''}
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ''))}
            />
          </Field>

          {date && <div className="small muted">{formatDate(date, { weekday: true, year: true })}</div>}

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn grow" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-primary grow" onClick={submit}>
              Сохранить
            </button>
          </div>
        </div>
      </Sheet>

      {picking && (
        <RecipePicker
          onClose={() => setPicking(false)}
          onPick={(picked) => {
            setRecipeId(picked.id)
            setTitle('')
          }}
          onFreeText={(text) => {
            setRecipeId(undefined)
            setTitle(text)
          }}
        />
      )}

      {confirmDelete && entry && (
        <Confirm
          title="Удалить запись?"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            remove('entries', entry.id)
            setConfirmDelete(false)
            onClose()
            toast('Запись удалена', {
              label: 'Отменить',
              onClick: () => restore('entries', entry.id),
            })
          }}
        />
      )}
    </>
  )
}
