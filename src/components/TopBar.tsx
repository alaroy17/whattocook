import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { IconChevronLeft } from './Icons'
import { Avatar } from './ui'
import { classNames } from '../lib/util'
import { USERS } from '../types'

const SYNC_TEXT: Record<string, string> = {
  unconfigured: 'Google Drive не подключён',
  offline: 'Только на этом устройстве',
  idle: 'Синхронизировано',
  syncing: 'Синхронизация…',
  error: 'Ошибка синхронизации',
  'no-database': 'База на Диске не найдена',
}

export function TopBar({
  title,
  subtitle,
  back,
  actions,
  showUser = true,
}: {
  title: string
  subtitle?: string
  back?: boolean
  actions?: ReactNode
  showUser?: boolean
}) {
  const navigate = useNavigate()
  const { me, setMe, sync, identityLocked } = useStore()
  const name = USERS.find((user) => user.id === me)?.name

  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Назад">
          <IconChevronLeft />
        </button>
      )}
      <h1>
        {title}
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
        {!subtitle && (
          <div className="topbar-sub row" style={{ gap: 5 }}>
            <span className={classNames('sync-dot', sync.status)} />
            {SYNC_TEXT[sync.status]}
          </div>
        )}
      </h1>
      {actions}
      {showUser &&
        (identityLocked ? (
          // Аккаунт Google уже сказал, кто это, — менять нечего.
          <span className="chip chip-user" title={sync.email ?? undefined}>
            <Avatar id={me} />
            {name}
          </span>
        ) : (
          <button
            className="chip chip-user"
            onClick={() => setMe(me === 'sasha' ? 'andrei' : 'sasha')}
            title="Кто сейчас пользуется приложением"
          >
            <Avatar id={me} />
            {name}
          </button>
        ))}
    </header>
  )
}
