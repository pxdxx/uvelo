import type { ReactNode } from 'react'
import { flagUrl } from '../lib/countries'
import { IcGlobe } from './Icons'

export function Flag({ code, size = 26 }: { code?: string; size?: number }) {
  const url = flagUrl(code)
  return url ? (
    <img className="flag" src={url} width={size} height={size} alt={code} draggable={false} />
  ) : (
    <span className="flag flag-unknown" style={{ width: size, height: size }}>
      <IcGlobe width={size * 0.6} height={size * 0.6} />
    </span>
  )
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      className={'toggle' + (on ? ' on' : '')}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    >
      <span />
    </button>
  )
}

export function Row({ title, desc, children, onClick }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  return (
    <div className={'row' + (onClick ? ' clickable' : '')} onClick={onClick}>
      <div className="row-text">
        <div className="row-title">{title}</div>
        {desc && <div className="row-desc">{desc}</div>}
      </div>
      {children && <div className="row-ctl">{children}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'active' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
