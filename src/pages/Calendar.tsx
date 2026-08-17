import { useMemo, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import {
  addDays,
  addMonths,
  dateRange,
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
import { guessMeal } from '../lib/suggest'
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

  /**
   * Сетки трёх месяцев подряд: предыдущего, текущего и следующего. Лента едет
   * за пальцем целиком, поэтому из-за края выезжает настоящий соседний месяц,
   * а не пустота.
   */
  const pages = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const start = addMonths(month, offset)
        const from = startOfWeek(start)
        /*
         * Всегда шесть недель: у месяцев бывает 5 рядов, и лента (её высота —
         * по самой длинной странице) оставляла под короткой пустую полосу.
         */
        return { month: start, grid: dateRange(from, addDays(from, 41)) }
      }),
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
  // «Доедаем» — не отдельная готовка: иначе шапка календаря спорила со статистикой.
  const cooked = monthEntries.filter((entry) => entry.status === 'done' && !entry.leftovers)
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
  const swipeStart = useRef<{ x: number; y: number; id: number; width: number } | null>(null)
  const suppressClick = useRef(false)
  const viewport = useRef<HTMLDivElement | null>(null)
  const track = useRef<HTMLDivElement | null>(null)
  /** Сдвиг ленты. Во время жеста пишется прямо в стиль, в state — только для анимации. */
  const dragRef = useRef(0)
  const [drag, setDrag] = useState(0)
  const [anim, setAnim] = useState(false)

  const offset = (value: number) => `translate3d(calc(-33.3333% + ${value}px), 0, 0)`

  /**
   * Во время жеста сдвиг пишется в стиль напрямую: state здесь перерисовывал бы
   * три сетки по 42 ячейки на каждое движение пальца, и свайп рвался бы.
   */
  const dragTo = (value: number) => {
    dragRef.current = value
    if (track.current) track.current.style.transform = offset(value)
  }

  const width = () => viewport.current?.getBoundingClientRect().width ?? 320

  /**
   * Месяц меняем сразу, а ленту тем же кадром сдвигаем на страницу назад —
   * картинка не дёргается, потому что соседний месяц уже стал центральным.
   * Следующим кадром включаем анимацию и едем в центр. Так листание не зависит
   * от таймеров: подряд нажатые стрелки не теряются, а свёрнутое приложение
   * не оставляет ленту застрявшей на полпути.
   */
  const goMonth = (step: number) => {
    const shift = step * width()
    setAnim(false)
    setMonth(addMonths(month, step))
    dragRef.current += shift
    setDrag(dragRef.current)
    /*
     * Едем в центр следующим кадром. Запасной таймер обязателен: в скрытой
     * вкладке кадры не выдаются вовсе, и лента осталась бы сдвинутой.
     */
    let done = false
    const toCenter = () => {
      if (done) return
      done = true
      setAnim(true)
      dragRef.current = 0
      setDrag(0)
    }
    requestAnimationFrame(() => requestAnimationFrame(toCenter))
    setTimeout(toCenter, 80)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    swipeStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId, width: width() }
    suppressClick.current = false
    setAnim(false)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const start = swipeStart.current
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    // Пока жест не стал явно горизонтальным, ленту не двигаем — это прокрутка.
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    /*
     * Захват указателя: без него мышь, отпущенная над нижней панелью или
     * за краем окна, не доносит pointerup — и лента оставалась сдвинутой.
     * Ошибку захвата глотаем: сам жест из-за неё ломаться не должен.
     */
    try {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    } catch {
      // указатель уже отпущен — работаем без захвата
    }
    // Дальше соседней страницы тянуть некуда — там пустота.
    dragTo(Math.max(-start.width, Math.min(start.width, dx)))
  }
  /** Жест не дотянул — лента мягко возвращается на место. */
  const settle = () => {
    setAnim(true)
    dragRef.current = 0
    setDrag(0)
  }
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeStart.current
    // Чужой палец (второе касание) не должен обнулять начатый жест.
    if (!start || event.pointerId !== start.id) return
    swipeStart.current = null
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) {
      settle()
      return
    }
    suppressClick.current = true
    /*
     * На телефоне click после свайпа не приходит вовсе, и взведённый флаг
     * съедал бы следующее нажатие с клавиатуры или скринридера. Настоящий
     * click, если он есть, успевает раньше нулевого таймера.
     */
    setTimeout(() => {
      suppressClick.current = false
    }, 0)
    goMonth(dx < 0 ? 1 : -1)
  }
  const onPointerCancel = (event: React.PointerEvent) => {
    const start = swipeStart.current
    if (!start || event.pointerId !== start.id) return
    swipeStart.current = null
    settle()
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
            <button className="icon-btn" onClick={() => goMonth(-1)} aria-label="Предыдущий месяц">
              <IconChevronLeft />
            </button>
            <button className="icon-btn" onClick={() => goMonth(1)} aria-label="Следующий месяц">
              <IconChevronRight />
            </button>
          </>
        }
        showUser={false}
      />

      {/* Жест живёт только на сетке: на всём <main> он листал месяц и в «Ленте» */}
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
            {/*
              Лента шириной в три экрана: слева предыдущий месяц, в центре текущий,
              справа следующий. Палец двигает ленту целиком, поэтому из-за края
              выезжает настоящий соседний месяц.
            */}
            <div
              className="cal-viewport"
              ref={viewport}
              style={{ touchAction: 'pan-y pinch-zoom' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onClickCapture={onClickCapture}
              /*
               * Фокус на скрытой странице заставлял браузер прокрутить окно
               * к ней, и календарь навсегда оставался сдвинутым на месяц.
               */
              onScroll={(event) => (event.currentTarget.scrollLeft = 0)}
            >
              <div
                ref={track}
                className={classNames('cal-track', anim && 'anim')}
                style={{ transform: offset(drag) }}
              >
                {pages.map((page, index) => (
                  <div
                    className="cal"
                    key={page.month}
                    /* Соседние месяцы — только картинка: ни фокуса, ни озвучки */
                    inert={index !== 1}
                    aria-hidden={index !== 1}
                  >
                    {WEEKDAYS_SHORT.map((day) => (
                      <div className="cal-head" key={day}>
                        {day}
                      </div>
                    ))}
                    {page.grid.map((date) => {
                      const entries = byDate.get(date) ?? []
                      const inMonth = date.slice(0, 7) === page.month.slice(0, 7)
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
                ))}
              </div>
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
          defaults={editing === 'new' ? { date: selected, meal: guessMeal(undefined), status: 'done' } : undefined}
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
