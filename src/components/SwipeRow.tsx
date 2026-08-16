import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { classNames } from '../lib/util'

/**
 * Строка со скрытыми действиями: смахнул влево — появились «Изменить» и «Удалить».
 * Работает и пальцем, и мышью. Вертикальная прокрутка не блокируется (touch-action: pan-y).
 */

export interface SwipeAction {
  label: string
  kind: 'normal' | 'danger'
  onClick: () => void
}

const ACTION_WIDTH = 76
/** Одновременно открыта только одна строка — как в любом нормальном списке. */
let counter = 0
const CLOSE_EVENT = 'wtc-swipe-open'

export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const id = useRef(++counter)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; offset: number } | null>(null)
  const moved = useRef(false)
  const width = actions.length * ACTION_WIDTH

  useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== id.current) setOffset(0)
    }
    window.addEventListener(CLOSE_EVENT, onOpen)
    return () => window.removeEventListener(CLOSE_EVENT, onOpen)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: event.clientX, y: event.clientY, offset }
    moved.current = false
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (!dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return
      setDragging(true)
      moved.current = true
      window.dispatchEvent(new CustomEvent(CLOSE_EVENT, { detail: id.current }))
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* синтетические события в тестах */
      }
    }
    setOffset(Math.min(0, Math.max(-width, start.current.offset + dx)))
  }

  const finish = () => {
    if (start.current && dragging) {
      setOffset((current) => (current < -width / 2 ? -width : 0))
    }
    start.current = null
    setDragging(false)
  }

  return (
    <div className="swipe-row">
      <div className="swipe-actions" style={{ width }}>
        {actions.map((action) => (
          <button
            key={action.label}
            className={classNames('swipe-action', action.kind === 'danger' && 'danger')}
            style={{ width: ACTION_WIDTH }}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              setOffset(0)
              action.onClick()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          // Тап по сдвинутой строке закрывает её, а не срабатывает как нажатие.
          if (moved.current || offset !== 0) {
            event.preventDefault()
            event.stopPropagation()
            setOffset(0)
            moved.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
