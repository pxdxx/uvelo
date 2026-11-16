import { useMemo, useState } from 'react'
import type { AppState, Server } from '@shared/types'
import logo from '../assets/logo.png'
import { COUNTRIES, plural } from '../lib/countries'
import { daysLeft, fmtBytes, pingClass, PROTO_LABEL } from '../lib/format'
import { Flag, Toggle } from './ui'
import { IcBolt, IcCheck, IcClipboard, IcClose, IcGauge, IcPlus, IcRefresh } from './Icons'

export function sortByPing(servers: Server[], pings: AppState['pings']) {
  const score = (s: Server) => {
    const p = pings[s.id]
    if (!p) return 50000
    return p.ms > 0 ? p.ms : 100000
  }
  return [...servers].sort((a, b) => score(a) - score(b))
}

const stripFlag = (n: string) => n.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu, '')

function PingLabel({ ms, pinging }: { ms?: number; pinging: boolean }) {
  if (ms === undefined) return <span className="ping p-none">{pinging ? '···' : '·'}</span>
  if (ms < 0) return <span className="ping p-dead">нет</span>
  return <span className={'ping ' + pingClass(ms)}>{ms} мс</span>
}

/** Форма добавления подписки прямо в панели */
function AddSub({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const add = async (fromClipboard: boolean) => {
    setBusy(true)
    setErr('')
    const r = fromClipboard ? await window.uvelo.addFromClipboard() : await window.uvelo.addSub(text)
    setBusy(false)
    if (!r.ok) setErr(r.error || 'Ошибка')
    else {
      setText('')
      onClose?.()
    }
  }
  return (
    <div className={'add-sub' + (compact ? ' compact' : '')}>
      {!compact && <img src={logo} className="empty-logo" alt="" />}
      <div className="add-sub-head">
        <h3>{compact ? 'Новая подписка' : 'Добавьте подписку'}</h3>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="Закрыть">
            <IcClose width={15} height={15} />
          </button>
        )}
      </div>
      <p className="muted">Ссылка на подписку или сервер: vless://, vmess://, trojan://, ss://, hy2://…</p>
      <textarea
        autoFocus={compact}
        placeholder="https://… или vless://…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (text.trim()) add(false)
          }
        }}
        rows={3}
      />
      {err && <div className="err-text">{err}</div>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => add(false)}>
          <IcPlus width={16} height={16} /> {busy ? 'Загрузка…' : 'Добавить'}
        </button>
        <button className="btn" disabled={busy} onClick={() => add(true)}>
          <IcClipboard width={16} height={16} /> Из буфера
        </button>
      </div>
    </div>
  )
}

