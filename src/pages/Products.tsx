import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import { PRODUCT_GROUPS, UNITS, type Product } from '../types'
import { Confirm, Empty, Field, SearchInput, Sheet, toast } from '../components/ui'
import { IconPlus, IconTrash } from '../components/Icons'
import { SwipeRow } from '../components/SwipeRow'
import { countOf, formatMoney, normalizeName, nowIso } from '../lib/util'

export function Products() {
  const { db, remove, restore } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)

  const products = useMemo(
    () => alive(db.products).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [db.products],
  )

  const filtered = useMemo(() => {
    const query = normalizeName(search)
    return query ? products.filter((product) => normalizeName(product.name).includes(query)) : products
  }, [products, search])

  /** Каталог группируется по отделам магазина — как холодильник и список покупок. */
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const product of filtered) {
      const list = map.get(product.group) ?? []
      list.push(product)
      map.set(product.group, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
  }, [filtered])

  /** Ингредиенты из рецептов, которых ещё нет в каталоге — их удобно добавить одним нажатием. */
  const missing = useMemo(() => {
    const known = new Set(products.map((product) => normalizeName(product.name)))
    const result = new Map<string, { name: string; unit: string; count: number }>()
    for (const recipe of alive(db.recipes)) {
      for (const ingredient of recipe.ingredients) {
        const key = normalizeName(ingredient.name)
        if (!key || known.has(key)) continue
        const existing = result.get(key)
        if (existing) existing.count++
        else result.set(key, { name: ingredient.name, unit: ingredient.unit, count: 1 })
      }
    }
    return [...result.values()].sort((a, b) => b.count - a.count)
  }, [db.recipes, products])

  const withoutPrice = products.filter((product) => product.price == null).length

  return (
    <>
      <TopBar
        title="Продукты и цены"
        back
        showUser={false}
        subtitle={`${countOf(products.length, 'product')}${withoutPrice > 0 ? ` · без цены: ${withoutPrice}` : ''}`}
      />
      <main className="content">
        <SearchInput value={search} onChange={setSearch} placeholder="Название продукта" />

        {filtered.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <Empty
              title="Каталог пуст"
              text="Добавьте продукты — тогда приложение посчитает стоимость блюд и соберёт список покупок"
              action={
                <button className="btn btn-primary" onClick={() => setEditing('new')}>
                  <IconPlus size={16} /> Добавить продукт
                </button>
              }
            />
          </div>
        ) : (
          grouped.map(([group, items]) => (
            <div key={group}>
              <div className="group-title">{group}</div>
              <div className="card-flat">
                {items.map((product) => (
                  <SwipeRow
                    key={product.id}
                    actions={[
                      { label: 'Изменить', kind: 'normal', onClick: () => setEditing(product) },
                      {
                        label: 'Удалить',
                        kind: 'danger',
                        onClick: () => {
                          remove('products', product.id)
                          toast(`«${product.name}» удалён`, {
                            label: 'Отменить',
                            onClick: () => restore('products', product.id),
                          })
                        },
                      },
                    ]}
                  >
                    <div className="shop-item" onClick={() => setEditing(product)}>
                      <span
                        className="sync-dot"
                        style={{ background: product.inStock ? 'var(--good)' : 'var(--border-strong)' }}
                        title={product.inStock ? 'Есть дома' : 'Нет дома'}
                      />
                      <span className="grow shop-name">{product.name}</span>
                      <span className="small muted">
                        {product.price != null
                          ? `${formatMoney(product.price * (product.unit === 'г' || product.unit === 'мл' ? 1000 : 1), db.settings.currency)} / ${
                              product.unit === 'г' ? 'кг' : product.unit === 'мл' ? 'л' : product.unit
                            }`
                          : 'без цены'}
                      </span>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            </div>
          ))
        )}

        {missing.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Есть в рецептах, но не в каталоге</h2>
            </div>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {missing.slice(0, 40).map((item) => (
                <button
                  key={item.name}
                  className="chip"
                  onClick={() =>
                    setEditing({
                      id: '',
                      name: item.name,
                      unit: item.unit,
                      group: 'Прочее',
                      price: null,
                      createdAt: '',
                      updatedAt: '',
                    } as Product)
                  }
                >
                  {item.name} <span className="muted">· {item.count}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <button className="fab" onClick={() => setEditing('new')} aria-label="Добавить продукт">
        <IconPlus size={24} />
      </button>

      {editing && (
        <ProductEditor
          product={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { db, saveProduct, remove, restore } = useStore()
  const [name, setName] = useState(product?.name ?? '')
  const [group, setGroup] = useState<string>(product?.group ?? 'Прочее')
  const [unit, setUnit] = useState(product?.unit ?? 'г')
  const [packQty, setPackQty] = useState(product?.packQty?.toString() ?? '')
  const [packPrice, setPackPrice] = useState(product?.packPrice?.toString() ?? '')
  const [inStock, setInStock] = useState(Boolean(product?.inStock))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const qty = Number(packQty.replace(',', '.'))
  const total = Number(packPrice.replace(',', '.'))
  /*
   * Цену держим только пока поля упаковки заполнены: раньше при очистке полей
   * подставлялась прежняя цена, и стереть её из интерфейса было невозможно.
   */
  const unitPrice = qty > 0 && total > 0 ? total / qty : null
  const needsQty = total > 0 && !(qty > 0)

  const existingId = product?.id || undefined

  const submit = () => {
    if (!name.trim()) {
      toast('Впишите название продукта')
      return
    }
    saveProduct({
      id: existingId,
      name: name.trim(),
      group,
      unit,
      packQty: qty > 0 ? qty : null,
      packPrice: total > 0 ? total : null,
      price: unitPrice,
      inStock,
      stockUpdatedAt: nowIso(),
    })
    onClose()
  }

  return (
    <>
      <Sheet
        title={existingId ? 'Продукт' : 'Новый продукт'}
        onClose={onClose}
        actions={
          existingId ? (
            <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Удалить">
              <IconTrash />
            </button>
          ) : undefined
        }
      >
        <div className="stack">
          <Field label="Название">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>

          <div className="row">
            <div className="grow">
              <Field label="Отдел в магазине">
                <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
                  {PRODUCT_GROUPS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ width: 110 }}>
              <Field label="Единица">
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="row">
            <div className="grow">
              {/* Формулировка одна на все единицы: «сколько упаковок в упаковке» — цирк */}
              <Field label={unit ? `Сколько покупаем, ${unit}` : 'Сколько покупаем'}>
                <input
                  className="input"
                  inputMode="decimal"
                  value={packQty}
                  onChange={(e) => setPackQty(e.target.value.replace(/[^\d.,]/g, ''))}
                />
              </Field>
            </div>
            <div className="grow">
              <Field label={`Цена за это, ${db.settings.currency}`}>
                <input
                  className="input"
                  inputMode="decimal"
                  value={packPrice}
                  onChange={(e) => setPackPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                />
              </Field>
            </div>
          </div>

          {needsQty && (
            <div className="small muted">
              Укажите количество{unit ? ` в ${unit}` : ''}, иначе цену не посчитать
            </div>
          )}
          {unitPrice != null && (
            <div className="small muted">
              Получается {formatMoney(unitPrice * (unit === 'г' || unit === 'мл' ? 1000 : 1), db.settings.currency)} за{' '}
              {unit === 'г' ? 'кг' : unit === 'мл' ? 'л' : unit}
            </div>
          )}

          <label className="switch">
            <span>Есть дома</span>
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          </label>

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn grow" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-primary grow" onClick={submit}>
              Сохранить
            </button>
          </div>
        </div>
      </Sheet>

      {confirmDelete && existingId && (
        <Confirm
          title="Удалить продукт?"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            remove('products', existingId)
            onClose()
            toast(`«${name.trim()}» удалён`, {
              label: 'Отменить',
              onClick: () => restore('products', existingId),
            })
          }}
        />
      )}
    </>
  )
}
