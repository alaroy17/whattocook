import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { PRODUCT_GROUPS, type Database, type Product } from '../types'
import { Empty, Field, Sheet } from '../components/ui'
import { IconPlus, IconTag } from '../components/Icons'
import { agoWord, countOf, normalizeName, nowIso } from '../lib/util'
import { fridgeStaleDays } from '../lib/fridge'

export function Fridge() {
  const { db, saveProduct } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  const products = useMemo(() => alive(db.products), [db.products])
  const atHome = useMemo(
    () =>
      products
        .filter((product) => product.inStock)
        .sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.name.localeCompare(b.name, 'ru')),
    [products],
  )

  /**
   * Всё, чего нет дома, — целиком и по алфавиту. Прежняя выборка «самого
   * популярного» из двух десятков строк заставляла искать нужное поиском,
   * хотя по списку удобнее просто пройтись сверху вниз и отметить.
   */
  const rest = useMemo(
    () =>
      products
        .filter((product) => !product.inStock)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [products],
  )

  const search = normalizeName(query)
  const found = search
    ? products.filter((product) => normalizeName(product.name).includes(search))
    : []
  const exactExists = search ? products.some((product) => normalizeName(product.name) === search) : true

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const product of atHome) {
      const list = map.get(product.group) ?? []
      list.push(product)
      map.set(product.group, list)
    }
    return [...map.entries()]
  }, [atHome])

  const stale = fridgeStaleDays(db)

  /*
   * Любая отметка означает, что список сейчас актуален, — отдельная кнопка
   * «Всё проверено» только вызывала вопрос, что она вообще делает. Дату
   * проверки писать в настройки не нужно: свежесть и так считается по
   * stockUpdatedAt продуктов, а настройки сливаются целиком по времени —
   * одна галочка откатывала бы тему или разделы, изменённые вторым телефоном.
   */
  const setStock = (product: Product, inStock: boolean) => {
    saveProduct({ id: product.id, inStock, stockUpdatedAt: nowIso() })
  }

  return (
    <>
      <TopBar
        title="Дома"
        showUser={false}
        subtitle={
          atHome.length === 0
            ? 'список пуст'
            : `${countOf(atHome.length, 'product')}${stale != null ? ` · обновляли ${agoWord(stale)}` : ''}`
        }
      />

      <main className="content">
        <div className="search">
          <input
            className="input"
            style={{ paddingLeft: 12 }}
            value={query}
            placeholder="Добавить или найти продукт"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !query.trim()) return
              const existing = products.find((product) => normalizeName(product.name) === normalizeName(query))
              if (existing) {
                setStock(existing, true)
                setQuery('')
              } else {
                setAdding(query.trim())
              }
            }}
          />
        </div>

        {search && (
          <div className="card-flat" style={{ marginTop: 10 }}>
            {found.slice(0, 8).map((product) => (
              <div
                className="shop-item"
                key={product.id}
                onClick={() => {
                  setStock(product, !product.inStock)
                  setQuery('')
                }}
              >
                <input type="checkbox" readOnly checked={Boolean(product.inStock)} />
                <span className="grow shop-name">
                  {product.name}
                  <div className="small muted">{product.group}</div>
                </span>
              </div>
            ))}
            {!exactExists && (
              <button className="shop-item grow" style={{ width: '100%' }} onClick={() => setAdding(query.trim())}>
                <IconPlus size={17} />
                <span className="grow shop-name" style={{ textAlign: 'left' }}>
                  Добавить «{query.trim()}» в каталог
                </span>
              </button>
            )}
          </div>
        )}

        {atHome.length === 0 ? (
          <Empty title="Пока пусто" text="Отметьте продукты, которые есть дома" />
        ) : (
          grouped.map(([group, items]) => (
            <div key={group}>
              <div className="group-title">{group}</div>
              <div className="card-flat">
                {items.map((product) => (
                  <div className="shop-item" key={product.id} onClick={() => setStock(product, false)}>
                    <input type="checkbox" readOnly checked />
                    <span className="grow shop-name">{product.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {rest.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Чего нет</h2>
              <span className="small muted">{countOf(rest.length, 'product')}</span>
            </div>
            <div className="card-flat">
              {rest.map((product) => (
                <div className="shop-item" key={product.id} onClick={() => setStock(product, true)}>
                  <input type="checkbox" readOnly checked={false} />
                  <span className="grow shop-name">
                    {product.name}
                    <div className="small muted">{product.group}</div>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <button className="btn btn-block" onClick={() => navigate('/more/products')}>
            <IconTag size={16} /> Каталог продуктов и цены
          </button>
        </section>
      </main>

      {adding !== null && (
        <QuickProduct
          name={adding}
          onClose={() => {
            setAdding(null)
            setQuery('')
          }}
        />
      )}
    </>
  )
}

/** В какой единице этот продукт встречается в рецептах — чтобы цена потом сошлась. */
function unitFromRecipes(db: Database, name: string): string | undefined {
  const key = normalizeName(name)
  for (const recipe of alive(db.recipes)) {
    for (const ingredient of recipe.ingredients) {
      if (normalizeName(ingredient.name) === key && ingredient.unit) return ingredient.unit
    }
  }
  return undefined
}

/** Быстрое добавление продукта прямо из холодильника — без цены, её можно вписать позже. */
function QuickProduct({ name, onClose }: { name: string; onClose: () => void }) {
  const { db, saveProduct } = useStore()
  const [value, setValue] = useState(name)
  const [group, setGroup] = useState<string>('Прочее')

  return (
    <Sheet title="Новый продукт" onClose={onClose}>
      <div className="stack">
        <Field label="Название">
          <input className="input" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        </Field>
        <Field label="Отдел в магазине">
          <select className="input" value={group} onChange={(event) => setGroup(event.target.value)}>
            {PRODUCT_GROUPS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <div className="row">
          <button className="btn grow" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-primary grow"
            disabled={!value.trim()}
            onClick={() => {
              /*
               * Имя могли поправить прямо в форме — проверяем ещё раз, иначе
               * появлялся второй «Молоко», а схлопывать дубли некому:
               * без подключённого Диска синхронизация не запускается.
               */
              const existing = alive(db.products).find(
                (product) => normalizeName(product.name) === normalizeName(value),
              )
              if (existing) {
                saveProduct({ id: existing.id, inStock: true, stockUpdatedAt: nowIso() })
                onClose()
                return
              }
              saveProduct({
                name: value.trim(),
                group,
                // Единицу берём из рецептов: «шт» для муки навсегда рвала связь с ценой.
                unit: unitFromRecipes(db, value) ?? 'шт',
                price: null,
                inStock: true,
                stockUpdatedAt: nowIso(),
              })
              onClose()
            }}
          >
            Добавить
          </button>
        </div>
      </div>
    </Sheet>
  )
}
