import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore, type Collection } from '../lib/store'
import { Confirm, Empty, toast } from '../components/ui'
import { IconRefresh, IconTrash } from '../components/Icons'
import { formatDate } from '../lib/date'
import { MEAL_SLOTS, type Comment, type Entry, type Product, type Recipe, type Syncable } from '../types'
import { daysWord, pluralRu } from '../lib/util'

/** Через сколько дней удалённое вычищается окончательно — совпадает с pruneTombstones. */
const KEEP_DAYS = 120

interface TrashItem {
  collection: Collection
  id: string
  title: string
  detail: string
  deletedAt: string
}

export function Trash() {
  const { db, restore, purge } = useStore()
  const [confirmPurge, setConfirmPurge] = useState(false)

  const items = useMemo<TrashItem[]>(() => {
    const result: TrashItem[] = []

    const push = (collection: Collection, item: Syncable, title: string, detail: string) => {
      if (!item.deletedAt) return
      result.push({ collection, id: item.id, title, detail, deletedAt: item.deletedAt })
    }

    for (const recipe of Object.values(db.recipes) as Recipe[]) {
      push('recipes', recipe, recipe.name, `Блюдо · ${recipe.category}`)
    }
    for (const entry of Object.values(db.entries) as Entry[]) {
      const name = entry.recipeId ? db.recipes[entry.recipeId]?.name : entry.title
      const meal = MEAL_SLOTS.find((slot) => slot.id === entry.meal)?.name
      push('entries', entry, name ?? 'Запись', `Запись · ${formatDate(entry.date)} · ${meal}`)
    }
    for (const product of Object.values(db.products) as Product[]) {
      push('products', product, product.name, `Продукт · ${product.group}`)
    }
    for (const comment of Object.values(db.comments) as Comment[]) {
      const recipe = db.recipes[comment.recipeId]?.name
      push('comments', comment, comment.text.slice(0, 60), `Заметка${recipe ? ` · ${recipe}` : ''}`)
    }

    return result.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }, [db])

  const daysLeft = (deletedAt: string) => {
    const passed = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000)
    return Math.max(0, KEEP_DAYS - passed)
  }

  return (
    <>
      <TopBar
        title="Корзина"
        back
        showUser={false}
        subtitle={
          items.length === 0
            ? 'пусто'
            : `${items.length} ${pluralRu(items.length, ['запись', 'записи', 'записей'])}`
        }
      />
      <main className="content">
        {items.length === 0 ? (
          <Empty
            title="Корзина пуста"
            text={`Удалённое хранится ${daysWord(KEEP_DAYS)} и всё это время его можно вернуть`}
          />
        ) : (
          <>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Удалённое хранится {daysWord(KEEP_DAYS)}, потом исчезает совсем. Восстановление
              вернёт запись и на устройстве второго человека.
            </div>

            <div className="card-flat">
              {items.map((item) => (
                <div className="shop-item" key={`${item.collection}:${item.id}`} style={{ cursor: 'default' }}>
                  <span className="grow shop-name">
                    {item.title}
                    <div className="small muted">
                      {item.detail} · удалено {formatDate(item.deletedAt.slice(0, 10))} · останется{' '}
                      {daysWord(daysLeft(item.deletedAt))}
                    </div>
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      restore(item.collection, item.id)
                      toast(`«${item.title}» восстановлено`)
                    }}
                  >
                    <IconRefresh size={15} /> Вернуть
                  </button>
                </div>
              ))}
            </div>

            <section className="section">
              <button className="btn btn-danger btn-block" onClick={() => setConfirmPurge(true)}>
                <IconTrash size={16} /> Очистить корзину
              </button>
            </section>
          </>
        )}
      </main>

      {confirmPurge && (
        <Confirm
          title="Очистить корзину?"
          text="Записи исчезнут навсегда — и у вас, и у второго человека. Отменить это будет нельзя."
          confirmLabel="Очистить"
          onCancel={() => setConfirmPurge(false)}
          onConfirm={() => {
            purge()
            setConfirmPurge(false)
            toast('Корзина очищена')
          }}
        />
      )}
    </>
  )
}
