import { useStore } from '../lib/store'
import { Avatar, Sheet } from './ui'
import { USERS } from '../types'

/**
 * Спрашиваем один раз: чей это Google-аккаунт. Дальше приложение узнаёт человека
 * по почте само — и на его телефоне, и на любом другом устройстве с тем же аккаунтом.
 */
export function IdentityPrompt() {
  const { sync, setMe } = useStore()

  return (
    <Sheet title="Кто вы?" onClose={() => undefined} dismissible={false}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Вошли как <strong>{sync.email}</strong>. Скажите один раз, чей это аккаунт — дальше
        приложение будет узнавать вас само, и переключать вручную не придётся.
      </p>
      <div className="stack" style={{ marginTop: 14 }}>
        {USERS.map((user) => (
          <button
            key={user.id}
            className="btn btn-block"
            style={{ justifyContent: 'flex-start', gap: 12, padding: 14 }}
            onClick={() => setMe(user.id)}
          >
            <Avatar id={user.id} large />
            <span style={{ fontSize: 16 }}>{user.name}</span>
          </button>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 12 }}>
        Ошиблись — поменять можно в разделе «Ещё».
      </div>
    </Sheet>
  )
}
