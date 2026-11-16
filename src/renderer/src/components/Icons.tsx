import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const mk = (children: ReactNode, opts: { fill?: boolean; sw?: number } = {}) =>
  function Icon(p: P) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke={opts.fill ? 'none' : 'currentColor'}
        strokeWidth={opts.sw ?? 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...p}
      >
        {children}
      </svg>
    )
  }

/** Общий градиент в цветах логотипа: используется через url(#uvGrad) */
export function GradientDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="uvGrad" gradientUnits="userSpaceOnUse" x1="2" y1="3" x2="22" y2="21">
          <stop offset="0" stopColor="#ffa53a" />
          <stop offset="0.35" stopColor="#ff5f8f" />
          <stop offset="0.68" stopColor="#c46bff" />
          <stop offset="1" stopColor="#4fb2ff" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ---- навигация: мягкие, скруглённые формы ---- */

export const IcShield = mk(
  <path d="M12 2.9c2.4 1.5 4.9 2.3 7.3 2.5.6.1 1 .5 1 1.1v4.9c0 4.9-3.3 8.8-7.9 10.2a1.4 1.4 0 0 1-.8 0C7 20.2 3.7 16.3 3.7 11.4V6.5c0-.6.4-1 1-1.1C7.1 5.2 9.6 4.4 12 2.9Z" />,
  { fill: true }
)

export const IcMode = mk(
  <>
    <rect x="2.8" y="4.6" width="18.4" height="6" rx="3" />
    <circle cx="17.2" cy="7.6" r="1.6" fill="currentColor" stroke="none" />
    <rect x="2.8" y="13.4" width="18.4" height="6" rx="3" />
    <circle cx="6.8" cy="16.4" r="1.6" fill="currentColor" stroke="none" />
  </>
)

export const IcSubs = mk(
  <>
    <rect x="3.2" y="8.6" width="17.6" height="11.6" rx="3.6" />
    <path d="M6 5.6h12" />
    <path d="M8.6 2.9h6.8" />
    <circle cx="8.2" cy="14.4" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 14.4h4.6" />
  </>
)

export const IcGear = mk(
  <>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
    <circle cx="12" cy="12" r="3" />
  </>
)

export const IcLogs = mk(
  <>
    <rect x="3.5" y="3" width="17" height="18" rx="4.5" />
    <path d="M8 8.5h8" />
    <path d="M8 12h8" />
    <path d="M8 15.5h4.5" />
  </>
)

/* ---- заголовок окна ---- */

export const IcPin = mk(
  <>
    <path d="M12 17v4.6" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
  </>
)
export const IcMin = mk(<path d="M5 12h14" />)
export const IcMax = mk(<rect x="5" y="5" width="14" height="14" rx="3" />)
export const IcClose = mk(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </>
)

/* ---- действия ---- */

export const IcRefresh = mk(
  <>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
    <path d="M4 3v5h5" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
    <path d="M20 21v-5h-5" />
  </>
)
/** спидометр: проверка пинга */
export const IcGauge = mk(
  <>
    <path d="M4.2 17.5a9 9 0 1 1 15.6 0" />
    <path d="m12 13.5 4-4.5" />
    <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
  </>
)
export const IcPlus = mk(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
)
export const IcClipboard = mk(
  <>
    <rect x="8.5" y="2.8" width="7" height="4" rx="1.5" />
    <path d="M15.5 4.8h1.7a2 2 0 0 1 2 2v12.4a2 2 0 0 1-2 2H6.8a2 2 0 0 1-2-2V6.8a2 2 0 0 1 2-2h1.7" />
  </>
)
export const IcTrash = mk(
  <>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </>
)
export const IcEdit = mk(
  <>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </>
)
export const IcCopy = mk(
  <>
    <rect x="9" y="9" width="12" height="12" rx="3" />
    <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
  </>
)
export const IcExternal = mk(
  <>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </>
)
export const IcChevron = mk(<path d="m6 9 6 6 6-6" />)
export const IcBolt = mk(<path d="M13.2 2.6 5 13.2a.8.8 0 0 0 .6 1.3H11l-1 6.9c-.1.7.8 1.1 1.3.5l8.2-10.6a.8.8 0 0 0-.6-1.3H13.6l.9-6.9c.1-.7-.8-1.1-1.3-.5Z" />, { fill: true })
export const IcGlobe = mk(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </>
)
export const IcFolder = mk(<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />)
export const IcCheck = mk(<path d="m5 12.5 4.5 4.5L19 7.5" />, { sw: 2.2 })
export const IcArrowDown = mk(
  <>
    <path d="M12 5v14" />
    <path d="m6 13 6 6 6-6" />
  </>
)
export const IcArrowUp = mk(
  <>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </>
)
