import { useMemo, useState } from 'react'
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
import { classNames, formatMoney } from '../lib/util'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons'
import { EntryEditor } from '../components/EntryEditor'
import { Avatar, Empty, Segmented } from '../components/ui'
import { Thumb } from '../components/RecipeRow'
import { categoryColor, MEAL_SLOTS, type Entry, type Recipe } from '../types'

type View = 'month' | 'feed'

export function CalendarPage() {
  const { db } = useStore()
  const [month, setMonth] = useState(() => startOfMonth(today()))
  const [selected, setSelected] = useState(today())
  const [view, setView] = useState<View>('month')
  const [editing, setEditing] = useState<Entry | 'new' | null>(null)

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

  const feedDays = useMemo(() => {
    const days = new Set(monthEntries.map((entry) => entry.date))
    return [...days].sort((a, b) => b.localeCompare(a))
  }, [monthEntries])

  const dayEntries = byDate.get(selected) ?? []

  return (
    <>
      <TopBar
        title={formatMonth(month)}
        subtitle={`${cooked.length} приготовлений${monthCost > 0 ? ` · ${formatMoney(monthCost, db.settings.currency)}` : ''}`}
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

      <main className="content">
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
          </>
        ) : feedDays.length === 0 ? (
          <Empty title="В этом месяце пусто" text="Записи появятся здесь, как только что-нибудь приготовите" />
        ) : (
          <div>
            {feedDays.map((date) => (
              <div className="feed-day" key={date}>
                <div className={classNames('feed-date', date === today() && 'is-today')}>
                  <div className="day">{fromIsoDate(date).getDate()}</div>
                  <div className="wd">{WEEKDAYS_SHORT[(fromIsoDate(date).getDay() + 6) % 7]}</div>
                </div>
                <div className="grow">
                  {(byDate.get(date) ?? []).map((entry) => (
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
            ))}
          </div>
        )}
      </main>

      {editing && (
        <EntryEditor
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
