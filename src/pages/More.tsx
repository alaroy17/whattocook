import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useStore } from '../lib/store'
import { alive } from '../lib/db'
import {
  IconBook,
  IconChart,
  IconChevronRight,
  IconCloud,
  IconFridge,
  IconSettings,
  IconTag,
} from '../components/Icons'
import { USERS } from '../types'
import { Avatar } from '../components/ui'

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
      <div className="thumb" style={{ width: 38, height: 38 }}>
        {icon}
      </div>
      <div className="grow">
        <div className="recipe-title">{title}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <IconChevronRight size={18} />
    </div>
  )
}

export function More() {
  const navigate = useNavigate()
  const { db, me, setMe, sync } = useStore()

  const recipes = alive(db.recipes).length
  const entries = alive(db.entries).filter((entry) => entry.status === 'done').length
  const products = alive(db.products).length
  const inStock = alive(db.products).filter((product) => product.inStock).length

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
                className={me === user.id ? 'chip active' : 'chip'}
                onClick={() => setMe(user.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <Avatar id={user.id} />
                {user.name}
              </button>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            От этого зависит, чьи заметки и оценки вы оставляете
          </div>
        </div>

        <div className="card-flat" style={{ marginTop: 14 }}>
          <MenuRow
            icon={<IconBook size={19} />}
            title="Рецепты"
            hint={`${recipes} блюд · поиск, фильтры, добавление`}
            onClick={() => navigate('/recipes')}
          />
          <MenuRow
            icon={<IconChart size={19} />}
            title="Статистика"
            hint={`${entries} приготовлений`}
            onClick={() => navigate('/more/stats')}
          />
          <MenuRow
            icon={<IconTag size={19} />}
            title="Продукты и цены"
            hint={`${products} в каталоге`}
            onClick={() => navigate('/more/products')}
          />
          <MenuRow
            icon={<IconFridge size={19} />}
            title="Что есть дома"
            hint={`${inStock} отмечено в наличии`}
            onClick={() => navigate('/fridge')}
          />
          <MenuRow
            icon={<IconCloud size={19} />}
            title="Google Drive"
            hint={sync.email ?? (sync.status === 'unconfigured' ? 'не подключён' : 'подключение не завершено')}
            onClick={() => navigate('/more/settings')}
          />
          <MenuRow
            icon={<IconSettings size={19} />}
            title="Настройки"
            hint="Подсказки, тема, экспорт данных"
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
