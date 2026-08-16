import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { formatDate, formatRelativeDay, today } from '../lib/date'
import { pickRandom, regularRecipes, scoreRecipes, type SuggestFilters, type Suggestion } from '../lib/suggest'
import { RecipeRow, Thumb } from '../components/RecipeRow'
import { Avatar, Chips, Empty, Segmented, toast } from '../components/ui'
import { EntryEditor } from '../components/EntryEditor'
import { RecipeEditor } from '../components/RecipeEditor'
import { IconCheck, IconDice, IconFridge, IconPlus, IconRefresh, IconRepeat } from '../components/Icons'
import { MEAL_SLOTS, type MealSlot } from '../types'
import { daysWord } from '../lib/util'
import { categoriesWithRecipes } from '../lib/categories'
import { fridgeNeedsReview, fridgeStaleDays } from '../lib/fridge'

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

  const nameOf = (entryRecipeId: string | undefined, title: string | undefined) =>
    (entryRecipeId ? db.recipes[entryRecipeId]?.name : title) ?? 'Без названия'

  const markCooked = (recipeId: string, meal: MealSlot = 'dinner') => {
    saveEntry({ date, meal, status: 'done', recipeId })
    toast('Записали в историю')
  }

  // «Не готовили N дней» и так написано рядом с датой — в бейджах это лишний повтор.
  const badgeReasons = (reasons: string[]) => reasons.filter((reason) => !reason.startsWith('не готовили'))

  return (
    <>
      <TopBar title={formatRelativeDay(date)} />
      <main className="content">
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
            <div className="card-flat">
              {todayEntries.map((entry) => (
                <div key={entry.id} className="recipe-row" onClick={() => setEditingEntry(entry.id)}>
                  <Thumb photoId={entry.recipeId ? db.recipes[entry.recipeId]?.photoId : undefined} />
                  <div className="grow">
                    <div className="recipe-title ellipsis">{nameOf(entry.recipeId, entry.title)}</div>
                    <div className="meta">
                      <span>{MEAL_SLOTS.find((m) => m.id === entry.meal)?.name}</span>
                      <span>{entry.status === 'done' ? 'приготовили' : 'в планах'}</span>
                    </div>
                  </div>
                  {entry.cook && <Avatar id={entry.cook} />}
                  {entry.status === 'planned' && (
                    <button
                      className="btn btn-sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        saveEntry({ id: entry.id, status: 'done' })
                        toast('Отметили как приготовленное')
                      }}
                    >
                      <IconCheck size={15} /> Готово
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {regulars.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>
                <span className="row" style={{ gap: 7 }}>
                  <IconRepeat size={17} /> Постоянное
                </span>
              </h2>
              <span className="small muted">нажмите, чтобы записать</span>
            </div>
            <div className="regulars">
              {regulars.map((item) => (
                <button
                  key={item.recipe.id}
                  className={`regular-card${item.due ? ' due' : ''}`}
                  onClick={() => markCooked(item.recipe.id)}
                >
                  <span className="name">{item.recipe.name}</span>
                  <span className="small muted">
                    {item.days == null
                      ? 'ещё не готовили'
                      : item.days === 0
                        ? 'сегодня'
                        : `${daysWord(item.days)} назад`}
                  </span>
                  <span className={`badge${item.due ? ' badge-accent' : ''}`}>
                    {item.due ? 'пора' : `раз в ${daysWord(item.interval)}`}
                  </span>
                </button>
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
                    <span>
                      {hero.days == null ? 'ни разу не готовили' : `последний раз ${daysWord(hero.days)} назад`}
                    </span>
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
                <button className="btn btn-primary grow" onClick={() => markCooked(hero.recipe.id)}>
                  <IconCheck size={16} /> Готовим это
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
              text="Добавьте несколько блюд — и приложение начнёт подсказывать, что вы давно не готовили"
              action={
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <IconPlus size={16} /> Добавить блюдо
                </button>
              }
            />
          ) : (
            <Empty
              title={recent.length > 0 ? 'Всё это готовили недавно' : 'В этом разделе пока пусто'}
              text={
                recent.length > 0
                  ? `Блюда из этого раздела попадали на стол в последние ${daysWord(db.settings.cooldownDays)}. Можно посмотреть их ниже или выбрать другой раздел.`
                  : 'Добавьте сюда блюдо или выберите другой раздел'
              }
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
                      aria-label="Записать в историю"
                      onClick={(event) => {
                        event.stopPropagation()
                        markCooked(suggestion.recipe.id)
                      }}
                    >
                      <IconCheck size={15} />
                    </button>
                  }
                />
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
            <IconPlus size={16} /> Записать, что ели сегодня
          </button>
          <div className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>
            {formatDate(date, { weekday: true, year: true })}
          </div>
        </section>
      </main>

      {logging && (
        <EntryEditor
          defaults={{ date, meal: 'dinner', status: logging.status, recipeId: logging.recipeId }}
          onClose={() => setLogging(null)}
        />
      )}
      {editingEntry && db.entries[editingEntry] && (
        <EntryEditor entry={db.entries[editingEntry]} onClose={() => setEditingEntry(null)} />
      )}
      {creating && <RecipeEditor onClose={() => setCreating(false)} />}
    </>
  )
}
