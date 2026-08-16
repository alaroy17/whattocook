import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { Thumb } from '../components/RecipeRow'
import { Avatar, Confirm, Empty, Stars, toast } from '../components/ui'
import { RecipeEditor } from '../components/RecipeEditor'
import { EntryEditor } from '../components/EntryEditor'
import { buildProductIndex, ingredientCost, recipeCost } from '../lib/cost'
import { buildHistory, daysSince } from '../lib/suggest'
import { formatDate, today } from '../lib/date'
import { daysWord, formatMoney, formatQty, normalizeName, timesWord } from '../lib/util'
import { IconCheck, IconEdit, IconHeart, IconTrash, IconUsers } from '../components/Icons'
import { MEAL_SLOTS, USERS, userName } from '../types'

export function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { db, me, saveRecipe, saveEntry, addComment, remove } = useStore()
  const [editing, setEditing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentText, setCommentText] = useState('')

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

  const cost = recipeCost(recipe, index)
  const days = daysSince(history, recipe.id)
  const times = history.timesCooked.get(recipe.id) ?? 0

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
        {recipe.photoId && <Thumb photoId={recipe.photoId} large />}

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <span className="badge">
            {days == null ? 'ещё не готовили' : days === 0 ? 'готовили сегодня' : `${daysWord(days)} назад`}
          </span>
          {times > 0 && <span className="badge">приготовили {timesWord(times)}</span>}
          {recipe.chef !== 'any' && (
            <span className="badge">
              <IconUsers size={13} /> обычно готовит {userName(recipe.chef)}
            </span>
          )}
          {recipe.servings && <span className="badge">{recipe.servings} порц.</span>}
          {cost.known > 0 && (
            <span className="badge badge-accent">
              {formatMoney(cost.total, db.settings.currency)}
              {recipe.servings ? ` · ${formatMoney(cost.total / recipe.servings, db.settings.currency)}/порц.` : ''}
            </span>
          )}
          {recipe.tags.map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary grow"
            onClick={() => {
              saveEntry({ date: today(), meal: 'dinner', status: 'done', recipeId: recipe.id })
              toast('Записали в историю')
            }}
          >
            <IconCheck size={16} /> Готовим сегодня
          </button>
          <button className="btn" onClick={() => setPlanning(true)}>
            В план
          </button>
        </div>

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

        {recipe.ingredients.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Ингредиенты</h2>
              {cost.unknown.length > 0 && (
                <span className="small muted">нет цены: {cost.unknown.length}</span>
              )}
            </div>
            <div className="card-flat">
              {recipe.ingredients.map((ingredient, i) => {
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
                    <span className="small muted">
                      {formatQty(ingredient.qty)} {ingredient.qty != null ? ingredient.unit : ''}
                    </span>
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

        {recipe.sourceUrl && (
          <section className="section">
            <a className="btn btn-block" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              Открыть исходный рецепт
            </a>
          </section>
        )}

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
                  onClick={() => remove('comments', comment.id)}
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
          }}
        />
      )}
    </>
  )
}
