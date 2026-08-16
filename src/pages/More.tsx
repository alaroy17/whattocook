import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import {
  IconBook,
  IconChart,
  IconChevronRight,
  IconClock,
  IconCloud,
  IconRefresh,
  IconSettings,
  IconTag,
} from '../components/Icons'
import { USERS } from '../types'
import { Avatar } from '../components/ui'
import { classNames, pluralRu } from '../lib/util'

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

  const recipes = alive(db.recipes).length
  const entries = alive(db.entries).filter((entry) => entry.status === 'done').length
  const products = alive(db.products).length
  const accountsBound = Object.values(db.settings.userEmails ?? {}).filter(Boolean).length
  const trashed = [db.recipes, db.entries, db.products, db.comments].reduce(
    (sum, collection) => sum + Object.values(collection).filter((item) => item.deletedAt).length,
    0,
  )

  return (
    <>
      <TopBar title="Ещё" showUser={false} />
      <main className="content">
        <div className="card">
          <div className="small muted">Сейчас в приложении</div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
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
          <div className="small muted" style={{ marginTop: 8 }}>
            {identityLocked && sync.email
              ? `Аккаунт ${sync.email} закреплён за этим человеком — на другом устройстве с тем же входом вас узнают автоматически`
              : 'От этого зависит, чьи заметки и оценки вы оставляете'}
          </div>
        </div>

        <div className="group-title">Кухня</div>
        <div className="card-flat">
          <MenuRow
            icon={<IconBook size={19} />}
            title="Рецепты"
            hint={`${recipes} ${pluralRu(recipes, ['блюдо', 'блюда', 'блюд'])}`}
            onClick={() => navigate('/recipes')}
          />
          <MenuRow
            icon={<IconTag size={19} />}
            title="Продукты и цены"
            hint={`${products} в каталоге`}
            onClick={() => navigate('/more/products')}
          />
          <MenuRow
            icon={<IconChart size={19} />}
            title="Статистика"
            hint={`${entries} приготовлений`}
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
                  ? `${sync.email}${accountsBound > 1 ? ' · и Саша' : ''}`
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
                : `${trashed} ${pluralRu(trashed, ['запись', 'записи', 'записей'])} можно вернуть`
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
    </>
  )
}
