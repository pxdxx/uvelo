import { useState } from 'react'
import type { AppRule, AppState, RoutingMode, RuleAct, Settings } from '@shared/types'
import { SERVICES, serviceOn } from '@shared/services'
import { Toggle } from '../components/ui'
import ServiceIcon from '../components/ServiceIcon'
import { IcClose, IcPlus } from '../components/Icons'

const ROUTES: { v: RoutingMode; title: string; desc: string }[] = [
  { v: 'smart', title: 'Умный', desc: 'Российские сайты напрямую и быстро, зарубежные через VPN' },
  { v: 'global', title: 'Всё через VPN', desc: 'Весь трафик компьютера идёт через сервер' },
  { v: 'selected', title: 'Только выбранные', desc: 'Через VPN только сервисы и сайты справа, остальное напрямую' }
]

const ACTS: { v: RuleAct; label: string }[] = [
  { v: 'proxy', label: 'VPN' },
  { v: 'direct', label: 'Напрямую' },
  { v: 'block', label: 'Блок' }
]

const SITE_KEYS: Record<RuleAct, keyof Settings> = { proxy: 'proxyDomains', direct: 'directDomains', block: 'blockDomains' }

const splitList = (t: string) =>
  t
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** приводит ввод к домену: убирает схему, путь, порт, www */
function normalizeSite(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  if (!v) return null
  if (v.startsWith('keyword:')) return v.length > 8 ? v : null
  v = v.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]
  if (/^[\d.]+(\/\d+)?$/.test(v) || v.includes(':')) return v // IP, подсеть или IPv6
  v = v.replace(/:\d+$/, '').replace(/^\*?\./, '').replace(/^www\./, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) || /^xn--/.test(v) ? v : null
}

function MiniSeg({ value, onChange }: { value: RuleAct; onChange: (v: RuleAct) => void }) {
  return (
    <div className="mini-seg">
      {ACTS.map((a) => (
        <button key={a.v} className={value === a.v ? 'active ' + a.v : ''} onClick={() => onChange(a.v)}>
          {a.label}
        </button>
      ))}
    </div>
  )
}

