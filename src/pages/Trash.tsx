import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { Confirm, Empty, toast } from '../components/ui'
import { IconRefresh, IconTrash } from '../components/Icons'
import { formatDate } from '../lib/date'
import { TOMBSTONE_DAYS, type Recipe } from '../types'
import { countOf, daysWord } from '../lib/util'
import { discardPhoto } from '../lib/photos'

/*
 * В корзине — только блюда. Записи дня сюда не попадают: их возвращает отмена
 * в тосте сразу после удаления, а потерянная запись пересоздаётся в два нажатия.
 * Потерянный рецепт — с ингредиентами, шагами и фото — так просто не вернёшь.
 */
export function Trash() {
  const { db, restore, purge } = useStore()
  const [confirmPurge, setConfirmPurge] = useState(false)

  const items = useMemo<Recipe[]>(
    () =>
      (Object.values(db.recipes) as Recipe[])
        .filter((recipe) => recipe.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [db.recipes],
  )

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
        subtitle={items.length === 0 ? 'пусто' : countOf(items.length, 'dish')}
      />
      <main className="content">
        {items.length === 0 ? (
          <Empty
            title="Корзина пуста"
            text={`Удалённые блюда хранятся ${daysWord(TOMBSTONE_DAYS)}, и всё это время их можно вернуть`}
          />
        ) : (
          <>
            <div className="card-flat">
              {items.map((recipe) => (
                <div className="shop-item" key={recipe.id} style={{ cursor: 'default' }}>
                  <span className="grow shop-name">
                    {recipe.name}
                    <div className="small muted">
                      {recipe.category} · удалено {formatDate(recipe.deletedAt!.slice(0, 10))} · останется{' '}
                      {daysWord(daysLeft(recipe.deletedAt!))}
                    </div>
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      restore('recipes', recipe.id)
                      toast(`«${recipe.name}» восстановлено`)
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
          text="Удалённое исчезнет навсегда — и у вас, и у второго человека. Отменить это будет нельзя."
          confirmLabel="Очистить"
          onCancel={() => setConfirmPurge(false)}
          onConfirm={() => {
            // Фотографии удалённых блюд иначе остались бы на Диске без владельца.
            for (const recipe of Object.values(db.recipes)) {
              if (recipe.deletedAt && recipe.photoId) void discardPhoto(recipe.photoId)
            }
            /*
             * Чистим только то, что корзина показывает, — рецепты. Скрытые надгробия
             * записей и продуктов живут для синхронизации: их стирание воскрешало
             * удалённые продукты (материализация пересоздавала имя) и двигало
             * водяной знак очистки в «сегодня».
             */
            purge('recipes')
            setConfirmPurge(false)
            toast('Корзина очищена')
          }}
        />
      )}
    </>
  )
}
