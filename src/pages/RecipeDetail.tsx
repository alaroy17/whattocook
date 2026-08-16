import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { Thumb } from '../components/RecipeRow'
import { Avatar, Confirm, Empty, Stars, toast } from '../components/ui'
import { RecipeEditor } from '../components/RecipeEditor'
import { EntryEditor } from '../components/EntryEditor'
import { buildProductIndex, ingredientCost, recipeCost, scaleIngredient, servingsMultiplier } from '../lib/cost'
import { buildHistory, daysSince, guessMeal } from '../lib/suggest'
import { entryForRecipeOn } from '../lib/entries'
import { formatDate, today } from '../lib/date'
import { agoWord, countOf, formatAmount, formatMoney, normalizeName, safeUrl, timesWord } from '../lib/util'
import {
  IconEdit,
  IconHeart,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../components/Icons'
import { MEAL_SLOTS, USERS, userName, type Recipe } from '../types'
import { isPendingPhoto, uploadRecipePhoto } from '../lib/photos'

/** Фото блюда прямо на карточке: снять камерой или выбрать из галереи в одно нажатие. */
function RecipePhoto({ recipe }: { recipe: Recipe }) {
  const { saveRecipe } = useStore()
  const [uploading, setUploading] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const photoId = await uploadRecipePhoto(file, recipe.photoId)
      saveRecipe({ id: recipe.id, photoId })
      // Без сети снимок остаётся в очереди и уедет на Диск при синхронизации.
      toast(isPendingPhoto(photoId) ? 'Фото сохранится на Диск, когда появится сеть' : 'Фото добавлено')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
    }
  }

  return (
    <label style={{ display: 'block', position: 'relative', cursor: 'pointer' }}>
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {recipe.photoId ? (
        <>
          <Thumb photoId={recipe.photoId} large />
          <span className="photo-edit">
            <IconPhoto size={16} /> {uploading ? 'Загрузка…' : 'Заменить'}
          </span>
        </>
      ) : (
        <span className="photo-empty">
          <IconPhoto size={22} />
          {uploading ? 'Загрузка…' : 'Добавить фото блюда'}
        </span>
      )}
    </label>
  )
}

