import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose, IconFemale, IconMale, IconSearch, IconStar, IconUsers } from './Icons'
import { classNames } from '../lib/util'
import { USERS, userName } from '../types'

export function Sheet({
  title,
  onClose,
  children,
  actions,
  dismissible = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  /** false — окно требует ответа: без крестика, клика по фону и Escape. */
  dismissible?: boolean
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose, dismissible])

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => dismissible && event.target === event.currentTarget && onClose()}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          {dismissible && (
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
              <IconClose />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="small muted">{hint}</div>}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="search">
      <IconSearch />
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          key={option.id}
          className={classNames('chip', value === option.id && 'active')}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.id}
          className={classNames(value === option.id && 'active')}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: number | undefined
  onChange?: (value: number) => void
  size?: number
}) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={classNames((value ?? 0) >= n && 'on')}
          onClick={onChange ? () => onChange(value === n ? 0 : n) : undefined}
          disabled={!onChange}
          aria-label={`Оценка ${n}`}
        >
          <IconStar size={size} filled={(value ?? 0) >= n} />
        </button>
      ))}
    </span>
  )
}

/**
 * Аватар пользователя: у каждого свой цвет и своя фигура,
 * чтобы в календаре и списках было видно с одного взгляда, кто это.
 */
export function Avatar({
  id,
  large,
  withName,
}: {
  id: string | undefined
  large?: boolean
  withName?: boolean
}) {
  const user = USERS.find((u) => u.id === id)
  const kind = user ? user.id : id === 'outside' ? 'outside' : 'both'
  const size = large ? 20 : 15

  const glyph = user ? (
    user.figure === 'female' ? (
      <IconFemale size={size} />
    ) : (
      <IconMale size={size} />
    )
  ) : id === 'outside' ? (
    <IconClose size={size} />
  ) : (
    <IconUsers size={size} />
  )

  const badge = (
    <span
      className={classNames('avatar', `avatar-${kind}`, large && 'avatar-lg')}
      title={userName(id)}
      aria-label={userName(id)}
    >
      {glyph}
    </span>
  )

  if (!withName) return badge
  return (
    <span className="row" style={{ gap: 7 }}>
      {badge}
      <span>{userName(id)}</span>
    </span>
  )
}

export function UserPicker({
  value,
  onChange,
  allowBoth,
  allowAny,
}: {
  value: string | undefined
  onChange: (value: string) => void
  allowBoth?: boolean
  allowAny?: boolean
}) {
  const options: { id: string; label: string; avatar?: boolean }[] = []
  if (allowAny) options.push({ id: 'any', label: 'Любой' })
  for (const user of USERS) options.push({ id: user.id, label: user.name, avatar: true })
  if (allowBoth) options.push({ id: 'both', label: 'Вместе', avatar: true })
  if (allowBoth) options.push({ id: 'outside', label: 'Не готовили' })
  return (
    <div className="chips wrap">
      {options.map((option) => (
        <button
          key={option.id}
          className={classNames('chip', 'chip-user', `chip-${option.id}`, value === option.id && 'active')}
          onClick={() => onChange(option.id)}
        >
          {option.avatar && <Avatar id={option.id} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <div className="small">{text}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function Confirm({
  title,
  text,
  confirmLabel = 'Удалить',
  onConfirm,
  onCancel,
}: {
  title: string
  text?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      {text && <p className="muted" style={{ marginTop: 0 }}>{text}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn grow" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn btn-primary grow" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

/** Простые всплывающие сообщения без внешних зависимостей. */
interface ToastPayload {
  text: string
  action?: { label: string; onClick: () => void }
}

let toastSetter: ((payload: ToastPayload | null) => void) | null = null

export function toast(text: string, action?: ToastPayload['action']): void {
  toastSetter?.({ text, action })
}

export function ToastHost() {
  const [payload, setPayload] = useState<ToastPayload | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    toastSetter = (next) => {
      setPayload(next)
      if (timer.current) clearTimeout(timer.current)
      if (next) {
        // С кнопкой держим дольше — на неё надо успеть нажать.
        timer.current = setTimeout(() => setPayload(null), next.action ? 8000 : 2600)
      }
    }
    return () => {
      toastSetter = null
    }
  }, [])

  if (!payload) return null
  return (
    <div className="toast">
      <span>{payload.text}</span>
      {payload.action && (
        <button
          className="toast-action"
          onClick={() => {
            payload.action?.onClick()
            setPayload(null)
          }}
        >
          {payload.action.label}
        </button>
      )}
    </div>
  )
}