export default function ConnectPanel({ s }: { s: AppState }) {
  const [adding, setAdding] = useState(false)
  const [updating, setUpdating] = useState(false)
  const sub = s.subs.find((x) => x.id === s.activeSubId) || s.subs[0]
  const servers = useMemo(() => sortByPing(sub?.servers || [], s.pings), [sub, s.pings])
  const st = s.settings
  const on = s.status === 'connected'
  const busy = s.status === 'connecting' || s.status === 'disconnecting'
  const connected = s.subs.flatMap((x) => x.servers).find((x) => x.id === s.connectedId)
  const selected = s.selectedId === 'auto' ? undefined : servers.find((x) => x.id === s.selectedId)

  const toggle = () => (on || s.status === 'connecting' ? window.uvelo.disconnect() : window.uvelo.connect())

  let title: string
  let subtitle: string
  if (connected && (on || busy)) {
    title = stripFlag(connected.name)
    subtitle = `${COUNTRIES[connected.country || '']?.name || PROTO_LABEL[connected.protocol]} · ${s.engine || ''}`
  } else if (s.selectedId === 'auto') {
    title = 'Лучший пинг'
    subtitle = 'выберет самый быстрый сервер'
  } else {
    title = selected ? stripFlag(selected.name) : 'Сервер'
    subtitle = selected ? PROTO_LABEL[selected.protocol] + (selected.country ? ' · ' + (COUNTRIES[selected.country]?.name || '') : '') : ''
  }

  const info = sub?.info
  const used = (info?.upload || 0) + (info?.download || 0)
  const days = daysLeft(info?.expire)

  const refreshSub = async () => {
    if (!sub?.url || updating) return
    setUpdating(true)
    await window.uvelo.updateSub(sub.id)
    setUpdating(false)
  }

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-sub">
          <span className="panel-sub-name">{sub ? sub.name : 'Uvelo'}</span>
          {days !== undefined && (
            <span className={'muted' + (days <= 3 ? ' warn' : '')}>
              {' '}· <b>{days > 0 ? `${days} ${plural(days, 'день', 'дня', 'дней')}` : 'истекла'}</b>
            </span>
          )}
        </div>
        <div className="panel-head-right">
          {sub && (
            <span className="chip" title="Трафик подписки">
              {info?.total
                ? `${fmtBytes(used)} / ${fmtBytes(info.total)}`
                : `${sub.servers.length} ${plural(sub.servers.length, 'сервер', 'сервера', 'серверов')}`}
            </span>
          )}
          {sub && (
            <button className={'round-btn' + (adding ? ' active' : '')} title="Добавить подписку" onClick={() => setAdding(!adding)}>
              <IcPlus width={16} height={16} />
            </button>
          )}
        </div>
      </div>

      {s.subs.length > 1 && (
        <div className="sub-tabs">
          {s.subs.map((x) => (
            <button
              key={x.id}
              className={'sub-tab' + (x.id === sub?.id ? ' active' : '')}
              onClick={() => window.uvelo.selectSub(x.id)}
              title={`${x.name} · ${x.servers.length}`}
            >
              <span>{x.name}</span>
              <small>{x.servers.length}</small>
            </button>
          ))}
        </div>
      )}

      {adding && sub && (
        <div className="add-overlay">
          <AddSub compact onClose={() => setAdding(false)} />
        </div>
      )}

      {!sub ? (
        <div className="empty-panel">
          <AddSub />
        </div>
      ) : (
        <>
          <div className="power-wrap">
            <button className={`power ${s.status}`} onClick={toggle} disabled={s.status === 'disconnecting'} title={on ? 'Отключить' : 'Подключить'}>
              <span className="power-ring" />
              <span className="power-core">
                <img src={logo} alt="" draggable={false} />
              </span>
            </button>
            <div className="power-title" title={title}>
              {title}
            </div>
            <div className="power-sub">{subtitle}</div>
          </div>

          <div className="list-head">
            <span>Серверы</span>
            <div className="list-actions">
              <button className={'icon-btn grad' + (s.pinging ? ' pulse' : '')} title="Проверить пинг всех серверов" onClick={() => window.uvelo.pingAll()}>
                <IcGauge width={16} height={16} />
              </button>
              {sub.url && (
                <button className={'icon-btn grad' + (updating ? ' spin' : '')} title="Обновить серверы подписки" onClick={refreshSub}>
                  <IcRefresh width={15} height={15} />
                </button>
              )}
            </div>
          </div>
          <div className="server-list">
            <button className={'srv auto' + (s.selectedId === 'auto' ? ' selected' : '')} onClick={() => window.uvelo.selectServer('auto')}>
              <span className="flag flag-auto">
                <IcBolt width={14} height={14} />
              </span>
              <span className="srv-name">
                Лучший пинг
                <small>автовыбор</small>
              </span>
              {s.selectedId === 'auto' && <IcCheck width={16} height={16} className="srv-check" />}
            </button>
            {servers.map((x) => (
              <button
                key={x.id}
                className={'srv' + (x.id === s.selectedId ? ' selected' : '') + (x.id === s.connectedId && on ? ' live' : '')}
                onClick={() => window.uvelo.selectServer(x.id)}
                title={`${x.name}\n${PROTO_LABEL[x.protocol]} · ${x.address}:${x.port}`}
              >
                <Flag code={x.country} />
                <span className="srv-name">
                  {stripFlag(x.name)}
                  <small>{PROTO_LABEL[x.protocol]}</small>
                </span>
                <PingLabel ms={s.pings[x.id]?.ms} pinging={s.pinging} />
              </button>
            ))}
          </div>

          <div className="panel-toggles">
            <div className="tg-row">
              <div>
                <div className="tg-title">Автопилот</div>
                <div className="tg-desc">сам переключит, если сервер упал</div>
              </div>
              <Toggle on={st.autopilot} onChange={(v) => window.uvelo.setSettings({ autopilot: v })} />
            </div>
            <div className="tg-row">
              <div>
                <div className="tg-title">Лучший пинг</div>
                <div className="tg-desc">подключаться к самому быстрому</div>
              </div>
              <Toggle on={s.selectedId === 'auto'} onChange={(v) => window.uvelo.setSettings({ bestPing: v })} />
            </div>
            <div className="tg-row">
              <div>
                <div className="tg-title">Режим TUN</div>
                <div className="tg-desc">весь компьютер: игры, Discord, программы</div>
              </div>
              <Toggle on={st.connMode === 'tun'} onChange={(v) => window.uvelo.setSettings({ connMode: v ? 'tun' : 'system' })} />
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
