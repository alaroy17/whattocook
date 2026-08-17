import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive, isPurged } from '../lib/db'
import {
  IconChart,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconRefresh,
  IconSettings,
  IconTag,
} from '../components/Icons'
import { USERS } from '../types'
import { Avatar, Confirm, toast } from '../components/ui'
import { classNames, countOf } from '../lib/util'

function MenuRow({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  onClick: () => void
}) {
  return (
    <div className="recipe-row" onClick={onClick}>
      <div className="menu-icon">{icon}</div>
      <div className="grow">
        <div className="recipe-title">{title}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <IconChevronRight size={18} style={{ color: 'var(--muted)' }} />
    </div>
  )
}

export function More() {
  const navigate = useNavigate()
  const { db, me, setMe, sync, identityLocked } = useStore()
  const [confirmSwap, setConfirmSwap] = useState(false)
  const partner = USERS.find((user) => user.id !== me)

  // Как в статистике: «доедаем» отдельной готовкой не считается.
  const entries = alive(db.entries).filter(
    (entry) => entry.status === 'done' && !entry.leftovers,
  ).length
  const products = alive(db.products).length
  // Второй привязанный человек — именно второй, а не всегда «Саша».
  const partnerName = USERS.find(
    (user) => user.id !== me && Boolean(db.settings.userEmails?.[user.id]),
  )?.name
  // В корзине показываются только блюда — записи дня возвращает отмена в тосте.
  const trashed = Object.values(db.recipes).filter(
    (item) => item.deletedAt && !isPurged(item, db.settings.purgedAt?.recipes),
  ).length

  return (
    <>
      <TopBar title="Ещё" showUser={false} />
      <main className="content">
        {/*
          Привязанный аккаунт: показываем, кто вы, без переключателей.
          «Это не я» — единственный выход, с явным подтверждением: раньше здесь
          была кнопка «Изменить», которая просто исчезала и ничего не объясняла.
        */}
        <div className="card">
          {identityLocked ? (
            <div className="row-between">
              <div className="row" style={{ gap: 10 }}>
                <Avatar id={me} large />
                <div>
                  <strong>{USERS.find((user) => user.id === me)?.name}</strong>
                  {sync.email && <div className="small muted">{sync.email}</div>}
                </div>
              </div>
              {partner && (
                <button className="btn btn-sm" onClick={() => setConfirmSwap(true)}>
                  Это не я
                </button>
              )}
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              {USERS.map((user) => (
                <button
                  key={user.id}
                  className={classNames('chip', 'chip-user', `chip-${user.id}`, me === user.id && 'active')}
                  onClick={() => setMe(user.id)}
                >
                  <Avatar id={user.id} />
                  {user.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="group-title">Кухня</div>
        <div className="card-flat">
          <MenuRow
            icon={<IconTag size={19} />}
            title="Продукты и цены"
            hint={countOf(products, 'product')}
            onClick={() => navigate('/more/products')}
          />
          <MenuRow
            icon={<IconChart size={19} />}
            title="Статистика"
            hint={countOf(entries, 'cooking')}
            onClick={() => navigate('/more/stats')}
          />
        </div>

        <div className="group-title">Приложение</div>
        <div className="card-flat">
          <MenuRow
            icon={<IconCloud size={19} />}
            title="Google Drive и доступ"
            hint={
              sync.status === 'unconfigured'
                ? 'не подключён'
                : sync.email
                  ? `${sync.email}${partnerName ? ` · и ${partnerName}` : ''}`
                  : 'подключение не завершено'
            }
            onClick={() => navigate('/more/settings')}
          />
          <MenuRow
            icon={<IconRefresh size={19} />}
            title="Корзина"
            hint={
              trashed === 0
                ? 'пусто'
                : `${countOf(trashed, 'dish')} можно вернуть`
            }
            onClick={() => navigate('/more/trash')}
          />
          <MenuRow
            icon={<IconClock size={19} />}
            title="История версий"
            hint="Копии базы на Диске"
            onClick={() => navigate('/more/history')}
          />
          <MenuRow
            icon={<IconSettings size={19} />}
            title="Настройки"
            onClick={() => navigate('/more/settings')}
          />
        </div>

        <div className="small muted" style={{ textAlign: 'center', marginTop: 22 }}>
          Что готовим · данные лежат в вашем Google Drive
        </div>
      </main>

      {confirmSwap && partner && (
        <Confirm
          title={`Вы — ${partner.name}?`}
          text={
            sync.email
              ? `Аккаунт ${sync.email} будет закреплён за «${partner.name}». Заметки и оценки с этого устройства пойдут от его имени.`
              : undefined
          }
          confirmLabel={`Да, я ${partner.name}`}
          onCancel={() => setConfirmSwap(false)}
          onConfirm={() => {
            setMe(partner.id)
            setConfirmSwap(false)
            toast(`Теперь вы — ${partner.name}`)
          }}
        />
      )}
    </>
  )
}
