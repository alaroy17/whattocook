import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { IconChevronLeft } from './Icons'
import { classNames } from '../lib/util'
import { USERS } from '../types'

const SYNC_TEXT: Record<string, string> = {
  unconfigured: 'Google Drive не подключён',
  offline: 'Только на этом устройстве',
  idle: 'Синхронизировано',
  syncing: 'Синхронизация…',
  error: 'Ошибка синхронизации',
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
  const { me, setMe, sync } = useStore()

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
      {showUser && (
        <button
          className="chip"
          onClick={() => setMe(me === 'sasha' ? 'andrei' : 'sasha')}
          title="Кто сейчас пользуется приложением"
        >
          {USERS.find((u) => u.id === me)?.name}
        </button>
      )}
    </header>
  )
}
