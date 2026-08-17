import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MEAL_SLOTS, USERS, type Cook, type Entry, type MealSlot, type Recipe } from '../types'
import { useStore } from '../lib/store'
import { Avatar, Confirm, Field, Segmented, Sheet, Stars, UserPicker, toast } from './ui'
import { RecipePicker } from './RecipePicker'
import { buildProductIndex, recipeCost, servingsMultiplier } from '../lib/cost'
import { guessMeal } from '../lib/suggest'
import { alive } from '../lib/db'
import { entryForRecipeOn, isLikelyLeftovers } from '../lib/entries'
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
  const navigate = useNavigate()
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
  /*
   * «Доедаем» для новой записи угадывается так же, как в кнопках быстрого
   * добавления, — иначе одно и то же действие через форму давало другой
   * результат в списке покупок. Пересчёт при смене даты и блюда, пока
   * пользователь не тронул тумблер руками.
   */
  const [leftovers, setLeftovers] = useState(() => {
    if (entry) return Boolean(entry.leftovers)
    if (initial.leftovers != null) return Boolean(initial.leftovers)
    if (initial.recipeId && initial.date) return isLikelyLeftovers(db, initial.date, initial.recipeId)
    return false
  })
  const leftoversTouched = useRef(false)
  const mealTouched = useRef(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /** Пересчёт авто-флага при смене даты или блюда — пока тумблер не трогали руками. */
  const syncAuto = (nextDate: string, nextRecipe: string | undefined) => {
    if (entry || leftoversTouched.current) return
    setLeftovers(Boolean(nextRecipe && nextDate && isLikelyLeftovers(db, nextDate, nextRecipe)))
  }

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
    /*
     * Дубли блокируем и здесь: остальные пути добавления проверяют день,
     * а через форму одно и то же блюдо попадало в день дважды — и потом
     * считалось двумя готовками с двойной закупкой продуктов.
     */
    if (!entry?.id && recipeId) {
      const existing = entryForRecipeOn(db, date, recipeId)
      if (existing) {
        toast(existing.status === 'planned' ? 'Уже в списке на этот день' : 'В этот день уже готовили')
        return
      }
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
      leftovers: recipeId && leftovers ? true : undefined,
    })
    onClose()
  }

  return (
    <>
      <Sheet
        title={
          recipe?.name ?? (title || (entry ? 'Запись' : status === 'planned' ? 'Запланировать' : 'Что ели'))
        }
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
                  onChange={(e) => {
                    setDate(e.target.value)
                    syncAuto(e.target.value, recipeId)
                  }}
                />
              </Field>
            </div>
            <div className="grow">
              <Field label="Приём пищи">
                <select
                  className="input"
                  value={meal}
                  onChange={(e) => {
                    mealTouched.current = true
                    setMeal(e.target.value as MealSlot)
                  }}
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
              <div className="row" style={{ gap: 4 }}>
                {/* Удалённый рецепт открывать некуда — там пустая страница «не найдено» */}
                {recipe && !recipe.deletedAt && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      onClose()
                      navigate(`/recipes/${recipe.id}`)
                    }}
                  >
                    Открыть рецепт
                  </button>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setRecipeId(undefined)
                    setTitle('')
                    setLeftovers(false)
                  }}
                >
                  Очистить
                </button>
              </div>
            )}
          </div>

          {recipeId && (
            <label className="row-between" style={{ padding: '2px 0', cursor: 'pointer' }}>
              <span>Доедаем</span>
              <input
                type="checkbox"
                checked={leftovers}
                onChange={(event) => {
                  leftoversTouched.current = true
                  setLeftovers(event.target.checked)
                }}
              />
            </label>
          )}

          {/* Порции и стоимость — второстепенные числа, им хватает одной строки */}
          <div className="row">
            {recipe?.servings != null && (
              <div className="grow">
                <Field label="Порций">
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder={String(recipe.servings)}
                    value={servings}
                    onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
            )}
            <div className="grow">
              <Field
                label="Стоимость"
                hint={
                  estimated && estimated.known > 0
                    ? `по ценам ~${Math.round(estimated.total)} ${db.settings.currency}`
                    : undefined
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
            </div>
          </div>

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
            syncAuto(date, picked.id)
            // Приём пищи угадываем по разделу, пока его не меняли руками.
            if (!entry && !mealTouched.current) setMeal(guessMeal(picked.category))
          }}
          onFreeText={(text) => {
            setRecipeId(undefined)
            setTitle(text)
            setLeftovers(false)
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
