import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { addDays, formatMonth, today } from '../lib/date'
import { buildHistory, scoreRecipes } from '../lib/suggest'
import { Empty, Segmented } from '../components/ui'
import { RecipeRow } from '../components/RecipeRow'
import { formatMoney, normalizeName, timesWord } from '../lib/util'
import { USERS, userName } from '../types'
import { buildProductIndex, ingredientCost, servingsMultiplier } from '../lib/cost'

type Period = '30' | '90' | '365' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: '30', label: 'Месяц' },
  { id: '90', label: '3 месяца' },
  { id: '365', label: 'Год' },
  { id: 'all', label: 'Всё время' },
]

function Bars({ rows, unit }: { rows: { label: string; value: number; hint?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (rows.length === 0) return <div className="small muted">Пока нет данных</div>
  return (
    <div>
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span className="ellipsis">{row.label}</span>
          <span className="small muted">
            {row.hint ?? `${Math.round(row.value * 10) / 10}${unit ? ` ${unit}` : ''}`}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function Stats() {
  const { db } = useStore()
  const [period, setPeriod] = useState<Period>('90')

  const from = period === 'all' ? '0000-01-01' : addDays(today(), -Number(period))

  const entries = useMemo(
    () => alive(db.entries).filter((entry) => entry.status === 'done' && entry.date >= from),
    [db.entries, from],
  )

  const topDishes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      const name = entry.recipeId ? db.recipes[entry.recipeId]?.name : entry.title
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, hint: timesWord(value) }))
  }, [entries, db.recipes])

  const byCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      const category = entry.recipeId ? db.recipes[entry.recipeId]?.category : 'Без рецепта'
      if (!category) continue
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, hint: timesWord(value) }))
  }, [entries, db.recipes])

  const byCook = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.cook) continue
      counts.set(entry.cook, (counts.get(entry.cook) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: userName(label), value, hint: timesWord(value) }))
  }, [entries])

  const byMonth = useMemo(() => {
    const sums = new Map<string, number>()
    for (const entry of entries) {
      if (entry.cost == null) continue
      const key = entry.date.slice(0, 7)
      sums.set(key, (sums.get(key) ?? 0) + entry.cost)
    }
    return [...sums.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, value]) => ({
        label: formatMonth(`${key}-01`),
        value,
        hint: formatMoney(value, db.settings.currency),
      }))
  }, [entries, db.settings.currency])

  /**
   * Продукты за период: как часто попадали на стол и во сколько примерно обошлись.
   * Стоимость — расчётная, из цен каталога и количеств в рецептах с учётом порций.
   */
  const topProducts = useMemo(() => {
    const index = buildProductIndex(alive(db.products))
    const usage = new Map<string, { name: string; times: number; spend: number }>()
    for (const entry of entries) {
      const recipe = entry.recipeId ? db.recipes[entry.recipeId] : undefined
      if (!recipe) continue
      const multiplier = servingsMultiplier(recipe, entry.servings)
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.name.trim()) continue
        const key = normalizeName(ingredient.name)
        const item = usage.get(key) ?? { name: ingredient.name.trim(), times: 0, spend: 0 }
        item.times++
        const cost = ingredientCost(ingredient, index)
        if (cost != null) item.spend += cost * multiplier
        usage.set(key, item)
      }
    }
    return [...usage.values()].sort((a, b) => b.times - a.times).slice(0, 10)
  }, [entries, db.recipes, db.products])

  const totalSpendEstimate = useMemo(
    () => topProducts.reduce((sum, item) => sum + item.spend, 0),
    [topProducts],
  )

  const forgotten = useMemo(() => {
    const history = buildHistory(db)
    return scoreRecipes(db)
      .filter((item) => item.days == null || item.days >= 45)
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
      .slice(0, 8)
      .map((item) => ({ ...item, times: history.timesCooked.get(item.recipe.id) ?? 0 }))
  }, [db])

  const totalCost = entries.reduce((sum, entry) => sum + (entry.cost ?? 0), 0)
  const uniqueDishes = new Set(entries.map((entry) => entry.recipeId ?? entry.title)).size
  const ratedUsers = USERS.map((user) => {
    const values = alive(db.recipes)
      .map((recipe) => recipe.ratings?.[user.id])
      .filter((value): value is number => typeof value === 'number')
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    return { user, average, count: values.length }
  })

  return (
    <>
      <TopBar title="Статистика" back showUser={false} />
      <main className="content">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />

        {entries.length === 0 ? (
          <Empty title="Пока нечего показать" text="Отметьте несколько приготовленных блюд" />
        ) : (
          <>
            <div className="stat-grid" style={{ marginTop: 14 }}>
              <div className="card">
                <div className="stat-value">{entries.length}</div>
                <div className="small muted">приготовлений</div>
              </div>
              <div className="card">
                <div className="stat-value">{uniqueDishes}</div>
                <div className="small muted">разных блюд</div>
              </div>
              {totalCost > 0 && (
                <div className="card">
                  <div className="stat-value">{formatMoney(totalCost, db.settings.currency)}</div>
                  <div className="small muted">потрачено (где указана цена)</div>
                </div>
              )}
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Чаще всего готовили</h2>
              </div>
              <div className="card">
                <Bars rows={topDishes} />
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>По категориям</h2>
              </div>
              <div className="card">
                <Bars rows={byCategory} />
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Кто готовил</h2>
              </div>
              <div className="card">
                <Bars rows={byCook} />
                <div className="divider" />
                {ratedUsers.map(({ user, average, count }) => (
                  <div className="row-between small" key={user.id}>
                    <span className="muted">Средняя оценка · {user.name}</span>
                    <span>
                      {average == null ? '—' : average.toFixed(1)}
                      <span className="muted"> ({count})</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {byMonth.length > 0 && (
              <section className="section">
                <div className="section-head">
                  <h2>Траты по месяцам</h2>
                </div>
                <div className="card">
                  <Bars rows={byMonth} />
                </div>
              </section>
            )}

            {topProducts.length > 0 && (
              <section className="section">
                <div className="section-head">
                  <h2>Продукты</h2>
                  {totalSpendEstimate > 0 && (
                    <span className="small muted">
                      ~{formatMoney(totalSpendEstimate, db.settings.currency)} по каталогу
                    </span>
                  )}
                </div>
                <div className="card">
                  <Bars
                    rows={topProducts.map((item) => ({
                      label: item.name,
                      value: item.times,
                      hint:
                        item.spend > 0
                          ? `${timesWord(item.times)} · ${formatMoney(item.spend, db.settings.currency)}`
                          : timesWord(item.times),
                    }))}
                  />
                  <div className="small muted" style={{ marginTop: 8 }}>
                    Как часто продукт попадал на стол и во сколько примерно обошёлся по ценам каталога
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <section className="section">
          <div className="section-head">
            <h2>Давно не готовили</h2>
          </div>
          <div className="card-flat">
            {forgotten.length === 0 ? (
              <div className="empty small">Всё свежее — за последние полтора месяца готовили каждое блюдо</div>
            ) : (
              forgotten.map((item) => (
                <RecipeRow key={item.recipe.id} recipe={item.recipe} days={item.days} />
              ))
            )}
          </div>
        </section>
      </main>
    </>
  )
}
