import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { addDays, dateRange, formatDate, formatDateShort, fromIsoDate, isWeekend, startOfWeek, today, WEEKDAYS_SHORT } from '../lib/date'
import { categoryColor, MEAL_SLOTS, type Entry, type MealSlot, type Recipe } from '../types'
import { Avatar, Chips, Empty, Segmented, toast } from '../components/ui'
import { RecipePicker } from '../components/RecipePicker'
import { EntryEditor } from '../components/EntryEditor'
import {
  buildShoppingList,
  groupShoppingList,
  loadChecked,
  saveChecked,
  shoppingListToText,
} from '../lib/shopping'
import { buildProductIndex, servingsMultiplier } from '../lib/cost'
import { classNames, formatAmount, formatMoney } from '../lib/util'
import { IconCart, IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons'

type Tab = 'week' | 'shopping'

export function Plan() {
  const { db, saveEntry } = useStore()
  const [tab, setTab] = useState<Tab>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()))
  const [picking, setPicking] = useState<string | null>(null)
  const [pickMeal, setPickMeal] = useState<MealSlot>('dinner')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [checked, setChecked] = useState<Set<string>>(() => loadChecked(startOfWeek(today())))
  const [hideInStock, setHideInStock] = useState(true)

  const days = useMemo(() => dateRange(weekStart, addDays(weekStart, 6)), [weekStart])

  const entriesByDate = useMemo(() => {
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

  const nameOf = (entry: Entry) =>
    (entry.recipeId ? db.recipes[entry.recipeId]?.name : entry.title) ?? 'Без названия'

  const index = useMemo(() => buildProductIndex(alive(db.products)), [db.products])

  /** Список покупок собираем из запланированного на выбранную неделю. */
  const plannedRecipes = useMemo(() => {
    const result: { recipe: Recipe; multiplier: number }[] = []
    for (const date of days) {
      for (const entry of entriesByDate.get(date) ?? []) {
        if (entry.status !== 'planned' || !entry.recipeId) continue
        const recipe = db.recipes[entry.recipeId]
        // Если для этого раза указали своё число порций — количества масштабируются.
        if (recipe && !recipe.deletedAt) {
          result.push({ recipe, multiplier: servingsMultiplier(recipe, entry.servings) })
        }
      }
    }
    return result
  }, [days, entriesByDate, db.recipes])

  const shopping = useMemo(() => buildShoppingList(plannedRecipes, index), [plannedRecipes, index])
  const visible = hideInStock ? shopping.filter((item) => !item.inStock) : shopping
  const groups = groupShoppingList(visible)
  const totalCost = visible
    .filter((item) => !checked.has(item.key))
    .reduce((sum, item) => sum + (item.cost ?? 0), 0)

  const plannedCount = days.reduce(
    (sum, date) => sum + (entriesByDate.get(date) ?? []).filter((entry) => entry.status === 'planned').length,
    0,
  )

  // При переходе на другую неделю показываем её собственные отметки.
  useEffect(() => {
    setChecked(loadChecked(weekStart))
  }, [weekStart])

  const toggle = (key: string) => {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(weekStart, next)
      return next
    })
  }

  const openPicker = (date: string) => {
    const taken = (entriesByDate.get(date) ?? []).map((entry) => entry.meal)
    setPickMeal(taken.includes('dinner') && !taken.includes('lunch') ? 'lunch' : 'dinner')
    setPicking(date)
  }

  const weekLabel = `${formatDateShort(weekStart)} — ${formatDateShort(addDays(weekStart, 6))}`

  return (
    <>
      <TopBar
        title="Неделя"
        subtitle={weekLabel}
        showUser={false}
        actions={
          <>
            <button
              className="icon-btn"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Прошлая неделя"
            >
              <IconChevronLeft />
            </button>
            <button
              className="icon-btn"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Следующая неделя"
            >
              <IconChevronRight />
            </button>
          </>
        }
      />

      <main className="content">
        <div className="row-between">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'week', label: `План${plannedCount ? ` · ${plannedCount}` : ''}` },
              { id: 'shopping', label: `Покупки${visible.length ? ` · ${visible.length}` : ''}` },
            ]}
          />
          {weekStart !== startOfWeek(today()) && (
            <button className="link" onClick={() => setWeekStart(startOfWeek(today()))}>
              К текущей
            </button>
          )}
        </div>

        {tab === 'week' && (
          <div className="card" style={{ marginTop: 12, padding: '4px 14px' }}>
            {days.map((date) => {
              const entries = entriesByDate.get(date) ?? []
              return (
                <div
                  key={date}
                  className={classNames(
                    'week-day',
                    date === today() && 'is-today',
                    isWeekend(date) && 'is-weekend',
                  )}
                >
                  <div className="week-date">
                    <span className="wd">{WEEKDAYS_SHORT[(fromIsoDate(date).getDay() + 6) % 7]}</span>
                    <span className="dnum">{fromIsoDate(date).getDate()}</span>
                  </div>
                  <div className="week-items">
                    {entries.map((entry) => (
                      <span
                        key={entry.id}
                        className={classNames('week-chip', entry.status === 'done' && 'done')}
                      >
                        <span
                          className="dot"
                          style={{
                            background: categoryColor(
                              entry.recipeId ? db.recipes[entry.recipeId]?.category : undefined,
                            ),
                          }}
                        />
                        <button
                          className="label"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}
                          onClick={() => setEditing(entry)}
                        >
                          {nameOf(entry)}
                        </button>
                        <span className="slot">{MEAL_SLOTS.find((m) => m.id === entry.meal)?.name}</span>
                        {entry.cook && <Avatar id={entry.cook} />}
                        {entry.status === 'planned' && (
                          <button
                            className="week-check"
                            aria-label="Отметить приготовленным"
                            onClick={() => {
                              saveEntry({ id: entry.id, status: 'done' })
                              toast('Отметили как приготовленное')
                            }}
                          >
                            <IconCheck size={16} />
                          </button>
                        )}
                      </span>
                    ))}
                    <button
                      className={classNames('week-add', entries.length === 0 && 'wide')}
                      aria-label="Добавить блюдо"
                      onClick={() => openPicker(date)}
                    >
                      <IconPlus size={15} />
                      {entries.length === 0 && 'блюдо'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'shopping' && (
          <div style={{ marginTop: 12 }}>
            <Chips
              value={hideInStock ? 'need' : 'all'}
              onChange={(value) => setHideInStock(value === 'need')}
              options={[
                { id: 'need', label: 'Только купить' },
                { id: 'all', label: 'Все продукты' },
              ]}
            />

            {groups.length === 0 ? (
              <Empty
                title="Список пуст"
                text="Запланируйте блюда на неделю — продукты соберутся автоматически"
                action={
                  <button className="btn btn-primary" onClick={() => setTab('week')}>
                    <IconPlus size={16} /> К планированию
                  </button>
                }
              />
            ) : (
              <>
                {groups.map(({ group, items }) => (
                  <div key={group}>
                    <div className="group-title">{group}</div>
                    <div className="card-flat">
                      {items.map((item) => (
                        <div
                          key={item.key}
                          className={classNames('shop-item', checked.has(item.key) && 'checked')}
                          onClick={() => toggle(item.key)}
                        >
                          <input type="checkbox" readOnly checked={checked.has(item.key)} />
                          <span className="grow shop-name">
                            {item.name}
                            <div className="small muted ellipsis">{item.usedIn.join(', ')}</div>
                          </span>
                          <span className="small muted">{formatAmount(item.qty, item.unit)}</span>
                          {item.cost != null && (
                            <span className="small muted" style={{ width: 56, textAlign: 'right' }}>
                              {formatMoney(item.cost, db.settings.currency)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="card" style={{ marginTop: 14 }}>
                  <div className="row-between">
                    <span className="row" style={{ gap: 7 }}>
                      <IconCart size={18} /> Осталось купить
                    </span>
                    <strong>{formatMoney(totalCost, db.settings.currency)}</strong>
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Цены берутся из каталога продуктов — то, чего там нет, в сумму не попадает
                  </div>
                </div>

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn grow"
                    onClick={() => {
                      void navigator.clipboard.writeText(shoppingListToText(groups)).then(
                        () => toast('Список скопирован'),
                        () => toast('Не удалось скопировать'),
                      )
                    }}
                  >
                    Скопировать список
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setChecked(new Set())
                      saveChecked(weekStart, new Set())
                    }}
                  >
                    Сбросить
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {picking && (
        <RecipePicker
          title={formatDate(picking, { weekday: true })}
          header={
            <div style={{ marginBottom: 12 }}>
              <Segmented
                value={pickMeal}
                onChange={setPickMeal}
                options={MEAL_SLOTS.map((slot) => ({ id: slot.id, label: slot.name }))}
              />
            </div>
          }
          onClose={() => setPicking(null)}
          onPick={(recipe) => {
            saveEntry({ date: picking, meal: pickMeal, status: 'planned', recipeId: recipe.id })
          }}
          onFreeText={(text) => {
            saveEntry({ date: picking, meal: pickMeal, status: 'planned', title: text })
          }}
        />
      )}

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
