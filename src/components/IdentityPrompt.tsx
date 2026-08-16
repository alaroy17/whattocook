import { useStore } from '../lib/store'
import { Avatar, Sheet } from './ui'
import { USERS } from '../types'

/**
 * Спрашиваем один раз: чей это Google-аккаунт. Дальше приложение узнаёт человека
 * по почте само — и на его телефоне, и на любом другом устройстве с тем же аккаунтом.
 */
export function IdentityPrompt() {
  const { sync, setMe, disconnect } = useStore()

  return (
    <Sheet title="Кто вы?" onClose={() => undefined} dismissible={false}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Чей аккаунт <strong>{sync.email}</strong>?
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
      {/* Без этой кнопки вход не тем аккаунтом превращается в тупик: окно перекрывает всё. */}
      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={disconnect}>
        Это не мой аккаунт
      </button>
    </Sheet>
  )
}
