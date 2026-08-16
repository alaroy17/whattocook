import { useId } from 'react'

/**
 * Аватары-котики во весь круг, плоской заливкой.
 *
 * Не контурная иконка внутри кружка, а сама картинка-кружок: фон, крупная морда
 * до краёв, уши уходят к верхнему краю и мягко обрезаются кругом. Черты — вырезы
 * цветом фона, поэтому в тёмной теме всё работает само. У кошки бантик стоит
 * в промежутке между ушами и ничего не перекрывает.
 */

type Variant = 'sasha' | 'andrei' | 'both' | 'outside'

const COLORS: Record<'sasha' | 'andrei', { main: string; soft: string }> = {
  sasha: { main: 'var(--sasha)', soft: 'var(--sasha-soft)' },
  andrei: { main: 'var(--andrei)', soft: 'var(--andrei-soft)' },
}

function CatFace({ main, soft, bow }: { main: string; soft: string; bow?: boolean }) {
  return (
    <>
      {/* уши по бокам, между ними виден фон — как у нормальных котов */}
      <path d="M8 19 6.5 3 20 12z" fill={main} />
      <path d="M40 19 41.5 3 28 12z" fill={main} />
      {/* голова до краёв круга: щёки почти касаются, подбородок обрезается */}
      <ellipse cx="24" cy="30" rx="20" ry="17.5" fill={main} />
      {/* глаза */}
      <circle cx="16.4" cy="28.4" r="3" fill={soft} />
      <circle cx="31.6" cy="28.4" r="3" fill={soft} />
      {/* нос и улыбка */}
      <path d="M21.2 33.4h5.6L24 36.8z" fill={soft} />
      <path
        d="M18.8 39.8c1.6 1.4 3.4 2.1 5.2 2.1s3.6-.7 5.2-2.1"
        fill="none"
        stroke={soft}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* бантик кошки — на макушке между ушами, оба уха свободны */}
      {bow && (
        <g fill={soft}>
          <path d="M24 16 18.5 13.4 19.5 19.4z" />
          <path d="M24 16 29.5 13.4 28.5 19.4z" />
          <circle cx="24" cy="16" r="2" />
        </g>
      )}
    </>
  )
}

function Paw() {
  return (
    <g fill="var(--text-2)">
      <ellipse cx="24" cy="30.5" rx="8.6" ry="7.2" />
      <ellipse cx="11.8" cy="22.5" rx="3.5" ry="4.4" transform="rotate(-18 11.8 22.5)" />
      <ellipse cx="36.2" cy="22.5" rx="3.5" ry="4.4" transform="rotate(18 36.2 22.5)" />
      <ellipse cx="18.6" cy="15.4" rx="3.6" ry="4.6" transform="rotate(-8 18.6 15.4)" />
      <ellipse cx="29.4" cy="15.4" rx="3.6" ry="4.6" transform="rotate(8 29.4 15.4)" />
    </g>
  )
}

export function AvatarArt({ variant }: { variant: Variant }) {
  const clipId = useId()

  let content
  if (variant === 'sasha' || variant === 'andrei') {
    const { main, soft } = COLORS[variant]
    content = (
      <>
        <rect width="48" height="48" fill={soft} />
        <CatFace main={main} soft={soft} bow={variant === 'sasha'} />
      </>
    )
  } else if (variant === 'both') {
    content = (
      <>
        <rect width="24" height="48" fill="var(--sasha-soft)" />
        <rect x="24" width="24" height="48" fill="var(--andrei-soft)" />
        <Paw />
      </>
    )
  } else {
    content = (
      <>
        <rect width="48" height="48" fill="var(--bg-soft)" />
        <path
          d="M17 17l14 14M31 17 17 31"
          stroke="var(--muted)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </>
    )
  }

  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-hidden="true">
      <clipPath id={clipId}>
        <circle cx="24" cy="24" r="24" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{content}</g>
    </svg>
  )
}
