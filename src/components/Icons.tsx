/** Единый набор тонких линейных иконок. Без эмодзи. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
  </Base>
)

export const IconPhone = (p: IconProps) => (
  <Base {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 5.5h3" />
    <path d="M12 18.2v.01" />
  </Base>
)

export const IconBook = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
    <path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5z" />
    <path d="M9 7.5h6" />
  </Base>
)

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
  </Base>
)

export const IconList = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="m4 6.2.9.9L6.8 5.2M4 11.7l.9.9L6.8 10.7M4 17.2l.9.9 1.9-1.9" />
  </Base>
)

export const IconMore = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </Base>
)

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const IconMinus = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
)

export const IconSearch = (p: IconProps) => (
  <Base size={17} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Base>
)

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
)

export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </Base>
)

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </Base>
)

export const IconStar = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Base size={18} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="m12 4 2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 6.9 19l1.1-5.5L4 9.7 9.6 9z" />
  </Base>
)

export const IconHeart = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Base fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="M12 19.5c-4.5-3-7.5-5.8-7.5-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7.5 2.7c0 3.4-3 6.2-7.5 9.2z" />
  </Base>
)

export const IconClock = (p: IconProps) => (
  <Base size={15} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 1.8" />
  </Base>
)

export const IconDice = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Base>
)

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11.5a8 8 0 1 0-.7 4.8" />
    <path d="M20 5.5v6h-6" />
  </Base>
)

export const IconCart = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
    <circle cx="10" cy="19.5" r="1.2" />
    <circle cx="17" cy="19.5" r="1.2" />
  </Base>
)

export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3.5" height="6" rx="1" />
    <rect x="12" y="6.5" width="3.5" height="10.5" rx="1" />
  </Base>
)

export const IconFridge = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="3" width="12" height="18" rx="2.5" />
    <path d="M6 10h12M9 6.5v2M9 13v2.5" />
  </Base>
)

export const IconTag = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 11V5a1 1 0 0 1 1-1h6l8.5 8.5a1.5 1.5 0 0 1 0 2.1l-4.9 4.9a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8.2" cy="8.2" r="1.2" />
  </Base>
)

export const IconEdit = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="m14.5 5.5 4 4" />
  </Base>
)

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 6.5h15M9 6.5V4.5h6v2M6.5 6.5 7.5 20h9l1-13.5" />
  </Base>
)

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
)

export const IconCloud = (p: IconProps) => (
  <Base {...p}>
    <path d="M7.5 18.5a4 4 0 0 1-.3-8 5.2 5.2 0 0 1 10 1.1 3.4 3.4 0 0 1-.7 6.9z" />
  </Base>
)

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
  </Base>
)

export const IconPhoto = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m4.5 17 4.5-4.5 3.5 3.5 3-2.5 4 3.5" />
  </Base>
)

export const IconPot = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 10h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
    <path d="M3.5 10h17M8 10V8M12 10V7M16 10V8" />
  </Base>
)

/* Аватары-котики рисует components/AvatarArt.tsx — во весь круг, заливкой. */

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </Base>
)

export const IconImport = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5v10" />
    <path d="m8.2 10 3.8 3.8L15.8 10" />
    <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Base>
)

export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6.5h16L14 13v5.5l-4 2V13z" />
  </Base>
)

export const IconRepeat = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 9.5A3.5 3.5 0 0 1 8.5 6H18M18 6l-2.5-2.5M18 6l-2.5 2.5" />
    <path d="M19 14.5a3.5 3.5 0 0 1-3.5 3.5H6M6 18l2.5 2.5M6 18l2.5-2.5" />
  </Base>
)

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Base>
)

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 4.6M17.5 14.4a5.5 5.5 0 0 1 3 4.6" />
  </Base>
)
