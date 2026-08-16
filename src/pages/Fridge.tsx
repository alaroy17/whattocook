import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { PRODUCT_GROUPS, type Product } from '../types'
import { Empty, Field, Sheet, toast } from '../components/ui'
import { IconCheck, IconPlus, IconTag, IconTrash } from '../components/Icons'
import { classNames, daysWord, normalizeName, nowIso } from '../lib/util'
import { fridgeStaleDays } from '../lib/fridge'

export function Fridge() {
  const { db, saveProduct, updateSettings } = useStore()
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

  /** Продукты, которые чаще всего встречаются в рецептах — их удобно отмечать в один тап. */
  const common = useMemo(() => {
    const uses = new Map<string, number>()
    for (const recipe of alive(db.recipes)) {
      for (const ingredient of recipe.ingredients) {
        const key = normalizeName(ingredient.name)
        uses.set(key, (uses.get(key) ?? 0) + 1)
      }
    }
    return products
      .filter((product) => !product.inStock)
      .map((product) => ({ product, uses: uses.get(normalizeName(product.name)) ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.product.name.localeCompare(b.product.name, 'ru'))
      .slice(0, 24)
  }, [products, db.recipes])

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
            : `${atHome.length} продуктов${stale != null ? ` · обновляли ${stale === 0 ? 'сегодня' : `${daysWord(stale)} назад`}` : ''}`
        }
        actions={
          <button
            className="icon-btn"
            title="Подтвердить, что список актуален"
            aria-label="Список актуален"
            onClick={() => {
              updateSettings({ fridgeReviewedAt: nowIso() })
              toast('Отметили, что список актуален')
            }}
          >
            <IconCheck />
          </button>
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
          <Empty
            title="Холодильник пуст"
            text="Отметьте, что есть дома — приложение будет предлагать блюда из этих продуктов и вычитать их из списка покупок"
          />
        ) : (
          grouped.map(([group, items]) => (
            <div key={group}>
              <div className="group-title">{group}</div>
              <div className="card-flat">
                {items.map((product) => (
                  <div className="shop-item" key={product.id} onClick={() => setStock(product, false)}>
                    <input type="checkbox" readOnly checked />
                    <span className="grow shop-name">{product.name}</span>
                    <button
                      className="icon-btn"
                      aria-label="Убрать"
                      onClick={(event) => {
                        event.stopPropagation()
                        setStock(product, false)
                      }}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {common.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Обычно берём</h2>
              <span className="small muted">нажмите, чтобы добавить</span>
            </div>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {common.map(({ product }) => (
                <button key={product.id} className="chip" onClick={() => setStock(product, true)}>
                  {product.name}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="section stack">
          <button
            className="btn btn-block"
            onClick={() => {
              updateSettings({ fridgeReviewedAt: nowIso() })
              toast('Отметили, что список актуален')
            }}
          >
            <IconCheck size={16} /> Всё проверено
          </button>
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

/** Быстрое добавление продукта прямо из холодильника — без цены, её можно вписать позже. */
function QuickProduct({ name, onClose }: { name: string; onClose: () => void }) {
  const { saveProduct } = useStore()
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
        <div className={classNames('small', 'muted')}>Цену можно указать позже в каталоге продуктов</div>
        <div className="row">
          <button className="btn grow" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn-primary grow"
            disabled={!value.trim()}
            onClick={() => {
              saveProduct({
                name: value.trim(),
                group,
                unit: 'шт',
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
