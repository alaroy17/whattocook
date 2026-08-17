import { useMemo, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import {
  addDays,
  addMonths,
  dateRange,
  endOfMonth,
  formatDate,
  formatMonth,
  fromIsoDate,
  isWeekend,
  startOfMonth,
  startOfWeek,
  today,
  WEEKDAYS_SHORT,
} from '../lib/date'
import { classNames, countOf, formatMoney } from '../lib/util'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons'
import { EntryEditor } from '../components/EntryEditor'
import { Avatar, Empty, SearchInput, Segmented } from '../components/ui'
import { Thumb } from '../components/RecipeRow'
import { categoryColor, MEAL_SLOTS, type Entry, type Recipe } from '../types'

type View = 'month' | 'feed'

export function CalendarPage() {
  const { db } = useStore()
  const [month, setMonth] = useState(() => startOfMonth(today()))
  const [selected, setSelected] = useState(today())
  const [view, setView] = useState<View>('month')
  const [editing, setEditing] = useState<Entry | 'new' | null>(null)
  const [search, setSearch] = useState('')

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of alive(db.entries)) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => MEAL_SLOTS.findIndex((m) => m.id === a.meal) - MEAL_SLOTS.findIndex((m) => m.id === b.meal),
      )
    }
    return map
  }, [db.entries])

  const grid = useMemo(
    () => dateRange(startOfWeek(month), addDays(startOfWeek(endOfMonth(month)), 6)),
    [month],
  )

  const nameOf = (entry: Entry) =>
    (entry.recipeId ? db.recipes[entry.recipeId]?.name : entry.title) ?? 'Без названия'
  const categoryOf = (entry: Entry) =>
    entry.recipeId ? db.recipes[entry.recipeId]?.category : undefined

  const monthEntries = useMemo(
    () => alive(db.entries).filter((entry) => entry.date.startsWith(month.slice(0, 7))),
    [db.entries, month],
  )
  const cooked = monthEntries.filter((entry) => entry.status === 'done')
  const monthCost = cooked.reduce((sum, entry) => sum + (entry.cost ?? 0), 0)

  /** Легенда: только те разделы, которые встретились в этом месяце. */
  const legend = useMemo(() => {
    const set = new Set<string>()
    for (const entry of monthEntries) {
      const category = categoryOf(entry)
      if (category) set.add(category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [monthEntries, db.recipes])

  /**
   * Поиск по истории: имя блюда, заметка, свободное название. В режиме поиска
   * лента не ограничена месяцем — ищем по всему, что когда-либо ели.
   */
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return null
    return alive(db.entries)
      .filter((entry) => {
        const recipe = entry.recipeId ? db.recipes[entry.recipeId] : undefined
        const haystack = [recipe?.name ?? '', entry.title ?? '', entry.note ?? '']
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [search, db.entries, db.recipes])

  const feedDays = useMemo(() => {
    const source = searched ?? monthEntries
    const days = new Set(source.map((entry) => entry.date))
    return [...days].sort((a, b) => b.localeCompare(a))
  }, [monthEntries, searched])

  const dayEntries = byDate.get(selected) ?? []

  /*
   * Свайп по календарю листает месяцы, как в системных календарях, — стрелки
   * остаются для мыши. Горизонтальный жест отличаем от вертикальной прокрутки
   * по преобладанию dx, а клик после свайпа гасим, чтобы не выбрать день случайно.
   */
  const swipeStart = useRef<{ x: number; y: number; id: number } | null>(null)
  const suppressClick = useRef(false)
  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    swipeStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    suppressClick.current = false
  }
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    suppressClick.current = true
    setMonth(addMonths(month, dx < 0 ? 1 : -1))
  }
  const onClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      <TopBar
        title={formatMonth(month)}
        subtitle={`${countOf(cooked.length, 'cooking')}${monthCost > 0 ? ` · ${formatMoney(monthCost, db.settings.currency)}` : ''}`}
        actions={
          <>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Предыдущий месяц">
              <IconChevronLeft />
            </button>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Следующий месяц">
              <IconChevronRight />
            </button>
          </>
        }
        showUser={false}
      />

      <main
        className="content"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
        onClickCapture={onClickCapture}
      >
        <div className="row-between" style={{ marginBottom: 12 }}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { id: 'month', label: 'Месяц' },
              { id: 'feed', label: 'Лента' },
            ]}
          />
          {month !== startOfMonth(today()) && (
            <button className="link" onClick={() => setMonth(startOfMonth(today()))}>
              К сегодня
            </button>
          )}
        </div>

        {view === 'month' ? (
          <>
            <div className="cal">
              {WEEKDAYS_SHORT.map((day) => (
                <div className="cal-head" key={day}>
                  {day}
                </div>
              ))}
              {grid.map((date) => {
                const entries = byDate.get(date) ?? []
                const inMonth = date.slice(0, 7) === month.slice(0, 7)
                return (
                  <button
                    key={date}
                    className={classNames(
                      'cal-day',
                      !inMonth && 'other',
                      date === today() && 'today',
                      date === selected && 'selected',
                      isWeekend(date) && 'weekend',
                    )}
                    onClick={() => setSelected(date)}
                  >
                    <span className="cal-num">
                      {fromIsoDate(date).getDate()}
                      {entries.some((entry) => entry.cook) && (
                        <span className="row" style={{ gap: 2 }}>
                          {[...new Set(entries.map((entry) => entry.cook).filter(Boolean))]
                            .slice(0, 2)
                            .map((cook) => (
                              <span key={cook} className={`cal-cook cook-dot cook-dot-${cook}`} />
                            ))}
                        </span>
                      )}
                    </span>
                    {entries.slice(0, 3).map((entry) => (
                      <span
                        key={entry.id}
                        className={classNames('cal-bar', entry.status === 'planned' && 'planned')}
                        style={{ background: categoryColor(categoryOf(entry)) }}
                        title={nameOf(entry)}
                      />
                    ))}
                    {entries.length > 3 && <span className="cal-more">+{entries.length - 3}</span>}
                  </button>
                )
              })}
            </div>

            <section className="section">
              <div className="section-head">
                <h2>{formatDate(selected, { weekday: true })}</h2>
                <button className="link" onClick={() => setEditing('new')}>
                  Добавить
                </button>
              </div>

              {dayEntries.length === 0 ? (
                <button className="btn btn-block" onClick={() => setEditing('new')}>
                  <IconPlus size={16} /> Записать, что ели
                </button>
              ) : (
                <div>
                  {dayEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      recipe={entry.recipeId ? db.recipes[entry.recipeId] : undefined}
                      title={nameOf(entry)}
                      currency={db.settings.currency}
                      onClick={() => setEditing(entry)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Легенда — справка, ей место после содержимого, а не между сеткой и днём */}
            {legend.length > 0 && (
              <div className="legend">
                {legend.map((category) => (
                  <span className="legend-item" key={category}>
                    <span className="legend-swatch" style={{ background: categoryColor(category) }} />
                    {category}
                  </span>
                ))}
                <span className="legend-item">
                  <span
                    className="legend-swatch"
                    style={{ background: 'transparent', border: '1px dashed var(--border-strong)' }}
                  />
                  в планах
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Что и когда ели" />
            </div>
            {searched && (
              <div className="small muted" style={{ marginBottom: 8 }}>
                {searched.length === 0
                  ? 'Ничего не нашлось за всю историю'
                  : `${countOf(searched.length, 'entry')} за всю историю`}
              </div>
            )}
            {feedDays.length === 0 && !searched ? (
              <Empty title="В этом месяце пусто" text="Записи появятся здесь, как только что-нибудь приготовите" />
            ) : (
              <div>
                {feedDays.map((date) => {
                  const list = searched
                    ? searched.filter((entry) => entry.date === date)
                    : byDate.get(date) ?? []
                  return (
                    <div className="feed-day" key={date}>
                      <div className={classNames('feed-date', date === today() && 'is-today')}>
                        <div className="day">{fromIsoDate(date).getDate()}</div>
                        <div className="wd">{WEEKDAYS_SHORT[(fromIsoDate(date).getDay() + 6) % 7]}</div>
                        {searched && (
                          <div className="wd">{fromIsoDate(date).toLocaleDateString('ru-RU', { month: 'short' })}</div>
                        )}
                      </div>
                      <div className="grow">
                        {list.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            recipe={entry.recipeId ? db.recipes[entry.recipeId] : undefined}
                            title={nameOf(entry)}
                            currency={db.settings.currency}
                            onClick={() => setEditing(entry)}
                            withPhoto
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <EntryEditor
          key={editing === 'new' ? 'new' : editing.id}
          entry={editing === 'new' ? undefined : editing}
          defaults={editing === 'new' ? { date: selected, meal: 'dinner', status: 'done' } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function EntryCard({
  entry,
  recipe,
  title,
  currency,
  onClick,
  withPhoto,
}: {
  entry: Entry
  recipe: Recipe | undefined
  title: string
  currency: string
  onClick: () => void
  withPhoto?: boolean
}) {
  return (
    <div className={classNames('feed-card', entry.status === 'planned' && 'planned')} onClick={onClick}>
      <span className="feed-stripe" style={{ background: categoryColor(recipe?.category) }} />
      {withPhoto && recipe?.photoId && <Thumb photoId={recipe.photoId} />}
      <div className="grow">
        <div className="recipe-title ellipsis">{title}</div>
        <div className="meta">
          <span>{MEAL_SLOTS.find((m) => m.id === entry.meal)?.name}</span>
          {entry.status === 'planned' && <span>в планах</span>}
          {entry.cost != null && <span>{formatMoney(entry.cost, currency)}</span>}
        </div>
        {entry.note && <div className="small muted">{entry.note}</div>}
      </div>
      {entry.cook && <Avatar id={entry.cook} />}
    </div>
  )
}
