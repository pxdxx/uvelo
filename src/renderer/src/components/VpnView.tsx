import { useEffect, useMemo, useState } from 'react'
import type { AppState, Server } from '@shared/types'
import Globe, { type GlobeMarker } from './Globe'
import ConnectPanel, { sortByPing } from './ConnectPanel'
import { COUNTRIES, distanceKm, factsFor, fmtDistance, localTime } from '../lib/countries'
import { fmtDuration, fmtSpeed, pingClass, PROTO_LABEL } from '../lib/format'
import { Flag } from './ui'
import { IcArrowDown, IcArrowUp, IcClose, IcGlobe } from './Icons'

function useNow(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

function CountryCard({ code, s, servers, onClose }: { code: string; s: AppState; servers: Server[]; onClose: () => void }) {
  useNow(15000)
  const c = COUNTRIES[code]
  const fact = useMemo(() => {
    const f = factsFor(code)
    return f[Math.floor(Math.random() * f.length)]
  }, [code])
  if (!c) return null
  const loc = s.location
  const km = loc?.lat != null && loc.lon != null ? distanceKm(loc.lat, loc.lon, c.lat, c.lon) : undefined
  const sorted = sortByPing(servers, s.pings)
  return (
    <div className="country-card" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cc-head">
        <Flag code={code} size={30} />
        <div className="cc-title">
          <div className="cc-name">{c.name}</div>
          {c.capital && <div className="muted">Столица: {c.capital}</div>}
        </div>
        <div className="cc-time">
          <div className="cc-clock">{localTime(c.tz)}</div>
          <div className="muted">там сейчас</div>
        </div>
        <button className="icon-btn cc-close" onClick={onClose}>
          <IcClose width={14} height={14} />
        </button>
      </div>
      {km !== undefined && (
        <p className="cc-line">
          <b>{fmtDistance(km)}</b> <span className="muted">от вас</span>
        </p>
      )}
      {sorted.length ? (
        <div className="cc-servers">
          {sorted.map((x) => {
            const p = s.pings[x.id]?.ms
            const live = x.id === s.connectedId && s.status === 'connected'
            return (
              <button key={x.id} className={'cc-srv' + (live ? ' live' : '')} onClick={() => window.uvelo.selectServer(x.id)}>
                <span className="cc-srv-name">{x.name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu, '')}</span>
                <span className="muted small">{PROTO_LABEL[x.protocol]}</span>
                <span className={'ping ' + pingClass(p)}>{p === undefined ? '·' : p < 0 ? 'нет' : `${p} мс`}</span>
                <span className="cc-go">{live ? 'активен' : s.status === 'connected' ? 'перейти' : 'выбрать'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="cc-line muted">
          <IcGlobe width={14} height={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Здесь серверов в вашей подписке пока нет.
        </p>
      )}
      {fact && <div className="cc-fact">{fact}</div>}
    </div>
  )
}

function StatusBlock({ s }: { s: AppState }) {
  useNow(1000)
  const conn = s.subs.flatMap((x) => x.servers).find((x) => x.id === s.connectedId)
  let title = 'Не подключено'
  let sub: React.ReactNode = (
    <>
      {s.location?.city || s.location?.country || 'Ваше местоположение'} · нажмите кнопку справа
    </>
  )
  if (s.status === 'connecting') {
    title = 'Подключение…'
    sub = conn ? conn.name : 'ищем лучший сервер'
  } else if (s.status === 'disconnecting') {
    title = 'Отключение…'
    sub = ''
  } else if (s.status === 'error') {
    title = 'Ошибка'
    sub = s.error === 'need-admin' ? 'для TUN нужны права администратора' : (s.error || '').split('\n')[0].slice(0, 120)
  } else if (s.status === 'connected') {
    title = 'Подключено'
    const where = s.exitInfo?.country || COUNTRIES[conn?.country || '']?.name || conn?.name
    sub = (
      <>
        {where}
        {s.exitInfo?.ip ? ` · ${s.exitInfo.ip}` : ''} · {fmtDuration(Date.now() - (s.connectedAt || Date.now()))}
        <span className="speed">
          <IcArrowDown width={13} height={13} /> {fmtSpeed(s.traffic.down)}
          <IcArrowUp width={13} height={13} /> {fmtSpeed(s.traffic.up)}
        </span>
      </>
    )
  }
  return (
    <div className={'status-block ' + s.status}>
      <h1>{title}</h1>
      <div className="status-sub">{sub}</div>
    </div>
  )
}

function AdminPrompt() {
  return (
    <div className="modal-back">
      <div className="modal">
        <h3>Нужны права администратора</h3>
        <p className="muted">
          Режим TUN создаёт виртуальный сетевой адаптер и пропускает через VPN весь трафик компьютера: игры, Discord и
          любые программы. Windows разрешает это только с правами администратора.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => window.uvelo.relaunchAsAdmin()}>
            Перезапустить от администратора
          </button>
          <button
            className="btn"
            onClick={async () => {
              await window.uvelo.setSettings({ connMode: 'system' })
              window.uvelo.connect()
            }}
          >
            Системный прокси
          </button>
          <button className="btn" onClick={() => window.uvelo.disconnect()}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VpnView({ s, visible }: { s: AppState; visible: boolean }) {
  const [card, setCard] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number; key: number }>()
  const sub = s.subs.find((x) => x.id === s.activeSubId) || s.subs[0]

  const byCountry = useMemo(() => {
    const m = new Map<string, Server[]>()
    for (const x of sub?.servers || []) {
      if (!x.country) continue
      const arr = m.get(x.country) || []
      arr.push(x)
      m.set(x.country, arr)
    }
    return m
  }, [sub])

  const markers: GlobeMarker[] = useMemo(
    () =>
      [...byCountry.entries()]
        .filter(([c]) => COUNTRIES[c])
        .map(([code, list]) => ({ code, lat: COUNTRIES[code].lat, lon: COUNTRIES[code].lon, count: list.length })),
    [byCountry]
  )

  const allServers = useMemo(() => s.subs.flatMap((x) => x.servers), [s.subs])
  const connServer = allServers.find((x) => x.id === s.connectedId)
  const connectedCode = (s.status === 'connected' || s.status === 'connecting') && connServer?.country ? connServer.country : undefined

  // при подключении - плавно поворачиваемся к стране сервера
  useEffect(() => {
    if (connectedCode && COUNTRIES[connectedCode]) {
      const c = COUNTRIES[connectedCode]
      const u = s.location
      const lat = u?.lat != null ? (c.lat + u.lat) / 2 : c.lat
      const lon = u?.lon != null ? (c.lon + u.lon) / 2 : c.lon
      setFocus({ lat, lon, key: Date.now() })
    }
  }, [connectedCode])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setCard(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const user = s.location?.lat != null && s.location.lon != null ? { lat: s.location.lat, lon: s.location.lon } : undefined

  return (
    <div className="vpn-view" style={{ display: visible ? undefined : 'none' }}>
      <Globe
        markers={markers}
        user={user}
        connectedCode={connectedCode}
        connecting={s.status === 'connecting'}
        selectedCode={card || undefined}
        focus={focus}
        rightInset={392}
        paused={!visible}
        onCountryClick={(code) => setCard(code)}
      />
      {card && <CountryCard code={card} s={s} servers={byCountry.get(card) || []} onClose={() => setCard(null)} />}
      <StatusBlock s={s} />
      <ConnectPanel s={s} />
      {s.status === 'error' && s.error === 'need-admin' && <AdminPrompt />}
    </div>
  )
}