export function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { db, me, saveRecipe, saveEntry, addComment, remove, restore } = useStore()
  const [editing, setEditing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [portions, setPortions] = useState<number | null>(null)

  const recipe = db.recipes[id]
  const index = useMemo(() => buildProductIndex(alive(db.products)), [db.products])
  const history = useMemo(() => buildHistory(db), [db])

  const entries = useMemo(
    () =>
      alive(db.entries)
        .filter((entry) => entry.recipeId === id && entry.status === 'done')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.entries, id],
  )

  const comments = useMemo(
    () =>
      alive(db.comments)
        .filter((comment) => comment.recipeId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [db.comments, id],
  )

  if (!recipe || recipe.deletedAt) {
    return (
      <>
        <TopBar title="Блюдо" back />
        <main className="content">
          <Empty title="Блюдо не найдено" text="Возможно, оно было удалено" />
        </main>
      </>
    )
  }

  const days = daysSince(history, recipe.id)
  const times = history.timesCooked.get(recipe.id) ?? 0
  // Пересчёт на другое число порций — только для просмотра, в рецепт не сохраняется.
  const multiplier = servingsMultiplier(recipe, portions)
  const cost = recipeCost(recipe, index, multiplier)
  const scaled = recipe.servings != null && portions != null && portions !== recipe.servings

  return (
    <>
      <TopBar
        title={recipe.name}
        back
        showUser={false}
        subtitle={`${recipe.category}${recipe.timeMin ? ` · ${recipe.timeMin} мин` : ''}`}
        actions={
          <>
            <button
              className="icon-btn"
              onClick={() => saveRecipe({ id: recipe.id, favorite: !recipe.favorite })}
              aria-label="В избранное"
              style={{ color: recipe.favorite ? 'var(--accent)' : undefined }}
            >
              <IconHeart filled={recipe.favorite} />
            </button>
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Редактировать">
              <IconEdit />
            </button>
          </>
        }
      />

      <main className="content">
        <RecipePhoto recipe={recipe} />

        {/* Факты — обычной строкой: россыпь плашек занимала три ряда и читалась хуже. */}
        <div className="meta" style={{ marginTop: 14, fontSize: 'var(--text-sm)' }}>
          <span>{agoWord(days)}</span>
          {times > 0 && <span>приготовили {timesWord(times)}</span>}
          {recipe.chef !== 'any' && (
            <span className="row" style={{ gap: 4 }}>
              <IconUsers size={13} /> {userName(recipe.chef)}
            </span>
          )}
          {recipe.servings ? <span>{countOf(recipe.servings, 'serving')}</span> : null}
        </div>

        {(cost.known > 0 || recipe.tags.length > 0) && (
          <div className="row" style={{ marginTop: 10, gap: 7, flexWrap: 'wrap' }}>
            {cost.known > 0 && (
              <span className="badge badge-accent">
                {formatMoney(cost.total, db.settings.currency)}
                {recipe.servings
                  ? ` · ${formatMoney(cost.total / (portions ?? recipe.servings), db.settings.currency)} порция`
                  : ''}
              </span>
            )}
            {recipe.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary grow"
            onClick={() => {
              /*
               * Первое нажатие — блюдо в списке дня как план. Второе — отметка
               * «приготовили». Дубли не создаются.
               */
              const existing = entryForRecipeOn(db, today(), recipe.id)
              if (existing) {
                if (existing.status === 'planned') {
                  saveEntry({ id: existing.id, status: 'done' })
                  toast('Отметили приготовленным')
                } else {
                  toast('Сегодня уже готовили')
                }
                return
              }
              const meal = guessMeal(recipe.category)
              saveEntry({ date: today(), meal, status: 'planned', recipeId: recipe.id })
              toast(
                `Добавили на сегодня — ${MEAL_SLOTS.find((slot) => slot.id === meal)?.name.toLowerCase()}`,
              )
            }}
          >
            <IconPlus size={16} /> Готовим сегодня
          </button>
          <button className="btn" onClick={() => setPlanning(true)}>
            В план
          </button>
        </div>

        {recipe.ingredients.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Ингредиенты</h2>
              {cost.unknown.length > 0 && (
                <span className="small muted">нет цены: {cost.unknown.length}</span>
              )}
            </div>

            {/* Пересчёт на другое число порций: «готовлю на шестерых» без калькулятора. */}
            {recipe.servings != null && (
              <div className="portions">
                <span className="grow small muted">Готовлю на</span>
                <button
                  className="icon-btn"
                  aria-label="Меньше порций"
                  disabled={(portions ?? recipe.servings) <= 1}
                  onClick={() => setPortions(Math.max(1, (portions ?? recipe.servings!) - 1))}
                >
                  <IconMinus />
                </button>
                <span className="portions-value">{countOf(portions ?? recipe.servings, 'serving')}</span>
                <button
                  className="icon-btn"
                  aria-label="Больше порций"
                  onClick={() => setPortions((portions ?? recipe.servings!) + 1)}
                >
                  <IconPlus />
                </button>
                {scaled && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setPortions(null)}>
                    Сбросить
                  </button>
                )}
              </div>
            )}

            <div className="card-flat">
              {recipe.ingredients.map((raw, i) => {
                const ingredient = scaleIngredient(raw, multiplier)
                const product = index.get(normalizeName(ingredient.name))
                const price = ingredientCost(ingredient, index)
                return (
                  <div className="shop-item" key={i} style={{ cursor: 'default' }}>
                    <span
                      className="sync-dot"
                      style={{ background: product?.inStock ? 'var(--good)' : 'var(--border-strong)' }}
                      title={product?.inStock ? 'Есть дома' : 'Нужно купить'}
                    />
                    <span className="grow shop-name">
                      {ingredient.name}
                      {ingredient.note && <span className="small muted"> · {ingredient.note}</span>}
                    </span>
                    <span className="small muted">{formatAmount(ingredient.qty, ingredient.unit)}</span>
                    {price != null && (
                      <span className="small muted" style={{ width: 58, textAlign: 'right' }}>
                        {formatMoney(price, db.settings.currency)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {recipe.steps.trim() && (
          <section className="section">
            <div className="section-head">
              <h2>Приготовление</h2>
            </div>
            <div className="card steps">{recipe.steps}</div>
          </section>
        )}

        {safeUrl(recipe.sourceUrl) && (
          <section className="section">
            <a
              className="btn btn-block"
              href={safeUrl(recipe.sourceUrl)!}
              target="_blank"
              rel="noreferrer noopener"
            >
              Открыть исходный рецепт
            </a>
          </section>
        )}

        {/* Оценки — после рецептурной части: готовящему сначала нужны ингредиенты и шаги */}
        <section className="section">
          <div className="section-head">
            <h2>Оценки</h2>
          </div>
          <div className="card">
            {USERS.map((user) => (
              <div className="row-between" key={user.id} style={{ padding: '5px 0' }}>
                <span className="row" style={{ gap: 8 }}>
                  <Avatar id={user.id} />
                  {user.name}
                </span>
                <Stars
                  value={recipe.ratings?.[user.id]}
                  onChange={(value) =>
                    saveRecipe({
                      id: recipe.id,
                      ratings: { ...recipe.ratings, [user.id]: value || undefined },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Заметки</h2>
          </div>
          <div className="card">
            {comments.length === 0 && <div className="small muted">Пока нет заметок</div>}
            {comments.map((comment) => (
              <div className="comment" key={comment.id}>
                <Avatar id={comment.author} />
                <div className="grow">
                  <div className="small muted">
                    {userName(comment.author)} · {formatDate(comment.createdAt.slice(0, 10))}
                  </div>
                  <div>{comment.text}</div>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => {
                    remove('comments', comment.id)
                    toast('Заметка удалена', {
                      label: 'Отменить',
                      onClick: () => restore('comments', comment.id),
                    })
                  }}
                  aria-label="Удалить заметку"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <Avatar id={me} />
              <input
                className="input input-sm grow"
                placeholder="Добавить заметку"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && commentText.trim()) {
                    addComment(recipe.id, commentText.trim())
                    setCommentText('')
                  }
                }}
              />
              <button
                className="btn btn-sm"
                disabled={!commentText.trim()}
                onClick={() => {
                  addComment(recipe.id, commentText.trim())
                  setCommentText('')
                }}
              >
                Ок
              </button>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Когда готовили</h2>
          </div>
          <div className="card-flat">
            {entries.length === 0 && (
              <div className="empty small">Ещё ни разу — самое время попробовать</div>
            )}
            {entries.slice(0, 20).map((entry) => (
              <div className="shop-item" key={entry.id} style={{ cursor: 'default' }}>
                <span className="grow">
                  {formatDate(entry.date, { year: true })}
                  <span className="small muted"> · {MEAL_SLOTS.find((m) => m.id === entry.meal)?.name}</span>
                  {entry.note && <div className="small muted">{entry.note}</div>}
                </span>
                {entry.cook && <Avatar id={entry.cook} />}
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={16} /> Удалить блюдо
          </button>
        </section>
      </main>

      {editing && <RecipeEditor recipe={recipe} onClose={() => setEditing(false)} />}
      {planning && (
        <EntryEditor
          defaults={{ date: today(), meal: 'dinner', status: 'planned', recipeId: recipe.id }}
          onClose={() => setPlanning(false)}
        />
      )}
      {confirmDelete && (
        <Confirm
          title="Удалить блюдо?"
          text="История приготовлений останется, но само блюдо пропадёт из списка."
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            remove('recipes', recipe.id)
            navigate('/recipes')
            toast(`«${recipe.name}» удалено`, {
              label: 'Отменить',
              onClick: () => restore('recipes', recipe.id),
            })
          }}
        />
      )}
    </>
  )
}
