import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore, type Collection } from '../lib/store'
import { Confirm, Empty, toast } from '../components/ui'
import { IconRefresh, IconTrash } from '../components/Icons'
import { formatDate } from '../lib/date'
import {
  MEAL_SLOTS,
  TOMBSTONE_DAYS,
  type Comment,
  type Entry,
  type Product,
  type Recipe,
  type Syncable,
} from '../types'
import { countOf, daysWord } from '../lib/util'
import { discardPhoto } from '../lib/photos'

interface TrashItem {
  collection: Collection
  id: string
  title: string
  detail: string
  deletedAt: string
  /** Блюдо этой записи тоже в корзине — вернуть надо оба. */
  orphanRecipeId?: string
}

export function Trash() {
  const { db, restore, purge } = useStore()
  const [confirmPurge, setConfirmPurge] = useState(false)

  const items = useMemo<TrashItem[]>(() => {
    const result: TrashItem[] = []

    const push = (
      collection: Collection,
      item: Syncable,
      title: string,
      detail: string,
      orphanRecipeId?: string,
    ) => {
      if (!item.deletedAt) return
      result.push({ collection, id: item.id, title, detail, deletedAt: item.deletedAt, orphanRecipeId })
    }

    for (const recipe of Object.values(db.recipes) as Recipe[]) {
      push('recipes', recipe, recipe.name, `Блюдо · ${recipe.category}`)
    }
    for (const entry of Object.values(db.entries) as Entry[]) {
      const recipe = entry.recipeId ? db.recipes[entry.recipeId] : undefined
      const meal = MEAL_SLOTS.find((slot) => slot.id === entry.meal)?.name
      push(
        'entries',
        entry,
        recipe?.name ?? entry.title ?? 'Запись',
        `Запись · ${formatDate(entry.date)} · ${meal}`,
        recipe?.deletedAt ? recipe.id : undefined,
      )
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
    return Math.max(0, TOMBSTONE_DAYS - passed)
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
            : countOf(items.length, 'entry')
        }
      />
      <main className="content">
        {items.length === 0 ? (
          <Empty
            title="Корзина пуста"
            text={`Удалённое хранится ${daysWord(TOMBSTONE_DAYS)} и всё это время его можно вернуть`}
          />
        ) : (
          <>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Удалённое хранится {daysWord(TOMBSTONE_DAYS)}, потом исчезает совсем. Восстановление
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
                      // Запись календаря без своего блюда показывалась бы как «Без названия».
                      if (item.orphanRecipeId) restore('recipes', item.orphanRecipeId)
                      toast(
                        item.orphanRecipeId
                          ? `«${item.title}» восстановлено вместе с блюдом`
                          : `«${item.title}» восстановлено`,
                      )
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
            // Фотографии удалённых блюд иначе остались бы на Диске без владельца.
            for (const recipe of Object.values(db.recipes)) {
              if (recipe.deletedAt && recipe.photoId) void discardPhoto(recipe.photoId)
            }
            purge()
            setConfirmPurge(false)
            toast('Корзина очищена')
          }}
        />
      )}
    </>
  )
}
