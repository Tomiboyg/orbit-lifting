/** Original icon set — one consistent 24px grid, 1.75 stroke. */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Base({ children, ...props }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: P) => (
  <Base {...p}>
    <path d="M4 11.2 12 4.5l8 6.7" />
    <path d="M6 10v9h12v-9" />
  </Base>
)

export const IconHistory = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.8 1.8" />
  </Base>
)

export const IconDumbbell = (p: P) => (
  <Base {...p}>
    <path d="M3 9.5v5M6 7.5v9M18 7.5v9M21 9.5v5M6 12h12" />
  </Base>
)

export const IconChart = (p: P) => (
  <Base {...p}>
    <path d="M4.5 19.5h15" />
    <path d="M7 19.5V12M12 19.5V6.5M17 19.5V9.5" />
  </Base>
)

export const IconInsights = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(-24 12 12)" />
  </Base>
)

export const IconSettings = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.8v2.4M12 17.8v2.4M4.6 8.1l2.1 1.2M17.3 14.7l2.1 1.2M4.6 15.9l2.1-1.2M17.3 9.3l2.1-1.2" />
  </Base>
)

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const IconMinus = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
)

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
)

export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
)

export const IconChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="m14.5 5.5-7 6.5 7 6.5" />
  </Base>
)

export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9.5 5.5 7 6.5-7 6.5" />
  </Base>
)

export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Base>
)

export const IconTimer = (p: P) => (
  <Base {...p}>
    <path d="M9 2.8h6" />
    <circle cx="12" cy="13.5" r="7.2" />
    <path d="M12 13.5V9.8" />
  </Base>
)

export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8h5v1.7M6.5 6.5 7.5 20h9l1-13.5" />
  </Base>
)

export const IconUndo = (p: P) => (
  <Base {...p}>
    <path d="M8.5 5.5 4.5 9.5l4 4" />
    <path d="M4.5 9.5h9.5a5.5 5.5 0 1 1 0 11H9" />
  </Base>
)

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 4.5 4.5" />
  </Base>
)

export const IconLibrary = (p: P) => (
  <Base {...p}>
    <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
    <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" />
  </Base>
)

export const IconArrowUp = (p: P) => (
  <Base {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
)

export const IconArrowDown = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Base>
)

export const IconExport = (p: P) => (
  <Base {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </Base>
)

export const IconGrip = (p: P) => (
  <Base {...p}>
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" strokeWidth="2.5" />
  </Base>
)

export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 4.5 21 19.5H3L12 4.5Z" />
    <path d="M12 10v4M12 16.8h.01" />
  </Base>
)