function Sites({ st, set }: { st: Settings; set: (p: Partial<Settings>) => void }) {
  const [v, setV] = useState('')
  const [act, setAct] = useState<RuleAct>(st.routing === 'global' ? 'direct' : 'proxy')
  const [bad, setBad] = useState(false)
  const all = ACTS.flatMap((a) => splitList(String(st[SITE_KEYS[a.v]] || '')).map((d) => ({ d, act: a.v })))

  const add = () => {
    const d = normalizeSite(v)
    if (!d) return setBad(true)
    // сайт может быть только в одном списке
    const p: Partial<Settings> = {}
    for (const a of ACTS) {
      const list = splitList(String(st[SITE_KEYS[a.v]] || '')).filter((x) => x !== d)
      if (a.v === act) list.push(d)
      ;(p as any)[SITE_KEYS[a.v]] = list.join('\n')
    }
    set(p)
    setV('')
  }
  const remove = (d: string, a: RuleAct) =>
    set({ [SITE_KEYS[a]]: splitList(String(st[SITE_KEYS[a]] || '')).filter((x) => x !== d).join('\n') } as Partial<Settings>)

  const hint =
    act === 'proxy'
      ? 'Добавленные сайты всегда идут через VPN, вместе с их поддоменами.'
      : act === 'direct'
        ? 'Добавленные сайты всегда идут напрямую, вместе с их поддоменами.'
        : 'Добавленные сайты блокируются, вместе с их поддоменами.'

  return (
    <div className="mcard">
      <div className="mcard-head">
        <div className="mcard-title">Свои сайты</div>
        <MiniSeg value={act} onChange={setAct} />
      </div>
      <div className="mcard-desc">{hint}</div>
      <div className={'site-add' + (bad ? ' bad' : '')}>
        <input
          value={v}
          placeholder="например, twitch.tv"
          spellCheck={false}
          onChange={(e) => {
            setV(e.target.value)
            setBad(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="site-add-btn" onClick={add} disabled={!v.trim()} title="Добавить">
          <IcPlus width={18} height={18} />
        </button>
      </div>
      {all.length > 0 && (
        <div className="site-chips">
          {all.map(({ d, act: a }) => (
            <span key={a + d} className={'site-chip ' + a} title={ACTS.find((x) => x.v === a)!.label}>
              <i />
              {d}
              <button onClick={() => remove(d, a)} title="Убрать">
                <IcClose width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Apps({ st, set }: { st: Settings; set: (p: Partial<Settings>) => void }) {
  const apps = st.apps || []
  const update = (i: number, p: Partial<AppRule> | null) =>
    set({ apps: p ? apps.map((a, j) => (j === i ? { ...a, ...p } : a)) : apps.filter((_, j) => j !== i) })
  const pick = async () => {
    const a = await window.uvelo.pickApp()
    if (!a) return
    const i = apps.findIndex((x) => (x.path && x.path === a.path) || x.exe.toLowerCase() === a.exe.toLowerCase())
    if (i >= 0) return update(i, { path: a.path, icon: a.icon })
    set({ apps: [...apps, a] })
  }
  return (
    <div className="mcard">
      <div className="mcard-title">Программы</div>
      <div className="mcard-desc">Программа из списка идёт так, как вы выбрали, при любом режиме и для любых сайтов.</div>
      <div className="inset">
        {apps.map((a, i) => (
          <div key={(a.path || a.exe) + i} className="app-row">
            {a.icon ? <img src={a.icon} alt="" /> : <span className="app-noicon">{a.exe.slice(0, 1).toUpperCase()}</span>}
            <div className="app-name" title={a.path || a.exe}>
              {a.exe.replace(/\.exe$/i, '')}
            </div>
            <MiniSeg value={a.act} onChange={(act) => update(i, { act })} />
            <button className="app-del" onClick={() => update(i, null)} title="Убрать">
              <IcClose width={13} height={13} />
            </button>
          </div>
        ))}
        <button className="app-add" onClick={pick}>
          <IcPlus width={16} height={16} /> Добавить программу
        </button>
      </div>
    </div>
  )
}

export default function ModePage({ s }: { s: AppState }) {
  const st = s.settings
  const set = (p: Partial<Settings>) => window.uvelo.setSettings(p)
  const selected = st.routing === 'selected'
  const services = SERVICES.filter((x) => !x.selectedOnly || selected)
  const tun = st.connMode === 'tun'

  return (
    <div className="page mode-page">
      <h2>Режим</h2>
      <p className="page-desc">Что идёт через VPN, а что напрямую: сервисы, сайты и программы. Применяется сразу.</p>

      <div className="mode-grid">
        <div className="mode-col">
          <div className="mcard">
            <div className="mcard-title">Как пускать трафик</div>
            <div className="route-list">
              {ROUTES.map((r) => (
                <button key={r.v} className={'route-opt' + (st.routing === r.v ? ' active' : '')} onClick={() => set({ routing: r.v })}>
                  <span className="radio" />
                  <span>
                    <span className="route-title">{r.title}</span>
                    <span className="route-desc">{r.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mcard-row">
              <span>
                <span className="mcard-row-title">Блокировать рекламу и трекеры</span>
              </span>
              <Toggle on={st.blockAds} onChange={(v) => set({ blockAds: v })} />
            </div>
          </div>

          <div className="mcard">
            <div className="mcard-title">Режим TUN</div>
            <div className="mcard-desc">
              Без TUN через VPN идут браузеры и программы, которые слушают системный прокси. С TUN весь компьютер: игры, Discord, торренты,
              любые программы.
            </div>
            <div className="mcard-row">
              <span className={'tun-badge' + (tun ? ' on' : '')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="5" rx="1.5" />
                  <rect x="3" y="16" width="6" height="5" rx="1.5" />
                  <rect x="15" y="16" width="6" height="5" rx="1.5" />
                  <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
                </svg>
              </span>
              <span className="mcard-row-title">{tun ? 'Включён' : 'Выключен'}</span>
              <Toggle on={tun} onChange={(v) => set({ connMode: v ? 'tun' : 'system' })} />
            </div>
          </div>

          <Apps st={st} set={set} />
        </div>

        <div className="mode-col">
          <div className="mcard">
            <div className="mcard-title">Через VPN</div>
            <div className="mcard-desc">
              {selected ? 'Через VPN идут только включённые сервисы и ваши сайты, остальное напрямую.' : 'Выключенные сервисы идут напрямую, без VPN.'}
            </div>
            <div className="svc-grid">
              {services.map((x) => {
                const on = serviceOn(x, st.services)
                return (
                  <div key={x.id} className="svc" onClick={() => set({ services: { ...st.services, [x.id]: !on } })}>
                    <ServiceIcon id={x.id} />
                    <div className="svc-text">
                      <div className="svc-name">{x.name}</div>
                      <div className="svc-desc" title={x.desc}>
                        {x.desc}
                      </div>
                    </div>
                    <Toggle on={on} onChange={(v) => set({ services: { ...st.services, [x.id]: v } })} />
                  </div>
                )
              })}
            </div>
          </div>

          <Sites st={st} set={set} />
        </div>
      </div>
    </div>
  )
}
