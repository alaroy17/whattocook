import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { formatDate, formatRelativeDay, today } from '../lib/date'
import {
  guessMeal,
  pickRandom,
  regularRecipes,
  scoreRecipes,
  type SuggestFilters,
  type Suggestion,
} from '../lib/suggest'
import { RecipeRow, Thumb } from '../components/RecipeRow'
import { Chips, Empty, Segmented, toast } from '../components/ui'
import { EntryEditor } from '../components/EntryEditor'
import { ConnectNotice } from '../components/ConnectNotice'
import { RecipeEditor } from '../components/RecipeEditor'
import { IconDice, IconFridge, IconPlus, IconRefresh, IconRepeat } from '../components/Icons'
import { MEAL_SLOTS } from '../types'
import { agoWord, daysWord, intervalWord } from '../lib/util'
import { categoriesWithRecipes } from '../lib/categories'
import { fridgeNeedsReview, fridgeStaleDays } from '../lib/fridge'
import { entryForRecipeOn } from '../lib/entries'
import { EntryRow } from '../components/EntryRow'

type Mode = 'smart' | 'random'

export function Today() {
  const { db, saveEntry } = useStore()
  const navigate = useNavigate()
  const date = today()

  const [mode, setMode] = useState<Mode>('smart')
  const [category, setCategory] = useState<string>('all')
  const [seed, setSeed] = useState(0)
  const [showRecent, setShowRecent] = useState(false)
  const [logging, setLogging] = useState<{ recipeId?: string; status: 'planned' | 'done' } | null>(null)
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const filters: SuggestFilters = useMemo(
    () => ({ category: category === 'all' ? undefined : category, excludeRegular: true }),
    [category],
  )
  const suggestions = useMemo(() => scoreRecipes(db, filters, date), [db, filters, date])
  const categories = useMemo(() => categoriesWithRecipes(db), [db])
  const regulars = useMemo(() => regularRecipes(db, date), [db, date])

  const random = useMemo(() => {
    void seed
    return pickRandom(suggestions)
  }, [suggestions, seed])

  const fresh = suggestions.filter((item) => !item.tooRecent)
  const recent = suggestions.filter((item) => item.tooRecent)
  const hero: Suggestion | null = mode === 'random' ? random : fresh[0] ?? null
  const rest = fresh.filter((item) => item.recipe.id !== hero?.recipe.id).slice(0, 8)

  const todayEntries = useMemo(
    () =>
      alive(db.entries)
        .filter((entry) => entry.date === date)
        .sort(
          (a, b) => MEAL_SLOTS.findIndex((m) => m.id === a.meal) - MEAL_SLOTS.findIndex((m) => m.id === b.meal),
        ),
    [db.entries, date],
  )

  const totalRecipes = alive(db.recipes).filter((recipe) => !recipe.archived).length
  const needsFridge = fridgeNeedsReview(db)
  const stale = fridgeStaleDays(db)

  const mealName = (meal: string) => MEAL_SLOTS.find((slot) => slot.id === meal)?.name ?? ''

  /**
   * «Готовим сегодня» добавляет блюдо в список дня как план — галочку человек
   * ставит сам, когда приготовил. Повторное нажатие не создаёт дубль.
   */
  const addToday = (recipeId: string) => {
    const existing = entryForRecipeOn(db, date, recipeId)
    if (existing) {
      toast(existing.status === 'planned' ? 'Уже в списке на сегодня' : 'Сегодня уже готовили')
      return
    }
    const meal = guessMeal(db.recipes[recipeId]?.category)
    const saved = saveEntry({ date, meal, status: 'planned', recipeId })
    toast(`Добавили на сегодня — ${mealName(meal).toLowerCase()}`, {
      label: 'Изменить',
      onClick: () => setEditingEntry(saved.id),
    })
  }

  /** Постоянные блюда — быстрая запись «съели»: одним нажатием, тоже без дублей. */
  const logRegular = (recipeId: string) => {
    const existing = entryForRecipeOn(db, date, recipeId)
    if (existing) {
      if (existing.status === 'planned') {
        saveEntry({ id: existing.id, status: 'done' })
        toast('Отметили приготовленным')
      } else {
        toast('Сегодня уже записано')
      }
      return
    }
    const meal = guessMeal(db.recipes[recipeId]?.category)
    const saved = saveEntry({ date, meal, status: 'done', recipeId })
    toast(`Записали — ${mealName(meal).toLowerCase()}`, {
      label: 'Изменить',
      onClick: () => setEditingEntry(saved.id),
    })
  }

  // Давность и так написана рядом с названием — в бейджах она была бы повтором.
  const badgeReasons = (reasons: string[]) =>
    reasons.filter((reason) => !/^(не готовили|ещё ни разу)/.test(reason))

  return (
    <>
      <TopBar title={formatRelativeDay(date)} />
      <main className="content">
        <ConnectNotice />

        {needsFridge && (
          <div className="notice">
            <IconFridge size={20} />
            <div className="grow small">
              <strong>Проверьте, что есть дома</strong>
              <div className="muted">
                {stale == null
                  ? 'Список продуктов ещё не заполняли'
                  : `Обновляли ${stale === 0 ? 'сегодня' : `${daysWord(stale)} назад`}`}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => navigate('/fridge')}>
              Открыть
            </button>
          </div>
        )}

        {todayEntries.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>На сегодня</h2>
            </div>
            {/*
              Правила простые: тап по блюду — открыть рецепт; кружок слева — статус
              (пустой «планируем», галка «приготовили»); смахнуть влево — изменить
              или удалить. Никаких форм по тапу.
            */}
            <div className="card-flat">
              {todayEntries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onEdit={() => setEditingEntry(entry.id)} />
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2>Что приготовить</h2>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { id: 'smart', label: 'Подсказка' },
                { id: 'random', label: 'Случайно' },
              ]}
            />
          </div>

          {categories.length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <Chips
                value={category}
                onChange={setCategory}
                options={[{ id: 'all', label: 'Все' }, ...categories.map((item) => ({ id: item, label: item }))]}
              />
            </div>
          )}

          {hero ? (
            <div className="hero">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div
                  className="grow"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/recipes/${hero.recipe.id}`)}
                >
                  <h2>{hero.recipe.name}</h2>
                  <div className="meta">
                    <span>{hero.recipe.category}</span>
                    {hero.recipe.timeMin != null && <span>{hero.recipe.timeMin} мин</span>}
                    <span>{hero.days == null ? 'ни разу не готовили' : agoWord(hero.days)}</span>
                  </div>
                  <div className="reasons">
                    {badgeReasons(hero.reasons).map((reason) => (
                      <span key={reason} className="badge badge-accent">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ width: 74, flex: 'none' }}>
                  <Thumb photoId={hero.recipe.photoId} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-primary grow" onClick={() => addToday(hero.recipe.id)}>
                  <IconPlus size={16} /> Готовим сегодня
                </button>
                <button className="btn" onClick={() => setLogging({ recipeId: hero.recipe.id, status: 'planned' })}>
                  В план
                </button>
                <button className="icon-btn" onClick={() => setSeed((value) => value + 1)} aria-label="Другое блюдо">
                  {mode === 'random' ? <IconDice /> : <IconRefresh />}
                </button>
              </div>
            </div>
          ) : totalRecipes === 0 ? (
            <Empty
              title="Пока нечего предложить"
              text="Добавьте первые блюда"
              action={
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <IconPlus size={16} /> Добавить блюдо
                </button>
              }
            />
          ) : (
            <Empty
              title={recent.length > 0 ? 'Всё это готовили недавно' : 'В этом разделе пусто'}
              action={
                recent.length > 0 ? (
                  <button className="btn" onClick={() => setShowRecent(true)}>
                    Показать всё равно
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => setCreating(true)}>
                    <IconPlus size={16} /> Добавить блюдо
                  </button>
                )
              }
            />
          )}
        </section>

        {rest.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Ещё варианты</h2>
              <button className="link" onClick={() => navigate('/recipes')}>
                Все рецепты
              </button>
            </div>
            <div className="card-flat">
              {rest.map((suggestion) => (
                <RecipeRow
                  key={suggestion.recipe.id}
                  recipe={suggestion.recipe}
                  days={suggestion.days}
                  reasons={badgeReasons(suggestion.reasons)}
                  right={
                    <button
                      className="btn btn-sm"
                      aria-label="Добавить на сегодня"
                      onClick={(event) => {
                        event.stopPropagation()
                        addToday(suggestion.recipe.id)
                      }}
                    >
                      <IconPlus size={15} />
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Постоянное — быстрые записи «съели как обычно», после блока решения */}
        {regulars.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>
                <span className="row" style={{ gap: 7 }}>
                  <IconRepeat size={17} /> Постоянное
                </span>
              </h2>
            </div>
            <div className="regulars">
              {regulars.map((item) => (
                <button
                  key={item.recipe.id}
                  className={`regular-card${item.due ? ' due' : ''}`}
                  onClick={() => logRegular(item.recipe.id)}
                >
                  <span className="name">{item.recipe.name}</span>
                  <span className="small muted">{agoWord(item.days)}</span>
                  <span className={`badge${item.due ? ' badge-accent' : ''}`}>
                    {item.due ? 'пора' : intervalWord(item.interval)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Готовили недавно</h2>
              <button className="link" onClick={() => setShowRecent((value) => !value)}>
                {showRecent ? 'Свернуть' : `Показать (${recent.length})`}
              </button>
            </div>
            {showRecent && (
              <div className="card-flat">
                {recent.slice(0, 12).map((suggestion) => (
                  <RecipeRow key={suggestion.recipe.id} recipe={suggestion.recipe} days={suggestion.days} />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="section">
          <button className="btn btn-block" onClick={() => setLogging({ status: 'done' })}>
            <IconPlus size={16} /> Записать {MEAL_SLOTS.find((slot) => slot.id === guessMeal(undefined))?.name.toLowerCase()}
          </button>
          <div className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>
            {formatDate(date, { weekday: true, year: true })}
          </div>
        </section>
      </main>

      {logging && (
        <EntryEditor
          defaults={{ date, meal: guessMeal(undefined), status: logging.status, recipeId: logging.recipeId }}
          onClose={() => setLogging(null)}
        />
      )}
      {/*
        key обязателен: без него React переиспользует форму со старым состоянием,
        и «Изменить» из тоста поверх открытого редактора записывал поля одной
        записи в другую.
      */}
      {editingEntry && db.entries[editingEntry] && !db.entries[editingEntry].deletedAt && (
        <EntryEditor
          key={editingEntry}
          entry={db.entries[editingEntry]}
          onClose={() => setEditingEntry(null)}
        />
      )}
      {creating && <RecipeEditor onClose={() => setCreating(false)} />}
    </>
  )
}
